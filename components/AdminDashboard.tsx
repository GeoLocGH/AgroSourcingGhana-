
import React, { useState, useEffect } from 'react';
import Card from './common/Card';
import Button from './common/Button';
import { UsersIcon, ShoppingCartIcon, TractorIcon, ChartBarIcon, ShieldCheckIcon, Spinner, CloudIcon, CheckCircleIcon, XIcon, AlertTriangleIcon } from './common/icons';
import type { User } from '../types';
import { supabase } from '../services/supabase';

interface AdminDashboardProps {
    user: User | null;
    onLogin: (user: User) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // System Health States
  const [bucketStatus, setBucketStatus] = useState<'checking' | 'ok' | 'missing' | 'error'>('checking');
  const [dbStatus, setDbStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
      if (user?.type === 'admin') {
          checkSystemHealth();
      }
  }, [user]);

  const checkSystemHealth = async () => {
      setBucketStatus('checking');
      setDbStatus('checking');

      // 1. Check Storage Bucket ('uploads')
      // We try to list files. If bucket is missing, it returns specific error.
      const { data: storageData, error: storageError } = await supabase.storage.from('uploads').list('', { limit: 1 });
      
      if (storageError) {
          console.error("Storage Check Error:", storageError);
          if (storageError.message.includes('not found') || (storageError as any).error === 'Bucket not found') {
              setBucketStatus('missing');
          } else {
              setBucketStatus('error');
          }
      } else {
          setBucketStatus('ok');
      }

      // 2. Check Database (Users table)
      const { error: dbError } = await supabase.from('users').select('uid').limit(1);
      if (dbError) {
          console.error("DB Check Error:", dbError);
          setDbStatus('error');
      } else {
          setDbStatus('ok');
      }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setIsLoading(true);
      
      try {
          if (!email.toLowerCase().includes('admin')) {
              throw new Error('Access denied. Please use an official admin email address.');
          }

          const { data, error } = await supabase.auth.signInWithPassword({
              email,
              password
          });

          if (error) {
              // Auto-register prototype logic for demo purposes
              if (error.message.includes('Invalid login credentials')) {
                  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                      email,
                      password,
                      options: { data: { full_name: 'App Administrator' } }
                  });
                  
                  if (signUpError) throw signUpError;
                  
                  // Ensure admin role in DB
                  if (signUpData.user) {
                      const newAdmin: User = {
                          uid: signUpData.user.id,
                          name: 'App Administrator',
                          email: email,
                          phone: '',
                          type: 'admin',
                          photo_url: ''
                      };
                      await supabase.from('users').insert([newAdmin]);
                      onLogin(newAdmin);
                      return;
                  }
              }
              throw error;
          }

          if (data.user) {
               // Check DB role
               const { data: userDoc } = await supabase.from('users').select('*').eq('uid', data.user.id).single();
               let appUser = userDoc as User;
               
               if (!appUser) {
                   appUser = {
                       uid: data.user.id,
                       name: 'App Administrator',
                       email: email,
                       phone: '',
                       type: 'admin',
                       photo_url: ''
                   };
                   await supabase.from('users').insert([appUser]);
               } else if (appUser.type !== 'admin') {
                   // Force upgrade for this demo path
                   await supabase.from('users').update({ type: 'admin' }).eq('uid', appUser.uid);
                   appUser.type = 'admin';
               }
               onLogin(appUser);
          }

      } catch (err: any) {
          console.error("Admin Auth Error:", err);
          setError(err.message || 'Authentication failed.');
      } finally {
          setIsLoading(false);
      }
  };

  if (!user || user.type !== 'admin') {
      return (
          <div className="flex justify-center items-center min-h-[50vh] animate-fade-in">
              <Card className="w-full max-w-md p-8 bg-white border-t-4 border-red-600 shadow-xl">
                  <div className="flex justify-center mb-6">
                      <div className="bg-red-100 p-3 rounded-full">
                          <ShieldCheckIcon className="w-8 h-8 text-red-600" />
                      </div>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800 text-center mb-6">Admin Access</h2>
                  <form onSubmit={handleAdminLogin}>
                      <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none" required placeholder="admin@agrosourcing.com" />
                      </div>
                      <div className="mb-6">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none" required placeholder="••••••••" />
                      </div>
                      {error && <div className="mb-4 text-red-600 text-sm bg-red-50 p-3 rounded">{error}</div>}
                      <Button type="submit" isLoading={isLoading} className="w-full bg-red-700 hover:bg-red-800">Access Dashboard</Button>
                  </form>
              </Card>
          </div>
      );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600 rounded-lg text-white"><ShieldCheckIcon className="w-6 h-6" /></div>
            <h2 className="text-2xl font-bold text-gray-200">Admin Console</h2>
          </div>
          <Button onClick={checkSystemHealth} className="text-sm py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600">Refresh Health Status</Button>
      </div>

      {/* System Health Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Storage Health */}
          <Card className={`border-l-4 ${bucketStatus === 'ok' ? 'border-l-green-500' : 'border-l-red-500'}`}>
              <div className="flex justify-between items-start">
                  <div>
                      <h3 className="font-bold text-gray-800 flex items-center gap-2">
                          <CloudIcon className="w-5 h-5 text-gray-500"/> Storage Bucket ('uploads')
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">Required for images and files.</p>
                  </div>
                  <div>
                      {bucketStatus === 'checking' && <Spinner className="text-gray-500"/>}
                      {bucketStatus === 'ok' && <span className="flex items-center text-green-600 font-bold text-sm"><CheckCircleIcon className="w-5 h-5 mr-1"/> Connected</span>}
                      {bucketStatus === 'missing' && <span className="flex items-center text-red-600 font-bold text-sm"><XIcon className="w-5 h-5 mr-1"/> Missing</span>}
                      {bucketStatus === 'error' && <span className="flex items-center text-orange-600 font-bold text-sm"><AlertTriangleIcon className="w-5 h-5 mr-1"/> Error</span>}
                  </div>
              </div>
              {bucketStatus === 'missing' && (
                  <div className="mt-3 bg-red-50 p-3 rounded text-xs text-red-800 font-mono">
                      Run the SQL script provided in the assistant chat to create the 'uploads' bucket.
                  </div>
              )}
          </Card>

          {/* Database Health */}
          <Card className={`border-l-4 ${dbStatus === 'ok' ? 'border-l-green-500' : 'border-l-red-500'}`}>
              <div className="flex justify-between items-start">
                  <div>
                      <h3 className="font-bold text-gray-800 flex items-center gap-2">
                          <UsersIcon className="w-5 h-5 text-gray-500"/> Database Connection
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">Connectivity to Supabase Tables.</p>
                  </div>
                  <div>
                      {dbStatus === 'checking' && <Spinner className="text-gray-500"/>}
                      {dbStatus === 'ok' && <span className="flex items-center text-green-600 font-bold text-sm"><CheckCircleIcon className="w-5 h-5 mr-1"/> Connected</span>}
                      {dbStatus === 'error' && <span className="flex items-center text-red-600 font-bold text-sm"><XIcon className="w-5 h-5 mr-1"/> Error</span>}
                  </div>
              </div>
          </Card>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-blue-50 border-blue-200">
              <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-blue-800">Total Users</h3>
                  <UsersIcon className="w-6 h-6 text-blue-300" />
              </div>
              <p className="text-3xl font-bold text-blue-900">1,245</p>
              <p className="text-xs text-blue-600 mt-1">+12% this month</p>
          </Card>
          <Card className="bg-purple-50 border-purple-200">
              <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-purple-800">Market Listings</h3>
                  <ShoppingCartIcon className="w-6 h-6 text-purple-300" />
              </div>
              <p className="text-3xl font-bold text-purple-900">854</p>
              <p className="text-xs text-purple-600 mt-1">32 pending review</p>
          </Card>
          <Card className="bg-indigo-50 border-indigo-200">
              <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-indigo-800">Equipment Rentals</h3>
                  <TractorIcon className="w-6 h-6 text-indigo-300" />
              </div>
              <p className="text-3xl font-bold text-indigo-900">128</p>
              <p className="text-xs text-indigo-600 mt-1">Active rentals</p>
          </Card>
          <Card className="bg-green-50 border-green-200">
              <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-green-800">Total Volume</h3>
                  <ChartBarIcon className="w-6 h-6 text-green-300" />
              </div>
              <p className="text-3xl font-bold text-green-900">GHS 45k</p>
              <p className="text-xs text-green-600 mt-1">In transactions</p>
          </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
