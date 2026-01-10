
import React, { useEffect, useState, useMemo, useRef } from 'react';
import Card from './common/Card';
import { CloudIcon, TagIcon, BugIcon, ShoppingCartIcon, SproutIcon, UsersIcon, AlertTriangleIcon, HarvesterIcon, WalletIcon, TractorIcon, Spinner, UploadIcon, BanknotesIcon, SearchIcon, GridIcon } from './common/icons';
import { useNotifications } from '../contexts/NotificationContext';
import { useGeolocation } from '../hooks/useGeolocation';
import { checkWeatherAlerts, getFarmingTip } from '../services/geminiService';
import { getWalletBalance } from '../services/paymentService';
import type { View, User, AdBanner } from '../types';
import { uploadUserFile } from '../services/storageService';
import { supabase } from '../services/supabase';
import Button from './common/Button';

interface DashboardProps {
  setActiveView: (view: View) => void;
  user: User | null;
}

// Simulated Ghanaian Agricultural Companies Fallback
const DEFAULT_ADS: AdBanner[] = [
    {
        id: 'sim-1',
        title: "Farmerline",
        text: "Mergdata: Digitize your farm & access finance.",
        color: "bg-transparent",
        imageUrl: "https://placehold.co/600x200/2563eb/ffffff?text=Farmerline+Solutions"
    },
    {
        id: 'sim-2',
        title: "AgroCenta",
        text: "Sell directly to off-takers at fair prices.",
        color: "bg-transparent",
        imageUrl: "https://placehold.co/600x200/16a34a/ffffff?text=AgroCenta+Market+Access"
    },
    {
        id: 'sim-3',
        title: "TroTro Tractor",
        text: "Reliable mechanization services on demand.",
        color: "bg-transparent",
        imageUrl: "https://placehold.co/600x200/ea580c/ffffff?text=TroTro+Tractor+Rentals"
    }
];

const DEFAULT_PARTNERS = [
    { 
        id: 'mofa',
        type: 'component',
        render: () => (
            <div className="flex flex-col items-center justify-center h-full w-full bg-white px-1 select-none pointer-events-none">
                <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tighter leading-none">MoFA</h1>
                <p className="text-[6px] sm:text-[7px] font-extrabold text-gray-600 text-center leading-tight mt-0.5 uppercase tracking-wide">
                    Ministry of Food & Agriculture
                </p>
            </div>
        )
    },
    { 
        id: 'ghana',
        type: 'image',
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Coat_of_arms_of_Ghana.svg/1200px-Coat_of_arms_of_Ghana.svg.png', 
        name: 'Ghana' 
    }
];

