
import React, { useState } from 'react';
import type { User, View } from '../types';
import Button from './common/Button';
import Card from './common/Card';
import { UserCircleIcon, XIcon, UploadIcon, MailIcon, EyeIcon } from './common/icons';
import { useNotifications } from '../contexts/NotificationContext';
import { supabase } from '../services/supabase';
import { uploadUserFile } from '../services/storageService';

interface AuthProps {
  user: User | null;
  onLogin: (user: User) => void;
  onLogout: () => void;
  setActiveView?: (view: View) => void;
}

const Auth: React.FC<AuthProps> = ({ user, onLogin, onLogout, setActiveView }) => {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [resetLinkSent, setResetLinkSent] = useState(false);
  
  const { addNotification } = useNotifications();
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');

  // Register Form State
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regRepeatPass, setRegRepeatPass] = useState('');
  const [regType, setRegType] = useState<'buyer' | 'seller' | 'farmer' | 'admin'>('buyer');
  const [regPhoto, setRegPhoto] = useState<File | null>(null);

  const resetForms = () => {
    setLoginEmail('');
    setLoginPass('');
    setRegName('');
    setRegEmail('');
    setRegPhone('');
    setRegPass('');
    setRegRepeatPass('');
    setRegPhoto(null);
    setAuthError('');
    setIsLoading(false);
    setResetLinkSent(false);
  };

  const switchToLogin = () => {
    setIsRegisterOpen(false);
    setIsForgotPasswordOpen(false);
    setIsLoginOpen(true);
    setAuthError('');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: loginPass
      });

      if (error) throw error;
      
      const sessionUser = data.user;
      if (!sessionUser) throw new Error("No user found");

      // App.tsx handles the actual user state setting via onAuthStateChange listener
      // but we can manually fetch here to ensure UI updates immediately if needed
      // For now, just close modal, App.tsx listener picks it up.
      
      setIsLoginOpen(false);
      resetForms();
      // Notification will be handled by App.tsx logic usually, but adding one here is fine
    } catch (error: any) {
      console.error("Login error", error);
      setAuthError(error.message || "Invalid email or password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (regPass !== regRepeatPass) {
        setAuthError("Passwords do not match.");
        return;
    }

    if (regPass.length < 6) {
        setAuthError("Password must be at least 6 characters.");
        return;
    }

    setIsLoading(true);

    try {
      // 1. Sign Up
      // Pass metadata so it survives if email confirmation is needed
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: regEmail,
          password: regPass,
          options: {
              data: {
                  full_name: regName,
                  phone: regPhone,
                  user_type: regType
              }
          }
      });

      if (signUpError) throw signUpError;
      if (!authData.user) throw new Error("Registration failed");

      const userId = authData.user.id;
      const isSessionActive = !!authData.session;

      // 2. If Session is Active (Auto-confirm), we can setup the profile immediately
      if (isSessionActive) {
          let profilePhotoUrl = '';
          if (regPhoto) {
              try {
                  const fileData = await uploadUserFile(userId, regPhoto, 'profile', '', 'Profile Photo');
                  // Fix: Changed download_url to file_url
                  profilePhotoUrl = fileData.file_url;
              } catch(e) {
                  console.warn("Photo upload failed during reg", e);
              }
          }

          const newUser: User = {
              uid: userId,
              name: regName,
              email: regEmail,
              phone: regPhone,
              type: regType,
              photo_url: profilePhotoUrl
          };

          const { error: dbError } = await supabase.from('users').upsert([newUser]);
          if (dbError) {
              console.error("DB Insert Error", JSON.stringify(dbError));
              // Fallback: App.tsx will try to create it later based on metadata
          }
          
          onLogin(newUser);
      } else {
          // 3. Confirmation Required
          // We cannot upload the photo yet as we don't have a session token for RLS
          // We rely on metadata passed to signUp for Name/Phone/Type
          setVerificationEmail(regEmail);
      }

      setIsRegisterOpen(false);
      resetForms();

    } catch (error: any) {
      console.error("Registration error", error);
      setAuthError(error.message || "Failed to create account.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
          redirectTo: window.location.origin, // Redirect back to app
      });
      if (error) throw error;
      setResetLinkSent(true);
    } catch (error: any) {
      console.error("Password reset error", error);
      setAuthError(error.message || "Failed to send reset link.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoutClick = async () => {
      try {
        await supabase.auth.signOut();
        onLogout();
        // Notification handled in context usually, but explicitly calling here
        addNotification({ type: 'auth', title: 'Logged Out', message: 'See you soon!', view: 'DASHBOARD' });
      } catch (error) {
        console.error("Logout error", error);
      }
  }

  return (
    <div>
      {user ? (
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium text-white">{user.name}</span>
              <div className="flex flex-col items-end">
                <span className="text-xs text-green-200 uppercase font-bold tracking-wider">{user.type}</span>
                {user.merchant_id && <span className="text-[10px] text-orange-300 font-mono">{user.merchant_id}</span>}
              </div>
          </div>
          <button 
             onClick={() => setActiveView && setActiveView('PROFILE')}
             className="relative rounded-full hover:ring-2 hover:ring-green-400 transition-all"
             title="View Profile"
          >
             {user.photo_url ? (
               <img src={user.photo_url} alt={user.name} className="w-8 h-8 rounded-full object-cover border border-white" />
             ) : (
               <UserCircleIcon className="w-8 h-8 text-white" />
             )}
          </button>
          
          <Button onClick={handleLogoutClick} className="bg-green-700 hover:bg-green-600 text-xs py-2 px-3 shadow-lg border border-green-600">
            Logout
          </Button>
        </div>
      ) : (
        <div className="flex gap-3 items-center">
          <Button onClick={() => { resetForms(); setIsLoginOpen(true); }} className="bg-transparent hover:bg-green-700 border border-green-300 text-green-50 hover:text-white text-sm py-2 px-4 transition-all shadow-sm">
            Login
          </Button>
          <Button onClick={() => { resetForms(); setIsRegisterOpen(true); }} className="bg-orange-600 hover:bg-orange-700 text-white text-sm py-2 px-5 font-bold shadow-md border border-orange-700 transform hover:scale-105 transition-all shadow-orange-900/50">
            Register
          </Button>
        </div>
      )}

      {/* Verification Modal */}
      {verificationEmail && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 text-gray-800">
             <Card className="w-full max-w-md bg-white text-center p-6">
                 <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                     <MailIcon className="h-6 w-6 text-green-600" />
                 </div>
                 <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2">Check your email</h3>
                 <p className="text-sm text-gray-500 mb-6">
                     We've sent a confirmation link to <span className="font-semibold">{verificationEmail}</span>. Please click it to activate your account.
                 </p>
                 <Button onClick={() => { setVerificationEmail(null); setIsLoginOpen(true); }} className="w-full bg-green-600 hover:bg-green-700">
                     Back to Login
                 </Button>
             </Card>
        </div>
      )}

      {/* Forgot Password Modal */}
      {isForgotPasswordOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 text-gray-800">
          <Card className="w-full max-w-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Reset Password</h3>
              <button onClick={() => setIsForgotPasswordOpen(false)} className="text-gray-500 hover:text-gray-800">
                <XIcon className="w-6 h-6" />
              </button>
            </div>

            {resetLinkSent ? (
              <div className="text-center py-4">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                     <MailIcon className="h-6 w-6 text-green-600" />
                </div>
                <p className="text-gray-700 mb-6">
                   We sent a reset link to <span className="font-semibold">{loginEmail}</span>
                </p>
                <Button onClick={switchToLogin} className="w-full bg-green-700 hover:bg-green-800">
                  Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPasswordSubmit}>
                <p className="text-sm text-gray-600 mb-4">
                  Enter your email address to reset your password.
                </p>
                
                {authError && (
                  <div className="mb-4 bg-red-100 text-red-700 p-3 rounded-lg text-sm font-medium">
                    {authError}
                  </div>
                )}
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-900 bg-white mb-1">Email</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <Button type="submit" isLoading={isLoading} className="w-full bg-orange-600 hover:bg-orange-700">
                  Get Reset Link
                </Button>
                <button 
                  type="button" 
                  onClick={switchToLogin}
                  className="w-full mt-4 text-sm text-gray-500 hover:text-gray-800"
                >
                  Back to Sign In
                </button>
              </form>
            )}
          </Card>
        </div>
      )}

      {/* Login Modal */}
      {isLoginOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 text-gray-800">
          <Card className="w-full max-w-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Login</h3>
              <button onClick={() => setIsLoginOpen(false)} className="text-gray-500 hover:text-gray-800">
                <XIcon className="w-6 h-6" />
              </button>
            </div>
            {authError && (
               <div className="mb-4 bg-red-100 text-red-700 p-3 rounded-lg text-sm font-medium">
                 {authError}
               </div>
            )}
            <form onSubmit={handleLoginSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 bg-white mb-1">Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="mb-2">
                <label className="block text-sm font-medium text-gray-900 bg-white mb-1">Password</label>
                <input
                  type="password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              
              <div className="flex justify-end mb-6">
                <button 
                  type="button" 
                  onClick={() => { setIsLoginOpen(false); setIsForgotPasswordOpen(true); setAuthError(''); }}
                  className="text-sm text-green-600 hover:text-green-800 hover:underline font-medium"
                >
                  Forgot password?
                </button>
              </div>

              <Button type="submit" isLoading={isLoading} className="w-full bg-green-700 hover:bg-green-800 mb-4">Sign In</Button>
            </form>
          </Card>
        </div>
      )}

      {/* Register Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 text-gray-800">
          <Card className="w-full max-w-md bg-white max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Create Account</h3>
              <button onClick={() => setIsRegisterOpen(false)} className="text-gray-500 hover:text-gray-800">
                <XIcon className="w-6 h-6" />
              </button>
            </div>
            
            {authError && (
               <div className="mb-4 bg-red-100 text-red-700 p-3 rounded-lg text-sm font-medium flex justify-between items-center">
                 <span>{authError}</span>
               </div>
            )}

            <form onSubmit={handleRegisterSubmit}>
              {/* Profile Photo Input */}
              <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-900 bg-white mb-1">Profile Photo (Optional)</label>
                  <div className="flex items-center gap-2">
                    <div className="h-12 w-12 bg-gray-200 rounded-full flex items-center justify-center text-gray-400 overflow-hidden">
                        {regPhoto ? (
                            <img src={URL.createObjectURL(regPhoto)} alt="Preview" className="h-full w-full object-cover" />
                        ) : (
                            <UserCircleIcon className="w-8 h-8"/>
                        )}
                    </div>
                    <label className="cursor-pointer bg-white border border-gray-300 rounded-md py-2 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center shadow-sm">
                        <UploadIcon className="w-4 h-4 mr-2"/>
                        Upload
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => setRegPhoto(e.target.files?.[0] || null)} />
                    </label>
                    {regPhoto && (
                        <button type="button" onClick={() => setRegPhoto(null)} className="text-red-500 hover:text-red-700 p-1">
                            <XIcon className="w-4 h-4" />
                        </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Upload now or add later in profile.</p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 bg-white mb-1">Full Name</label>
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  required
                  placeholder="Kwame Mensah"
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 bg-white mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value.replace(/\D/g,'').slice(0,10))}
                  placeholder="024XXXXXXX"
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 bg-white mb-1">Email</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 bg-white mb-1">Password</label>
                    <input
                      type="password"
                      value={regPass}
                      onChange={(e) => setRegPass(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 bg-white mb-1">Repeat Password</label>
                    <input
                      type="password"
                      value={regRepeatPass}
                      onChange={(e) => setRegRepeatPass(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
              </div>

              <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-900 bg-white mb-1">I am a:</label>
                  <div className="flex gap-2 flex-wrap">
                      <label className="flex items-center text-gray-900 cursor-pointer bg-gray-50 px-3 py-2 rounded-lg border hover:bg-gray-100">
                          <input 
                            type="radio" 
                            name="userType" 
                            value="buyer" 
                            checked={regType === 'buyer'} 
                            onChange={() => setRegType('buyer')}
                            className="mr-2 text-green-600 focus:ring-green-500"
                          />
                          Buyer
                      </label>
                      <label className="flex items-center text-gray-900 cursor-pointer bg-gray-50 px-3 py-2 rounded-lg border hover:bg-gray-100">
                          <input 
                            type="radio" 
                            name="userType" 
                            value="seller" 
                            checked={regType === 'seller'} 
                            onChange={() => setRegType('seller')}
                            className="mr-2 text-green-600 focus:ring-green-500"
                          />
                          Seller
                      </label>
                      <label className="flex items-center text-gray-900 cursor-pointer bg-gray-50 px-3 py-2 rounded-lg border hover:bg-gray-100">
                          <input 
                            type="radio" 
                            name="userType" 
                            value="farmer" 
                            checked={regType === 'farmer'} 
                            onChange={() => setRegType('farmer')}
                            className="mr-2 text-green-600 focus:ring-green-500"
                          />
                          Farmer
                      </label>
                  </div>
              </div>
              <Button type="submit" isLoading={isLoading} className="w-full bg-orange-600 hover:bg-orange-700 mb-4">
                Register
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Auth;
