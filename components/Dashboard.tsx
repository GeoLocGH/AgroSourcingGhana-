
import React, { useEffect, useState, useRef } from 'react';
import Card from './common/Card';
import { CloudIcon, TagIcon, BugIcon, ShoppingCartIcon, SproutIcon, UsersIcon, AlertTriangleIcon, HarvesterIcon, WalletIcon, TractorIcon, Spinner, UploadIcon } from './common/icons';
import { useNotifications } from '../contexts/NotificationContext';
import { useGeolocation } from '../hooks/useGeolocation';
import { checkWeatherAlerts } from '../services/geminiService';
import type { View, User } from '../types';
import { uploadUserFile } from '../services/storageService';
import { supabase } from '../services/supabase';

interface DashboardProps {
  setActiveView: (view: View) => void;
  user: User | null;
}

const Dashboard: React.FC<DashboardProps> = ({ setActiveView, user }) => {
  const { addNotification } = useNotifications();
  const { location } = useGeolocation();
  const [liveAlert, setLiveAlert] = useState<string>('Initializing global weather scan...');
  const [isFetchingAlerts, setIsFetchingAlerts] = useState(false);
  
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchSettings = async () => {
        const { data } = await supabase.from('settings').select('value').eq('id', 'dashboard').single();
        if (data?.value?.logoUrl) setLogoUrl(data.value.logoUrl);
    };
    fetchSettings();

    const sub = supabase.channel('dashboard-settings')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: 'id=eq.dashboard' }, (payload) => {
             if (payload.new && (payload.new as any).value) {
                setLogoUrl((payload.new as any).value.logoUrl);
            }
        }).subscribe();
        
    return () => { sub.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (location) {
      setIsFetchingAlerts(true);
      setLiveAlert('Fetching data from trusted global meteorological sources...');
      
      checkWeatherAlerts(location)
        .then((alertText) => {
          setLiveAlert(alertText);
          const lower = alertText.toLowerCase();
          if (!lower.includes('no active') && !lower.includes('no severe') && !lower.includes('unable to fetch')) {
             addNotification({
                 type: 'weather',
                 title: 'Critical Weather Alert',
                 message: alertText,
                 view: 'WEATHER'
             });
          }
        })
        .catch(() => setLiveAlert('Unable to connect to global weather services.'))
        .finally(() => setIsFetchingAlerts(false));
    } else {
        setLiveAlert('Waiting for location access to scan for alerts...');
    }
  }, [location]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!user || user.type !== 'admin' || !user.uid) {
        alert("Only logged-in admins can upload logos.");
        return;
    }

    if (file.type !== 'image/png') {
        alert('Please select a PNG image.');
        return;
    }

    setIsUploading(true);
    try {
        const result = await uploadUserFile(user.uid, file, 'admin-logo', '', 'Dashboard Widget Logo');
        // Fix: Changed download_url to file_url
        const url = result.file_url;
        
        await supabase.from('settings').upsert({ id: 'dashboard', value: { logoUrl: url } });
        
        setLogoUrl(url);
        addNotification({ type: 'auth', title: 'Logo Updated', message: 'Dashboard banner logo updated globally.', view: 'DASHBOARD' });
    } catch (error: any) {
        console.error("Dashboard logo upload error:", error);
        alert(`Failed to upload logo: ${error.message || "Unknown error"}`);
    } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePlaceholderClick = () => {
    if (user?.type === 'admin') {
        fileInputRef.current?.click();
    }
  };

  const features = [
    { title: 'Weather Forecast', description: 'Get hyper-local weather predictions.', icon: <CloudIcon />, view: 'WEATHER', color: 'blue' },
    { title: 'Marketplace', description: 'Find certified seeds, fertilizers, and tools.', icon: <ShoppingCartIcon />, view: 'MARKETPLACE', color: 'purple' },
    { title: 'Equipment Rental', description: 'Rent tractors, plows, and more.', icon: <TractorIcon />, view: 'RENTAL', color: 'indigo' },
    { title: 'Community Forum', description: 'Connect with fellow farmers.', icon: <UsersIcon />, view: 'FORUM', color: 'teal' },
    { title: 'Mobile Money & Wallet', description: 'P2P transfers, loans, bills & insurance.', icon: <WalletIcon />, view: 'WALLET', color: 'cyan' },
    { title: 'Crop Advisory', description: 'Personalized, stage-by-stage guidance.', icon: <SproutIcon />, view: 'ADVISORY', color: 'green' },
    { title: 'Pest Diagnosis', description: 'Identify crop diseases with a photo.', icon: <BugIcon />, view: 'DIAGNOSIS', color: 'red' },
    { title: 'Market Prices', description: 'Check daily prices for your crops.', icon: <TagIcon />, view: 'PRICES', color: 'yellow' },
  ];

  const themeStyles: { [key: string]: { card: string, icon: string } } = {
      blue: { 
          card: '!bg-sky-50 !border-sky-100 hover:!border-sky-300', 
          icon: 'bg-sky-200 text-sky-700' 
      },
      purple: { 
          card: '!bg-purple-50 !border-purple-100 hover:!border-purple-300', 
          icon: 'bg-purple-200 text-purple-700' 
      },
      indigo: { 
          card: '!bg-indigo-50 !border-indigo-100 hover:!border-indigo-300', 
          icon: 'bg-indigo-200 text-indigo-700' 
      },
      teal: { 
          card: '!bg-teal-50 !border-teal-100 hover:!border-teal-300', 
          icon: 'bg-teal-200 text-teal-700' 
      },
      cyan: { 
          card: '!bg-cyan-50 !border-cyan-100 hover:!border-cyan-300', 
          icon: 'bg-cyan-200 text-cyan-700' 
      },
      green: { 
          card: '!bg-emerald-50 !border-emerald-100 hover:!border-emerald-300', 
          icon: 'bg-emerald-200 text-emerald-700' 
      },
      red: { 
          card: '!bg-rose-50 !border-rose-100 hover:!border-rose-300', 
          icon: 'bg-rose-200 text-rose-700' 
      },
      yellow: { 
          card: '!bg-amber-50 !border-amber-100 hover:!border-amber-300', 
          icon: 'bg-amber-200 text-amber-700' 
      },
  }

  return (
    <div>
      <div className="flex flex-row justify-between items-center mb-6 bg-green-800 p-5 rounded-xl shadow-lg gap-4">
        <div className="text-left flex-grow">
           <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Welcome!, Mía Woezɔ̃!, Yɛma Mo Akwaaba!</h2>
           <p className="text-green-100">Access localized tools and real-time market data.</p>
        </div>
        <div className="flex-shrink-0 bg-white p-2 rounded-lg shadow-md ml-4">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png" className="hidden" />
            <div 
                className={`h-16 w-32 sm:h-20 sm:w-40 bg-gray-50 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center text-gray-500 overflow-hidden relative ${user?.type === 'admin' ? 'cursor-pointer hover:border-green-500 hover:bg-green-50' : ''}`}
                onClick={handlePlaceholderClick}
                title={user?.type === 'admin' ? "Admin: Click to upload logo" : ""}
            >
                {logoUrl ? (
                    <img src={logoUrl} alt="Dashboard Logo" className={`w-full h-full object-contain ${isUploading ? 'opacity-50' : ''}`} />
                ) : (
                    <>
                        <UploadIcon className="w-6 h-6 mb-1 text-gray-400" />
                        <span className="text-[10px] font-bold text-gray-400">LOGO HERE (PNG)</span>
                    </>
                )}
                {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10"><Spinner /></div>
                )}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature) => (
          <Card 
            key={feature.view} 
            onClick={() => setActiveView(feature.view as View)} 
            className={`flex flex-col items-center text-center p-6 hover:-translate-y-1 !border transition-colors ${themeStyles[feature.color].card}`}
          >
            <div className={`p-4 rounded-full ${themeStyles[feature.color].icon}`}>{feature.icon}</div>
            <h3 className="mt-4 text-lg font-bold text-gray-800">{feature.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{feature.description}</p>
          </Card>
        ))}
         <Card className="sm:col-span-2 lg:col-span-3 !bg-red-50 !border !border-red-200 hover:!border-red-300">
          <div className="flex flex-col gap-4">
              <div className="flex items-start gap-4 border-b border-red-200 pb-4">
                  <div className="p-3 bg-red-600 text-white rounded-full shadow-md animate-pulse">
                      <AlertTriangleIcon className="w-8 h-8"/>
                  </div>
                  <div className="flex-grow">
                      <h3 className="text-lg font-bold text-red-800 flex items-center gap-2">
                          Global Meteorological Watch
                          {isFetchingAlerts && <Spinner />}
                      </h3>
                      <p className="text-sm text-red-600 font-medium mb-1">Live Updates from Trusted Internet Sources</p>
                      <div className="bg-white/80 p-3 rounded-md border border-red-100">
                          <p className="text-gray-800 font-semibold">{liveAlert}</p>
                      </div>
                  </div>
              </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
