
import React, { useState, useEffect, useRef } from 'react';
import Weather from './components/Weather';
import PriceAlerts from './components/PriceAlerts';
import PestDiagnosis from './components/PestDiagnosis';
import Marketplace from './components/Marketplace';
import Dashboard from './components/Dashboard';
import CropAdvisory from './components/CropAdvisory';
import CommunityForum from './components/CommunityForum';
import Auth, { AuthModalState } from './components/Auth';
import EquipmentRental from './components/EquipmentRental';
import DigitalWallet from './components/DigitalWallet';
import AdminDashboard from './components/AdminDashboard';
import Orders from './components/Orders';
import Profile from './components/Profile';
import { NotificationProvider } from './contexts/NotificationContext';
import NotificationArea from './components/NotificationArea';
import { HomeIcon, CloudIcon, TagIcon, BugIcon, ShoppingCartIcon, SproutIcon, UsersIcon, TractorIcon, WalletIcon, ShieldCheckIcon, UploadIcon, CheckCircleIcon, XIcon, AgroLogoIcon } from './components/common/icons';
import type { View, User } from './types';
import { supabase } from './services/supabase';
import { uploadUserFile } from './services/storageService';

// Moved outside component to prevent re-mounting on every render
interface NavItemProps {
  view: View;
  label: string;
  icon: React.ReactElement<{ className?: string }>;
  activeView: View;
  setActiveView: (view: View) => void;
}