const Dashboard: React.FC<DashboardProps> = ({ setActiveView, user }) => {
  const { addNotification } = useNotifications();
  const { location, error: geoError } = useGeolocation();
  
  // Manual Location Handling
  const [manualLocation, setManualLocation] = useState('');
  const [inputLocation, setInputLocation] = useState('');

  const [liveAlert, setLiveAlert] = useState<string>('Initializing global weather scan...');
  const [dailyTip, setDailyTip] = useState<string>('Loading daily insight...');
  const [isFetchingAlerts, setIsFetchingAlerts] = useState(false);
  
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [walletBalance, setWalletBalance] = useState<number>(0);

  // Ad Banner State
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [adBanners, setAdBanners] = useState<AdBanner[]>(DEFAULT_ADS);

  // Partner Logo State
  const [currentPartnerIndex, setCurrentPartnerIndex] = useState(0);

  // Combine Admin Logo with Default Partners
  const partners = useMemo(() => {
      const list: any[] = [...DEFAULT_PARTNERS];
      if (logoUrl) {
          // Add Admin uploaded logo to the rotation
          list.unshift({ id: 'custom', type: 'image', name: 'Featured Partner', url: logoUrl });
      }
      return list;
  }, [logoUrl]);

  // Fetch Ads and Settings
  useEffect(() => {
    const fetchSettings = async () => {
        // Fetch Logo
        const { data: logoData } = await supabase.from('settings').select('value').eq('id', 'dashboard').single();
        if (logoData?.value?.logoUrl) setLogoUrl(logoData.value.logoUrl);

        // Fetch Ads
        const { data: adsData } = await supabase.from('settings').select('value').eq('id', 'ad_banners').single();
        if (adsData?.value?.banners && Array.isArray(adsData.value.banners) && adsData.value.banners.length > 0) {
            setAdBanners(adsData.value.banners);
        }
    };
    fetchSettings();

    const sub = supabase.channel('dashboard-settings')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => {
             const newData = payload.new as any;
             if (newData.id === 'dashboard' && newData.value?.logoUrl) {
                setLogoUrl(newData.value.logoUrl);
             }
             if (newData.id === 'ad_banners' && newData.value?.banners) {
                 setAdBanners(newData.value.banners);
             }
        }).subscribe();
        
    return () => { sub.unsubscribe(); };
  }, []);

  // Ad rotation effect
  useEffect(() => {
      if (adBanners.length <= 1) return;
      const interval = setInterval(() => {
          setCurrentAdIndex((prev) => (prev + 1) % adBanners.length);
      }, 8000);
      return () => clearInterval(interval);
  }, [adBanners]);

  // Partner rotation effect (5 seconds)
  useEffect(() => {
      if (partners.length <= 1) return;
      const interval = setInterval(() => {
          setCurrentPartnerIndex((prev) => (prev + 1) % partners.length);
      }, 5000);
      return () => clearInterval(interval);
  }, [partners]);

  useEffect(() => {
    // Determine the effective location: GPS object or Manual String
    const effectiveLocation = manualLocation ? manualLocation : location;

    if (effectiveLocation) {
      setIsFetchingAlerts(true);
      setLiveAlert('Fetching data from trusted global meteorological sources...');
      
      checkWeatherAlerts(effectiveLocation)
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

      // Fetch Daily Tip
      getFarmingTip(effectiveLocation)
        .then(setDailyTip)
        .catch(() => setDailyTip("Review your irrigation schedule today."));

    } else if (geoError) {
        setLiveAlert('Location access failed. Please enter location manually below.');
        setDailyTip('Enable location or enter city to get localized tips.');
    } else {
        setLiveAlert('Waiting for location access to scan for alerts...');
    }
  }, [location, manualLocation, geoError]); // Re-run when GPS comes in or user sets manual

  useEffect(() => {
      if (user?.uid) {
          getWalletBalance(user.uid).then(setWalletBalance);
      } else {
          setWalletBalance(0);
      }
  }, [user]);

  const handleManualSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if(inputLocation.trim()) {
          setManualLocation(inputLocation);
      }
  };

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
    { title: 'Marketplace', description: 'Find certified seeds, fertilizers, and tools.', icon: <ShoppingCartIcon />, view: 'MARKETPLACE', color: 'purple' },
    { title: 'Market Prices', description: 'Check daily prices for your crops.', icon: <TagIcon />, view: 'PRICES', color: 'yellow' },
    { title: 'Equipment Rental', description: 'Rent tractors, plows, and more.', icon: <TractorIcon />, view: 'RENTAL', color: 'indigo' },
    { title: 'Community Forum', description: 'Connect with fellow farmers.', icon: <UsersIcon />, view: 'FORUM', color: 'teal' },
    { title: 'Mobile Money & Wallet', description: 'P2P transfers, loans, bills & insurance.', icon: <WalletIcon />, view: 'WALLET', color: 'cyan' },
    { title: 'Weather Forecast', description: 'Get hyper-local weather predictions.', icon: <CloudIcon />, view: 'WEATHER', color: 'blue' },
    { title: 'Crop Advisory', description: 'Personalized, stage-by-stage guidance.', icon: <SproutIcon />, view: 'ADVISORY', color: 'green' },
    { title: 'Pest Diagnosis', description: 'Identify crop diseases with a photo.', icon: <BugIcon />, view: 'DIAGNOSIS', color: 'red' },
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
        <div className="flex-shrink-0 flex flex-col items-center ml-4">
            <span className="text-[10px] uppercase font-bold text-green-200 mb-1 tracking-wider text-center w-full">Partners:</span>
            <div className="bg-white p-2 rounded-lg shadow-md">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png" className="hidden" />
                <div 
                    className={`h-16 w-32 sm:h-20 sm:w-40 bg-gray-50 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center text-gray-500 overflow-hidden relative ${user?.type === 'admin' ? 'cursor-pointer hover:border-green-500 hover:bg-green-50' : ''}`}
                    onClick={handlePlaceholderClick}
                    title={user?.type === 'admin' ? "Admin: Click to upload custom Partner logo" : ""}
                >
                    {partners.map((partner, idx) => (
                        <div 
                            key={partner.id || idx}
                            className={`absolute inset-0 w-full h-full flex items-center justify-center transition-opacity duration-1000 ease-in-out ${idx === currentPartnerIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                        >
                            {partner.type === 'image' ? (
                                <img 
                                    src={partner.url} 
                                    alt={partner.name} 
                                    className="w-full h-full object-contain p-1" 
                                />
                            ) : (
                                partner.render()
                            )}
                        </div>
                    ))}
                    
                    {partners.length === 0 && !isUploading && (
                        <>
                            <UploadIcon className="w-6 h-6 mb-1 text-gray-400" />
                            <span className="text-[10px] font-bold text-gray-400">LOGO HERE (PNG)</span>
                        </>
                    )}
                    
                    {isUploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10 z-20"><Spinner /></div>
                    )}
                </div>
            </div>
        </div>
      </div>

      {/* Ad Banner Card */}
      {adBanners.length > 0 && (
          <Card className="flex flex-col items-center justify-center text-center p-0 overflow-hidden relative min-h-[200px] border-2 border-orange-700 hover:border-orange-600 mb-6 bg-gray-900 shadow-xl shadow-orange-900/20 transition-all">
              <span className="absolute top-2 right-2 text-[10px] text-orange-500 border border-orange-500 bg-gray-900/90 px-1.5 rounded z-20 shadow-sm backdrop-blur-sm font-bold tracking-wide">Sponsored</span>
              {adBanners.map((ad, idx) => (
                  <div 
                      key={ad.id} 
                      className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center transition-opacity duration-1000 ease-in-out ${idx === currentAdIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'} ${ad.imageUrl ? '' : ad.color}`}
                  >
                      {ad.imageUrl && (
                          <div className="absolute inset-0 z-0">
                              <img src={ad.imageUrl} alt={ad.title} className="w-full h-full object-cover opacity-40" />
                              <div className="absolute inset-0 bg-gradient-to-t from-gray-900/95 via-gray-900/70 to-gray-900/40"></div>
                          </div>
                      )}
                      
                      <div className="relative z-10 flex flex-col items-center">
                          {ad.imageUrl ? (
                               <img src={ad.imageUrl} alt="Logo" className="h-16 w-auto object-contain mb-3 rounded-md shadow-lg bg-white p-1 border border-gray-200" />
                          ) : (
                               <div className="mb-4 p-3 bg-gray-800 rounded-full shadow-lg border border-gray-700">
                                   <SproutIcon className="w-8 h-8 text-green-400" />
                               </div>
                          )}
                          <h3 className="text-2xl font-extrabold text-white mb-1 drop-shadow-md tracking-tight">{ad.title}</h3>
                          <p className="text-base text-gray-200 mb-4 font-medium max-w-lg leading-relaxed drop-shadow-sm">{ad.text}</p>
                          <Button className="py-2 px-6 text-xs shadow-md bg-green-700 hover:bg-green-600 text-white border-none transform hover:scale-105 transition-transform ring-1 ring-white/20">
                              Learn More
                          </Button>
                      </div>
                  </div>
              ))}
          </Card>
      )}

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

        {/* Live Wallet Widget Card - Fills empty grid slot */}
        <Card 
            onClick={() => setActiveView('WALLET')}
            className="flex flex-col items-center justify-center text-center p-6 hover:-translate-y-1 !border transition-colors bg-emerald-50 border-emerald-100 hover:border-emerald-300 cursor-pointer"
        >
            <div className="p-4 rounded-full bg-emerald-200 text-emerald-700 mb-4">
                <BanknotesIcon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">My Wallet</h3>
            {user ? (
                <div className="mt-2">
                    <p className="text-2xl font-bold text-emerald-700">
                        GHS {walletBalance.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-emerald-600 font-medium">Available Balance</p>
                </div>
            ) : (
                <p className="mt-2 text-sm text-gray-600 font-medium">Log in to view balance</p>
            )}
        </Card>

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
                      
                      {(!location && !manualLocation) ? (
                           <div className="mt-2">
                                <p className="text-gray-800 font-semibold mb-2">{liveAlert}</p>
                                {/* Manual Fallback Input */}
                                <form onSubmit={handleManualSubmit} className="flex gap-2 max-w-sm">
                                    <input 
                                        type="text" 
                                        placeholder="Enter your town/city..." 
                                        value={inputLocation}
                                        onChange={e => setInputLocation(e.target.value)}
                                        className="flex-grow px-3 py-1.5 border border-red-300 rounded text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-red-500"
                                    />
                                    <Button type="submit" className="text-xs py-1.5 bg-red-600 hover:bg-red-700">Check</Button>
                                </form>
                           </div>
                      ) : (
                          <div className="bg-white/80 p-3 rounded-md border border-red-100 flex justify-between items-center">
                              <p className="text-gray-800 font-semibold">{liveAlert}</p>
                              {manualLocation && <button onClick={() => setManualLocation('')} className="text-xs text-blue-600 underline ml-2">Clear Manual Location</button>}
                          </div>
                      )}
                  </div>
              </div>
          </div>
        </Card>

        {/* Daily Tip Card */}
        <Card className="flex flex-col items-start p-6 hover:-translate-y-1 !border transition-colors bg-green-50 border-green-100 hover:border-green-300">
            <div className="p-3 rounded-full bg-green-200 text-green-700 mb-3">
                <SproutIcon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Daily Tip</h3>
            <p className="mt-2 text-sm text-gray-700 font-medium italic">"{dailyTip}"</p>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
