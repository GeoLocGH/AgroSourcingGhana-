
import React, { useState, useEffect, useRef } from 'react';
import Card from './common/Card';
import Button from './common/Button';
import { UserCircleIcon, PencilIcon, TrashIcon, UserCircleIcon as UserIcon, PaperClipIcon, EyeIcon, UploadIcon, XIcon, DownloadIcon, ShoppingCartIcon, HeartIcon, ArrowRightIcon, TractorIcon, ShieldCheckIcon, BanknotesIcon, MessageSquareIcon } from './common/icons';
import type { User, UserFile, MarketplaceItem, EquipmentItem, View, Transaction } from '../types';
import { supabase } from '../services/supabase';
import { getUserFiles, deleteUserFile, uploadUserFile, getFreshDownloadUrl } from '../services/storageService';
import { getTransactionHistory } from '../services/paymentService';
import { useNotifications } from '../contexts/NotificationContext';
import { marked } from 'marked';
import { fileToDataUri } from '../utils';

interface ProfileProps {
  user: User | null;
  setUser: (user: User | null) => void;
  onLogout: () => void;
  setActiveView: (view: View) => void;
}

const Profile: React.FC<ProfileProps> = ({ user, setUser, onLogout, setActiveView }) => {
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'LISTINGS' | 'LIKES' | 'FILES' | 'TRANSACTIONS'>('DETAILS');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotifications();
  
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  
  const [myListings, setMyListings] = useState<MarketplaceItem[]>([]);
  const [myEquipment, setMyEquipment] = useState<EquipmentItem[]>([]);
  const [likedItems, setLikedItems] = useState<MarketplaceItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [loadingLikes, setLoadingLikes] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const [formData, setFormData] = useState<Partial<User>>({
    name: user?.name || '',
    phone: user?.phone || '',
    merchant_id: user?.merchant_id || '',
    photo_url: user?.photo_url || '',
    messaging_enabled: user?.messaging_enabled ?? true
  });
  
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user && user.uid) {
      setFormData({
        name: user.name || '',
        phone: user.phone || '',
        merchant_id: user.merchant_id || '',
        photo_url: user.photo_url || '',
        messaging_enabled: user.messaging_enabled ?? true
      });
      fetchUserFiles();
      fetchMyProperties();
      fetchLikedItems();
      fetchTransactions();
    }
  }, [user]);

  const fetchUserFiles = async () => {
    if (!user || !user.uid) return;
    setLoadingFiles(true);
    try {
      const userFiles = await getUserFiles(user.uid);
      setFiles(userFiles);
    } catch (error: any) {
      console.error("Error fetching files:", error);
    } finally {
      setLoadingFiles(false);
    }
  };

  const fetchTransactions = async () => {
      if (!user || !user.uid) return;
      setLoadingTransactions(true);
      try {
          const data = await getTransactionHistory(user.uid);
          setTransactions(data || []);
      } catch (error) {
          console.error("Error fetching transactions:", error);
      } finally {
          setLoadingTransactions(false);
      }
  };

  const fetchMyProperties = async () => {
      if (!user || !user.uid) return;
      setLoadingListings(true);
      try {
          // Updated to use owner_id
          const { data: marketData } = await supabase.from('marketplace').select('*').eq('owner_id', user.uid);
          setMyListings((marketData as MarketplaceItem[]) || []);

          const { data: equipData } = await supabase.from('equipment').select('*').eq('owner_id', user.uid);
          setMyEquipment((equipData as EquipmentItem[]) || []);
      } catch (error) {
          console.error("Error fetching listings:", error);
      } finally {
          setLoadingListings(false);
      }
  };

  const fetchLikedItems = async () => {
      if (!user || !user.uid) return;
      setLoadingLikes(true);
      try {
          const { data: likesData } = await supabase.from('marketplace_likes').select('item_id').eq('user_id', user.uid);
          if (likesData && likesData.length > 0) {
              const itemIds = likesData.map((l: any) => l.item_id);
              const { data: itemsData } = await supabase.from('marketplace').select('*').in('id', itemIds);
              setLikedItems((itemsData as MarketplaceItem[]) || []);
          } else {
              setLikedItems([]);
          }
      } catch (error) {
          console.error("Error fetching likes:", error);
      } finally {
          setLoadingLikes(false);
      }
  };

  const handleFileDelete = async (file: UserFile) => {
    if (!user || !user.uid) return;
    if (!window.confirm("Delete file?")) return;

    try {
      await deleteUserFile(user.uid, file.id, file.storage_path);
      setFiles(prev => prev.filter(f => f.id !== file.id));
      addNotification({ type: 'auth', title: 'Deleted', message: 'File removed.', view: 'PROFILE' });
    } catch (error) {
      addNotification({ type: 'auth', title: 'Error', message: 'Failed to delete.', view: 'PROFILE' });
    }
  };

  const handleFileDownload = async (file: UserFile) => {
      try {
          const url = await getFreshDownloadUrl(file.storage_path);
          window.open(url, '_blank');
      } catch (error) {
          console.error("Download failed:", error);
      }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user?.uid) return;
      
      setLoading(true);
      try {
          let finalPhotoURL = user.photo_url || '';

          if (newPhoto) {
              const fileData = await uploadUserFile(user.uid, newPhoto, 'profile', '', 'Profile Photo Updated');
              finalPhotoURL = fileData.file_url;
          }

          const updates = {
              name: formData.name,
              phone: formData.phone,
              messaging_enabled: formData.messaging_enabled
              // photo_url and merchant_id excluded from DB update to avoid Schema Error if they don't exist
          };

          // Use 'id' instead of 'uid' for the query
          const { error } = await supabase.from('users').update(updates).eq('id', user.uid);
          if (error) throw error;
          
          // Store photo URL and merchant_id in Auth Metadata instead
          await supabase.auth.updateUser({
              data: { 
                  full_name: formData.name, 
                  avatar_url: finalPhotoURL,
                  phone: formData.phone,
                  // Do NOT update merchant_id here to prevent override, only read it
              }
          });
          
          setUser({ ...user, ...updates, photo_url: finalPhotoURL } as User);
          setIsEditing(false);
          addNotification({ type: 'auth', title: 'Updated', message: 'Profile saved.', view: 'PROFILE' });
      } catch (error: any) {
          console.error("Update failed:", error);
          addNotification({ type: 'auth', title: 'Error', message: error.message || 'Update failed.', view: 'PROFILE' });
      } finally {
          setLoading(false);
      }
  };

  const toggleFileDetails = (id: string) => {
    setExpandedFileId(expandedFileId === id ? null : id);
  };

  const getStatusColor = (status: Transaction['status']) => {
      switch(status) {
          case 'completed': return 'bg-green-100 text-green-800 border border-green-200';
          case 'pending': return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
          case 'failed': return 'bg-red-100 text-red-800 border border-red-200';
          case 'refunded': return 'bg-blue-100 text-blue-800 border border-blue-200';
          case 'flagged': return 'bg-orange-100 text-orange-800 border border-orange-200';
          default: return 'bg-gray-100 text-gray-800 border border-gray-200';
      }
  };

  if (!user) return <p className="text-center p-8">Please log in to view your profile.</p>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-full text-green-700"><UserIcon className="w-8 h-8" /></div>
            <div>
                <h2 className="text-2xl font-bold text-gray-800">My Profile</h2>
                <p className="text-sm text-gray-500">Manage your account and activities</p>
            </div>
        </div>
        <Button onClick={onLogout} className="bg-gray-200 text-gray-800 hover:bg-gray-300 w-full md:w-auto">Logout</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-6">
              <Card className="text-center p-6 flex flex-col items-center">
                   <div className="w-32 h-32 rounded-full border-4 border-white shadow-lg overflow-hidden mb-4 bg-gray-200 relative group">
                       <img src={photoPreview || user.photo_url || 'https://placehold.co/100'} alt="Profile" className="w-full h-full object-cover" />
                       {isEditing && (
                           <div className="absolute inset-0 bg-black/50 flex items-center justify-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                               <UploadIcon className="w-8 h-8 text-white" />
                           </div>
                       )}
                   </div>
                   {isEditing && <input type="file" ref={fileInputRef} onChange={(e) => {
                       const f = e.target.files?.[0];
                       if (f) { setNewPhoto(f); fileToDataUri(f).then(setPhotoPreview); }
                   }} className="hidden" />}
                   
                   {!isEditing ? (
                       <>
                        <h3 className="text-xl font-bold text-gray-900">{user.name}</h3>
                        <p className="text-sm text-gray-500 mb-2">{user.email}</p>
                        <span className="text-xs font-bold uppercase bg-green-100 text-green-800 px-3 py-1 rounded-full">{user.type}</span>
                        <div className="mt-4 flex items-center justify-center gap-2">
                            <MessageSquareIcon className={`w-4 h-4 ${user.messaging_enabled ? 'text-green-600' : 'text-gray-400'}`} />
                            <span className={`text-xs ${user.messaging_enabled ? 'text-green-700 font-medium' : 'text-gray-500'}`}>
                                Messaging {user.messaging_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                        </div>
                        <div className="mt-6 w-full space-y-2">
                            <Button onClick={() => setIsEditing(true)} className="w-full text-sm bg-blue-600 hover:bg-blue-700">Edit Profile</Button>
                        </div>
                       </>
                   ) : (
                       <form onSubmit={handleUpdateProfile} className="w-full space-y-3 mt-2">
                           <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border p-2 rounded text-sm text-gray-900" placeholder="Full Name" />
                           <input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border p-2 rounded text-sm text-gray-900" placeholder="Phone" />
                           
                           {/* READ-ONLY MERCHANT ID */}
                           {user.merchant_id && (
                               <div className="relative">
                                   <label className="text-[10px] text-gray-500 font-bold absolute -top-1.5 left-2 bg-white px-1">MERCHANT ID (LOCKED)</label>
                                   <input 
                                        value={formData.merchant_id} 
                                        readOnly 
                                        className="w-full border p-2 rounded text-sm text-gray-500 bg-gray-100 cursor-not-allowed font-mono" 
                                        title="Contact Support to change Merchant ID"
                                   />
                               </div>
                           )}

                           <div className="flex items-center gap-2 bg-gray-50 p-2 rounded border border-gray-200">
                               <input 
                                    type="checkbox" 
                                    id="messagingToggle" 
                                    checked={formData.messaging_enabled} 
                                    onChange={e => setFormData({...formData, messaging_enabled: e.target.checked})}
                                    className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                                />
                                <label htmlFor="messagingToggle" className="text-sm text-gray-700 cursor-pointer select-none">Allow Messaging</label>
                           </div>
                           <div className="flex gap-2">
                               <Button type="submit" isLoading={loading} className="flex-1 text-sm">Save</Button>
                               <Button onClick={() => setIsEditing(false)} className="flex-1 bg-gray-200 text-gray-800 text-sm">Cancel</Button>
                           </div>
                       </form>
                   )}
              </Card>
          </div>

          <div className="lg:col-span-3">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="flex border-b overflow-x-auto no-scrollbar">
                      <button onClick={() => setActiveTab('DETAILS')} className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap ${activeTab === 'DETAILS' ? 'text-green-700 border-b-2 border-green-600 bg-green-50' : 'text-gray-600 hover:bg-gray-50'}`}>Account Details</button>
                      <button onClick={() => setActiveTab('LISTINGS')} className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap ${activeTab === 'LISTINGS' ? 'text-green-700 border-b-2 border-green-600 bg-green-50' : 'text-gray-600 hover:bg-gray-50'}`}>My Listings</button>
                      <button onClick={() => setActiveTab('LIKES')} className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap ${activeTab === 'LIKES' ? 'text-green-700 border-b-2 border-green-600 bg-green-50' : 'text-gray-600 hover:bg-gray-50'}`}>Liked</button>
                      <button onClick={() => setActiveTab('FILES')} className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap ${activeTab === 'FILES' ? 'text-green-700 border-b-2 border-green-600 bg-green-50' : 'text-gray-600 hover:bg-gray-50'}`}>Files</button>
                      <button onClick={() => setActiveTab('TRANSACTIONS')} className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap ${activeTab === 'TRANSACTIONS' ? 'text-green-700 border-b-2 border-green-600 bg-green-50' : 'text-gray-600 hover:bg-gray-50'}`}>Transactions</button>
                  </div>

                  <div className="p-6 min-h-[400px]">
                      {activeTab === 'DETAILS' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-gray-900">
                              <div><label className="text-xs text-gray-500 uppercase">Email</label><p className="font-medium">{user.email}</p></div>
                              <div><label className="text-xs text-gray-500 uppercase">Phone</label><p className="font-medium">{user.phone || 'Not set'}</p></div>
                              {user.merchant_id && (
                                  <div>
                                      <label className="text-xs text-gray-500 uppercase flex items-center gap-1">
                                          Merchant ID <ShieldCheckIcon className="w-3 h-3 text-blue-500" />
                                      </label>
                                      <p className="font-medium font-mono text-blue-800 bg-blue-50 inline-block px-2 rounded border border-blue-100">{user.merchant_id}</p>
                                  </div>
                              )}
                              <div>
                                  <label className="text-xs text-gray-500 uppercase">Messaging</label>
                                  <p className={`font-medium ${user.messaging_enabled ? 'text-green-600' : 'text-red-500'}`}>
                                      {user.messaging_enabled ? 'Active' : 'Disabled'}
                                  </p>
                              </div>
                              <div className="md:col-span-2"><label className="text-xs text-gray-500 uppercase">User ID</label><p className="font-mono text-xs bg-gray-100 p-2 rounded">{user.uid}</p></div>
                          </div>
                      )}

                      {activeTab === 'TRANSACTIONS' && (
                          <div className="space-y-4">
                              <h3 className="text-lg font-bold text-gray-800">Payment History (MoMo & Digital Wallet)</h3>
                              {loadingTransactions ? <p className="text-center py-4">Loading transactions...</p> : (
                                  <div className="overflow-x-auto">
                                      <table className="min-w-full divide-y divide-gray-200">
                                          <thead className="bg-gray-50">
                                              <tr>
                                                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</th>
                                                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                                                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                              </tr>
                                          </thead>
                                          <tbody className="bg-white divide-y divide-gray-200">
                                              {transactions.map(tx => (
                                                  <tr key={tx.id} className="hover:bg-gray-50">
                                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                          {new Date(tx.created_at).toLocaleDateString()}
                                                      </td>
                                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                          <div className="flex items-center gap-2">
                                                              <BanknotesIcon className="w-4 h-4 text-gray-400" />
                                                              {tx.provider}
                                                          </div>
                                                      </td>
                                                      <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-500">
                                                          {tx.provider_reference}
                                                      </td>
                                                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                                          {tx.currency || 'GHS'} {tx.amount.toFixed(2)}
                                                      </td>
                                                      <td className="px-6 py-4 whitespace-nowrap">
                                                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full uppercase tracking-wider ${getStatusColor(tx.status)}`}>
                                                              {tx.status}
                                                          </span>
                                                      </td>
                                                  </tr>
                                              ))}
                                          </tbody>
                                      </table>
                                      {transactions.length === 0 && <p className="text-center text-gray-400 py-8">No transaction history found.</p>}
                                  </div>
                              )}
                          </div>
                      )}

                      {activeTab === 'FILES' && (
                          <div className="space-y-4">
                              {loadingFiles ? <p className="text-center py-4">Loading...</p> : files.map(f => (
                                  <div key={f.id} className="border rounded-lg overflow-hidden">
                                      <div className="flex items-center justify-between p-3 bg-white hover:bg-gray-50">
                                          <div className="flex items-center gap-3 cursor-pointer flex-grow" onClick={() => toggleFileDetails(f.id)}>
                                              <div className="p-2 bg-gray-100 rounded text-gray-500"><PaperClipIcon className="w-5 h-5" /></div>
                                              <div>
                                                  <p className="text-sm font-medium text-gray-900 truncate">{f.file_name}</p>
                                                  <p className="text-xs text-gray-500 capitalize">{f.context.replace('-', ' ')} • {new Date(f.createdAt).toLocaleDateString()}</p>
                                              </div>
                                          </div>
                                          <div className="flex gap-2">
                                            <button onClick={() => handleFileDownload(f)} className="p-2 text-gray-400 hover:text-blue-600"><DownloadIcon className="w-4 h-4" /></button>
                                            <button onClick={() => handleFileDelete(f)} className="p-2 text-gray-400 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                                          </div>
                                      </div>
                                      {expandedFileId === f.id && (
                                          <div className="p-4 bg-gray-50 border-t text-sm space-y-3 text-gray-900">
                                              {f.ai_summary && (
                                                  <div className="space-y-1">
                                                      <h5 className="font-bold flex items-center gap-1 text-green-700"><ShieldCheckIcon className="w-4 h-4" /> AI Analysis</h5>
                                                      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: marked.parse(f.ai_summary) }} />
                                                  </div>
                                              )}
                                              {f.notes && (
                                                  <div><h5 className="font-bold text-gray-700">Notes</h5><p className="bg-white p-2 rounded border">{f.notes}</p></div>
                                              )}
                                          </div>
                                      )}
                                  </div>
                              ))}
                              {files.length === 0 && !loadingFiles && <p className="text-center text-gray-400 py-8">No files uploaded yet.</p>}
                          </div>
                      )}
                      
                      {activeTab === 'LISTINGS' && (
                           <div>
                               {myListings.map(item => <p key={item.id} className="border-b py-2">{item.title} - GHS {item.price}</p>)}
                               {myListings.length === 0 && !loadingListings && <p className="text-gray-400 text-center py-4">No listings found.</p>}
                           </div>
                      )}
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default Profile;
