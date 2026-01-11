
import React, { useState, useEffect, useRef } from 'react';
import Card from './common/Card';
import Button from './common/Button';
import { ChartBarIcon, ShieldCheckIcon, UserCircleIcon, UploadIcon, TrashIcon, TagIcon, PencilIcon } from './common/icons';
import { generateAnalyticsReport } from '../services/geminiService';
import { getAllTransactions } from '../services/paymentService';
import { supabase } from '../services/supabase';
import { uploadUserFile } from '../services/storageService';
import { marked } from 'marked';
import { fileToDataUri } from '../utils';
import type { User, UserType, AdBanner } from '../types';

interface AdminDashboardProps {
  user: User | null;
  onLogin: (user: User) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogin }) => {
  // Auth State
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [regRole, setRegRole] = useState<'admin' | 'agent'>('agent');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Dashboard State
  const [reportInput, setReportInput] = useState('');
  const [reportResult, setReportResult] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  // Ad Banner Management State
  const [adBanners, setAdBanners] = useState<AdBanner[]>([]);
  const [newAd, setNewAd] = useState<Partial<AdBanner>>({ title: '', text: '', color: 'bg-green-50 border-green-100' });
  const [adImage, setAdImage] = useState<File | null>(null);
  const [adImagePreview, setAdImagePreview] = useState<string | null>(null);
  const [isUploadingAd, setIsUploadingAd] = useState(false);
  const adFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      if (user && (user.type === 'admin' || user.type === 'agent')) {
          fetchAdBanners();
      }
  }, [user]);

  const fetchAdBanners = async () => {
      const { data } = await supabase.from('settings').select('value').eq('id', 'ad_banners').single();
      if (data?.value?.banners) {
          setAdBanners(data.value.banners);
      }
  };

  const handleFetchLiveStats = async () => {
      try {
          const transactions = await getAllTransactions();
          if (transactions) {
              setReportInput(JSON.stringify(transactions, null, 2));
          }
      } catch (error) {
          console.error(error);
          alert("Failed to fetch transactions");
      }
  };

  const handleGenerateReport = async () => {
      if (!reportInput) return;
      setReportLoading(true);
      try {
          const report = await generateAnalyticsReport(reportInput);
          setReportResult(report);
      } catch (error) {
          console.error(error);
          setReportResult("Error generating report.");
      } finally {
          setReportLoading(false);
      }
  };

  const handleAddBanner = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user?.uid || !newAd.title || !newAd.text) return;
      
      setIsUploadingAd(true);
      try {
          let imageUrl = '';
          if (adImage) {
              const res = await uploadUserFile(user.uid, adImage, 'misc', '', `Ad Banner: ${newAd.title}`);
              imageUrl = res.file_url;
          }

          const banner: AdBanner = {
              id: Date.now(),
              title: newAd.title!,
              text: newAd.text!,
              color: newAd.color || 'bg-green-50 border-green-100',
              imageUrl: imageUrl,
              isActive: true
          };

          const updatedBanners = [banner, ...adBanners];
          
          // Save to Supabase Settings
          const { error } = await supabase.from('settings').upsert({ 
              id: 'ad_banners', 
              value: { banners: updatedBanners } 
          });

          if (error) throw error;

          setAdBanners(updatedBanners);
          setNewAd({ title: '', text: '', color: 'bg-green-50 border-green-100' });
          setAdImage(null);
          setAdImagePreview(null);
          alert("Ad Banner Published!");

      } catch (error: any) {
          console.error("Ad upload failed:", error);
          alert("Failed to publish ad.");
      } finally {
          setIsUploadingAd(false);
      }
  };

  const handleDeleteBanner = async (id: string | number) => {
      if (!window.confirm("Remove this banner?")) return;
      const updatedBanners = adBanners.filter(ad => ad.id !== id);
      
      const { error } = await supabase.from('settings').upsert({ 
          id: 'ad_banners', 
          value: { banners: updatedBanners } 
      });

      if (!error) {
          setAdBanners(updatedBanners);
      }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthLoading(true);
      setAuthError('');

      try {
          if (authMode === 'LOGIN') {
              const { data, error } = await supabase.auth.signInWithPassword({ email, password });
              if (error) throw error;
              
              if (data.user) {
                  // Fetch profile
                  const { data: profile, error: profileError } = await supabase
                      .from('users')
                      .select('*')
                      .eq('id', data.user.id)
                      .single();
                  
                  if (profile) {
                      onLogin({ ...profile, uid: data.user.id } as User);
                  } else {
                      // Fallback if profile doesn't exist yet, try metadata
                      const metaType = data.user.user_metadata?.user_type as UserType;
                      const userType = (metaType === 'admin' || metaType === 'agent') ? metaType : 'admin'; // Default fallback

                      onLogin({ 
                          uid: data.user.id, 
                          email: data.user.email!, 
                          name: data.user.user_metadata.full_name || 'Admin', 
                          type: userType 
                      } as User);
                  }
              }
          } else {
              // Register
              const { data, error } = await supabase.auth.signUp({
                  email,
                  password,
                  options: {
                      data: {
                          full_name: name,
                          phone: phone,
                          user_type: regRole
                      }
                  }
              });
              if (error) throw error;

              if (data.user) {
                  const newUser = {
                      id: data.user.id,
                      name,
                      email,
                      phone,
                      type: regRole,
                      merchant_id: `${regRole.toUpperCase()}-${Date.now()}`
                  };
                  // Manually insert to ensure it exists immediately
                  await supabase.from('users').upsert([newUser]);
                  
                  onLogin({ ...newUser, uid: data.user.id } as User);
              }
          }
      } catch (err: any) {
          setAuthError(err.message || 'Authentication failed');
      } finally {
          setAuthLoading(false);
      }
  };

  // 1. Not Logged In -> Show Admin/Agent Login/Register
  if (!user) {
      return (
          <div className="max-w-md mx-auto mt-10 animate-fade-in">
              <Card className="bg-white border-t-4 border-blue-600 shadow-xl">
                  <div className="text-center mb-6">
                      <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 text-blue-700">
                          <ShieldCheckIcon className="w-8 h-8" />
                      </div>
                      <h2 className="text-2xl font-bold text-gray-900">Executive Portal</h2>
                      <p className="text-sm text-gray-500">Restricted Access for Admins & Reporting Agents</p>
                  </div>

                  {authError && (
                      <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm text-center">
                          {authError}
                      </div>
                  )}

                  <div className="flex border-b border-gray-200 mb-6">
                      <button 
                          className={`flex-1 py-2 text-sm font-medium ${authMode === 'LOGIN' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                          onClick={() => setAuthMode('LOGIN')}
                      >
                          Login
                      </button>
                      <button 
                          className={`flex-1 py-2 text-sm font-medium ${authMode === 'REGISTER' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                          onClick={() => setAuthMode('REGISTER')}
                      >
                          Register Agent
                      </button>
                  </div>

                  <form onSubmit={handleAuthSubmit} className="space-y-4">
                      {authMode === 'REGISTER' && (
                          <>
                              <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                  <select 
                                      value={regRole} 
                                      onChange={e => setRegRole(e.target.value as 'admin' | 'agent')} 
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-gray-50"
                                  >
                                      <option value="agent">Executive Reporting Agent</option>
                                      <option value="admin">System Administrator</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                  <input 
                                      required 
                                      value={name} 
                                      onChange={e => setName(e.target.value)} 
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-gray-50" 
                                      placeholder="Agent Name"
                                  />
                              </div>
                              <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                  <input 
                                      required 
                                      type="tel"
                                      value={phone} 
                                      onChange={e => setPhone(e.target.value)} 
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-gray-50" 
                                      placeholder="Official Phone Number"
                                  />
                              </div>
                          </>
                      )}
                      
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                          <input 
                              required 
                              type="email"
                              value={email} 
                              onChange={e => setEmail(e.target.value)} 
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-gray-50" 
                              placeholder="agent@agrosourcing.com"
                          />
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                          <input 
                              required 
                              type="password"
                              value={password} 
                              onChange={e => setPassword(e.target.value)} 
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-gray-50" 
                              placeholder="••••••••"
                          />
                      </div>

                      <Button type="submit" isLoading={authLoading} className="w-full bg-blue-600 hover:bg-blue-700 mt-2">
                          {authMode === 'LOGIN' ? 'Access Dashboard' : 'Register'}
                      </Button>
                  </form>
              </Card>
          </div>
      );
  }

  // 2. Logged In but Not Admin or Agent -> Unauthorized
  if (user.type !== 'admin' && user.type !== 'agent') {
      return (
          <div className="max-w-md mx-auto mt-20 text-center animate-fade-in">
              <div className="inline-block p-4 bg-red-100 rounded-full text-red-600 mb-4">
                  <ShieldCheckIcon className="w-12 h-12" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Unauthorized Access</h2>
              <p className="text-gray-600 mb-6">
                  Your account ({user.email}) is not authorized to view the Executive Portal.
                  This area is restricted to Admins and Executive Reporting Agents.
              </p>
              <div className="bg-gray-100 p-2 rounded text-xs text-gray-500 inline-block">
                  Current Role: <span className="font-mono uppercase">{user.type}</span>
              </div>
          </div>
      );
  }

  // 3. Admin/Agent Logged In -> Show Dashboard
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-100 rounded-full text-blue-700">
           <ChartBarIcon className="w-8 h-8" />
        </div>
        <div>
           <h2 className="text-2xl font-bold text-gray-800">Executive Dashboard</h2>
           <p className="text-gray-600">Platform overview and AI analytics for {user.name} ({user.type}).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ad Banner Manager */}
        <Card className="border-t-4 border-green-500">
            <div className="flex items-start gap-4 mb-4">
                <div className="p-3 bg-green-100 rounded-full text-green-700">
                    <TagIcon className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-gray-800">Ad Banner Manager</h3>
                    <p className="text-gray-600">Publish certified ads to the main dashboard.</p>
                </div>
            </div>

            <form onSubmit={handleAddBanner} className="space-y-3 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Company / Title</label>
                    <input 
                        required 
                        value={newAd.title} 
                        onChange={e => setNewAd({...newAd, title: e.target.value})} 
                        className="w-full p-2 border rounded text-sm bg-white text-gray-900" 
                        placeholder="e.g. Farmerline" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ad Copy / Description</label>
                    <textarea 
                        required 
                        value={newAd.text} 
                        onChange={e => setNewAd({...newAd, text: e.target.value})} 
                        className="w-full p-2 border rounded text-sm bg-white text-gray-900" 
                        placeholder="Short catchy text..." 
                        rows={2}
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Theme Color</label>
                        <select 
                            value={newAd.color} 
                            onChange={e => setNewAd({...newAd, color: e.target.value})} 
                            className="w-full p-2 border rounded text-sm bg-white text-gray-900"
                        >
                            <option value="bg-green-50 border-green-100">Green</option>
                            <option value="bg-blue-50 border-blue-100">Blue</option>
                            <option value="bg-orange-50 border-orange-100">Orange</option>
                            <option value="bg-yellow-50 border-yellow-100">Yellow</option>
                            <option value="bg-purple-50 border-purple-100">Purple</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Banner Image (Optional)</label>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => adFileInputRef.current?.click()} className="flex-1 bg-white border rounded text-sm text-gray-600 hover:bg-gray-100 flex items-center justify-center">
                                <UploadIcon className="w-4 h-4 mr-1" /> Select
                            </button>
                            {adImagePreview && <img src={adImagePreview} alt="Preview" className="h-9 w-9 object-cover rounded border" />}
                        </div>
                        <input type="file" ref={adFileInputRef} className="hidden" accept="image/*" onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) { setAdImage(f); fileToDataUri(f).then(setAdImagePreview); }
                        }} />
                    </div>
                </div>
                <Button type="submit" isLoading={isUploadingAd} className="w-full bg-green-600 hover:bg-green-700 text-sm">Publish Ad</Button>
            </form>

            <div className="space-y-2 max-h-60 overflow-y-auto">
                <h4 className="text-xs font-bold text-gray-500 uppercase">Active Banners</h4>
                {adBanners.length === 0 ? <p className="text-sm text-gray-400 italic">No custom banners.</p> : 
                    adBanners.map(ad => (
                        <div key={ad.id} className="flex justify-between items-center p-2 bg-white border rounded shadow-sm">
                            <div className="flex items-center gap-2">
                                {ad.imageUrl ? (
                                    <img src={ad.imageUrl} className="w-8 h-8 rounded object-cover border" alt="ad" />
                                ) : (
                                    <div className={`w-8 h-8 rounded ${ad.color} border`}></div>
                                )}
                                <div className="truncate max-w-[150px]">
                                    <p className="text-xs font-bold text-gray-900">{ad.title}</p>
                                    <p className="text-[10px] text-gray-500 truncate">{ad.text}</p>
                                </div>
                            </div>
                            <button onClick={() => handleDeleteBanner(ad.id)} className="text-red-400 hover:text-red-600 p-1"><TrashIcon className="w-4 h-4" /></button>
                        </div>
                    ))
                }
            </div>
        </Card>

        {/* Executive Analytics Agent */}
        <Card className="border-t-4 border-blue-500">
            <div className="flex items-start gap-4 mb-4">
                <div className="p-3 bg-blue-100 rounded-full text-blue-700">
                    <ChartBarIcon className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-gray-800">Executive Reporting Agent</h3>
                    <p className="text-gray-600">Analyze WoW growth, Day-of-Week trends, and provider performance.</p>
                </div>
            </div>

            <div className="flex flex-col h-full">
                <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">Data Source (JSON or CSV)</label>
                    <button onClick={handleFetchLiveStats} className="text-xs text-blue-600 hover:underline font-bold">
                        Fetch Live DB Data
                    </button>
                </div>
                <textarea 
                    value={reportInput}
                    onChange={(e) => setReportInput(e.target.value)}
                    rows={8}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs font-mono bg-gray-50 text-gray-900 mb-3"
                    placeholder="Click 'Fetch Live DB Data' or paste CSV/JSON here..."
                />
                <Button onClick={handleGenerateReport} isLoading={reportLoading} className="bg-blue-600 hover:bg-blue-700 w-full mb-4">
                    Generate Executive Report
                </Button>

                {reportResult && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mt-auto max-h-96 overflow-y-auto">
                         <div 
                            className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-p:text-gray-600 prose-strong:text-gray-900" 
                            dangerouslySetInnerHTML={{ __html: marked.parse(reportResult) as string }} 
                        />
                    </div>
                )}
            </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
