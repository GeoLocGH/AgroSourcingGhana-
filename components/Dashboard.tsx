
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

  const colorClasses: { [key: string]: string } = {
      blue: 'bg-blue-100 text-blue-800',
      green: 'bg-green-100 text-green-800',
      red: 'bg-red-100 text-red-800',
      yellow: 'bg-yellow-100 text-yellow-800',
      teal: 'bg-teal-100 text-teal-800',
      purple: 'bg-purple-100 text-purple-800',
      indigo: 'bg-indigo-100 text-indigo-800',
      cyan: 'bg-cyan-100 text-cyan-800',
  }

  return (
    <div>
      <div className="flex flex-row justify-between items-center mb-6 bg-green-800 p-5 rounded-xl shadow-lg gap-4">
        <div className="text-left flex-grow">
           <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Welcome!, Mía Woezɔ̃!, Yɛma Mo Akwaaba!</h2>
           <p className="text-green-100">Select a feature below to get started.</p>
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
          <Card key={feature.view} onClick={() => setActiveView(feature.view as View)} className="flex flex-col items-center text-center p-6 hover:-translate-y-1">
            <div className={`p-4 rounded-full ${colorClasses[feature.color]}`}>{feature.icon}</div>
            <h3 className="mt-4 text-lg font-bold text-gray-800">{feature.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{feature.description}</p>
          </Card>
        ))}
         <Card className="sm:col-span-2 lg:col-span-3 bg-red-50 border-red-200">
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