const NavItem: React.FC<NavItemProps> = ({ view, label, icon, activeView, setActiveView }) => {
  const isActive = activeView === view;
  return (
    <button
      onClick={() => setActiveView(view)}
      className={`flex flex-col items-center justify-center min-w-[70px] sm:min-w-[80px] py-2 text-xs sm:text-sm transition-all duration-300 rounded-lg flex-shrink-0 ${
        isActive ? 'text-green-800 font-bold bg-green-100 scale-105' : 'text-gray-600 hover:text-green-800 hover:bg-gray-50'
      }`}
      aria-label={`Go to ${label}`}
      aria-current={isActive ? 'page' : undefined}
    >
      {React.cloneElement(icon, { className: 'w-5 h-5 sm:w-6 sm:h-6 mb-1' })}
      <span>{label}</span>
    </button>
  );
}

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<View>('DASHBOARD');
  const [user, setUser] = useState<User | null>(null);
  
  // Auth Modal State managed centrally to allow triggers from any component
  const [authModalState, setAuthModalState] = useState<AuthModalState>('CLOSED');
  
  // App Logo State
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  
  // Pending Upload State
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Listen for global app settings (Header Logo)
  useEffect(() => {
    const fetchSettings = async () => {
        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('id', 'app')
            .single();
        
        if (data && data.value && data.value.logo_url) {
            setLogoUrl(data.value.logo_url);
        }
    };
    
    fetchSettings();

    const subscription = supabase
        .channel('settings-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: 'id=eq.app' }, (payload) => {
            if (payload.new && (payload.new as any).value) {
                setLogoUrl((payload.new as any).value.logo_url);
            }
        })
        .subscribe();

    return () => { subscription.unsubscribe(); };
  }, []);

  // Listen for Supabase Auth state changes
  useEffect(() => {
    const checkUser = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        handleSession(session);
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (_event === 'PASSWORD_RECOVERY') {
            setAuthModalState('FORGOT_PASSWORD');
        }
        handleSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSession = async (session: any) => {
      if (session?.user) {
          const meta = session.user.user_metadata || {};
          const photoFromAuth = meta.avatar_url || '';
          // Ensure merchant_id is read from metadata as column might be missing
          const merchantIdFromAuth = meta.merchant_id || '';

          // 1. Try to get existing profile
          const { data: userData, error } = await supabase
              .from('users')
              .select('*')
              .eq('uid', session.user.id)
              .single();

          if (userData) {
              // Merge DB data with Auth Metadata (prefer Auth for photo/merchant if DB is empty/missing column)
              setUser({
                  ...userData,
                  photo_url: userData.photo_url || photoFromAuth,
                  merchant_id: userData.merchant_id || merchantIdFromAuth
              } as User);
          } else {
              // 2. Profile missing (First login after email confirm?), create it from metadata
              const type = meta.user_type || (session.user.email?.toLowerCase().includes('admin') ? 'admin' : 'buyer');
              
              // Prepare DB Object (Exclude photo_url AND merchant_id to prevent Schema Error)
              const newUserDB = {
                  uid: session.user.id,
                  name: meta.full_name || 'User',
                  email: session.user.email || '',
                  phone: meta.phone || '',
                  type: type
              };
              
              // Use upsert to prevent duplicate key errors
              const { error: insertError } = await supabase.from('users').upsert([newUserDB]);
              
              const fullUser: User = {
                  ...newUserDB,
                  photo_url: photoFromAuth,
                  merchant_id: merchantIdFromAuth
              };

              if (!insertError) {
                  setUser(fullUser);
              } else {
                  console.error("Failed to create user profile:", JSON.stringify(insertError));
                  // Fallback to local state so app still works
                  setUser(fullUser);
              }
          }
      } else {
          setUser(null);
      }
  };

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    if (loggedInUser.type === 'admin') {
        setActiveView('ADMIN');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setActiveView('DASHBOARD');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && user?.type === 'admin' && user.uid) {
      if (file.type !== 'image/png') {
         alert('Please upload a PNG image.');
         return;
      }
      
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      setPendingFile(file);
    }
  };

  const handleSaveLogo = async () => {
    if (!pendingFile) return;
    if (!user?.uid) {
        alert("You must be logged in as an Admin to upload.");
        return;
    }
    
    setIsUploadingLogo(true);
    try {
        const uploadedFile = await uploadUserFile(
          user.uid, 
          pendingFile, 
          'admin-logo', 
          '', 
          'App Header Logo Upload'
        );
        
        const newLogoUrl = uploadedFile.file_url;
        
        // Save to 'settings' table
        await supabase
            .from('settings')
            .upsert({ id: 'app', value: { logo_url: newLogoUrl } });
        
        setLogoUrl(newLogoUrl);
        setPendingFile(null);
        setPreviewUrl(null);
        alert("Header logo updated globally!");
    } catch (err: any) {
        console.error("Logo upload failed:", err);
        alert(`Failed to upload logo: ${err.message}`);
    } finally {
        setIsUploadingLogo(false);
    }
  };

  const handleCancelLogo = () => {
      setPendingFile(null);
      setPreviewUrl(null);
      if (logoInputRef.current) {
          logoInputRef.current.value = '';
      }
  };

  // Helper to open login modal from children
  const handleRequireLogin = () => {
      setAuthModalState('LOGIN');
  };

  const handleSetActiveView = (view: View) => {
      if (view === 'FORUM' && !user) {
          handleRequireLogin();
          return;
      }
      setActiveView(view);
  };

  const renderView = () => {
    switch (activeView) {
      case 'WEATHER':
        return <Weather />;
      case 'PRICES':
        return <PriceAlerts />;
      case 'DIAGNOSIS':
        return <PestDiagnosis user={user} />;
      case 'MARKETPLACE':
        return <Marketplace user={user} setActiveView={setActiveView} onRequireLogin={handleRequireLogin} />;
      case 'ADVISORY':
        return <CropAdvisory />;
      case 'FORUM':
        return <CommunityForum user={user} />;
      case 'RENTAL':
        return <EquipmentRental user={user} onRequireLogin={handleRequireLogin} />;
      case 'WALLET':
        return <DigitalWallet user={user} />;
      case 'ORDERS':
        return <Orders />;
      case 'ADMIN':
        return <AdminDashboard user={user} onLogin={handleLogin} />;
      case 'PROFILE':
        return <Profile user={user} setUser={setUser} onLogout={handleLogout} setActiveView={setActiveView} />;
      case 'DASHBOARD':
      default:
        return <Dashboard setActiveView={handleSetActiveView} user={user} />;
    }
  };

  const currentDisplayLogo = previewUrl || logoUrl;

  return (
    <NotificationProvider>
      <div className="min-h-screen bg-gray-900 font-sans text-gray-200 flex flex-col">
         {/* Main Container */}
        <main className="flex-grow p-4 md:p-6 relative">
             {/* Floating Header Banner */}
             <div className="max-w-5xl mx-auto bg-green-800 text-white shadow-2xl rounded-t-xl p-4 sm:px-6 flex justify-between items-center relative z-30 min-h-[88px]">
                 {/* Title Section */}
                 <div onClick={() => setActiveView('DASHBOARD')} className="cursor-pointer hover:opacity-90 transition-opacity z-10 relative">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">AgroSourcingGhana℠</h1>
                  <p className="text-xs sm:text-sm text-green-100">Localized, Actionable Insights for Farmers</p>
                </div>

                {/* Central Logo Placeholder */}
                <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-0 flex flex-col items-center">
                    <input 
                        type="file" 
                        ref={logoInputRef} 
                        onChange={handleFileSelect} 
                        accept="image/png" 
                        className="hidden" 
                    />
                    <div 
                        className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center border-2 border-green-400/30 bg-green-900 overflow-hidden shadow-xl transition-all ${user?.type === 'admin' ? 'cursor-pointer hover:border-green-400 hover:scale-105 group' : ''}`}
                        onClick={() => user?.type === 'admin' && !isUploadingLogo && !pendingFile && logoInputRef.current?.click()}
                        title={user?.type === 'admin' ? "Admin: Click to upload PNG logo" : "AgroSourcingGhana Logo"}
                    >
                        {currentDisplayLogo ? (
                            <img src={currentDisplayLogo} alt="App Logo" className={`w-full h-full object-cover ${isUploadingLogo ? 'opacity-50' : ''}`} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center relative bg-green-900">
                                <AgroLogoIcon className="w-full h-full" />
                                {user?.type === 'admin' && (
                                     <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                          <UploadIcon className="w-6 h-6 text-white mb-1" />
                                          <span className="text-[8px] font-bold text-white">UPLOAD</span>
                                     </div>
                                )}
                            </div>
                        )}
                        {isUploadingLogo && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                            </div>
                        )}
                    </div>

                    {/* Save/Cancel Controls for Admin */}
                    {pendingFile && !isUploadingLogo && (
                        <div className="absolute -bottom-8 flex gap-2 animate-fade-in">
                            <button 
                                onClick={handleSaveLogo}
                                className="p-1 bg-green-600 text-white rounded-full shadow-lg hover:bg-green-500 hover:scale-110 transition-all"
                                title="Save Logo"
                            >
                                <CheckCircleIcon className="w-4 h-4" />
                            </button>
                             <button 
                                onClick={handleCancelLogo}
                                className="p-1 bg-red-600 text-white rounded-full shadow-lg hover:bg-red-500 hover:scale-110 transition-all"
                                title="Cancel Upload"
                            >
                                <XIcon className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Auth Section */}
                <div className="z-10 relative">
                  <Auth 
                    user={user} 
                    onLogin={handleLogin} 
                    onLogout={handleLogout} 
                    setActiveView={setActiveView} 
                    modalState={authModalState}
                    setModalState={setAuthModalState}
                  />
                </div>
             </div>

             {/* Navigation Bar */}
             <nav className="max-w-5xl mx-auto bg-white border-b border-x border-gray-200 shadow-lg rounded-b-xl mb-8 relative z-20">
               <div className="flex justify-start sm:justify-around p-2 space-x-1 overflow-x-auto no-scrollbar">
                 <NavItem view="DASHBOARD" label="Home" icon={<HomeIcon />} activeView={activeView} setActiveView={handleSetActiveView} />
                 <NavItem view="WEATHER" label="Weather" icon={<CloudIcon />} activeView={activeView} setActiveView={handleSetActiveView} />
                 <NavItem view="MARKETPLACE" label="Marketplace" icon={<ShoppingCartIcon />} activeView={activeView} setActiveView={handleSetActiveView} />
                 <NavItem view="RENTAL" label="Rental" icon={<TractorIcon />} activeView={activeView} setActiveView={handleSetActiveView} />
                 <NavItem view="WALLET" label="Wallet" icon={<WalletIcon />} activeView={activeView} setActiveView={handleSetActiveView} />
                 <NavItem view="FORUM" label="Forum" icon={<UsersIcon />} activeView={activeView} setActiveView={handleSetActiveView} />
                 <NavItem view="ADVISORY" label="Advisory" icon={<SproutIcon />} activeView={activeView} setActiveView={handleSetActiveView} />
                 <NavItem view="DIAGNOSIS" label="Diagnose" icon={<BugIcon />} activeView={activeView} setActiveView={handleSetActiveView} />
                 <NavItem view="PRICES" label="Prices" icon={<TagIcon />} activeView={activeView} setActiveView={handleSetActiveView} />
                 <NavItem view="ADMIN" label="Admin" icon={<ShieldCheckIcon />} activeView={activeView} setActiveView={handleSetActiveView} />
               </div>
             </nav>

          <div className="max-w-5xl mx-auto">
            {renderView()}
          </div>
        </main>
        
        <NotificationArea setActiveView={setActiveView} />
      </div>
    </NotificationProvider>
  );
};

export default App;
