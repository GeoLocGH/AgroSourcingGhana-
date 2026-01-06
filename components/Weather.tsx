
import React, { useEffect, useState } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { getLocalWeather } from '../services/geminiService';
import type { WeatherForecast, GroundingSource } from '../types';
import Card from './common/Card';
import { SunIcon, RainIcon, CloudyIcon, Spinner, WindIcon, DropletIcon, EyeIcon, GaugeIcon, SproutIcon, SearchIcon } from './common/icons';
import { useNotifications } from '../contexts/NotificationContext';

const WeatherIcon: React.FC<{ condition: WeatherForecast['condition']; className?: string }> = ({ condition, className }) => {
  switch (condition) {
    case 'Sunny':
      return <SunIcon className={className} />;
    case 'Rainy':
       return <RainIcon className={className} />;
    case 'Stormy':
       return <RainIcon className={className} />; 
    case 'Cloudy':
    default:
      return <CloudyIcon className={className} />;
  }
};

const Weather: React.FC = () => {
  const { location, loading: geoLoading, error: geoError } = useGeolocation();
  const { addNotification } = useNotifications();
  const [forecasts, setForecasts] = useState<WeatherForecast[]>([]);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [regionName, setRegionName] = useState<string>('');
  
  useEffect(() => {
    if (location) {
        setLoadingForecast(true);
        getLocalWeather(location).then(response => {
            const data = response.data;
            setForecasts(data);
            setSources(response.sources);

            if (data.length > 0 && data[0].region) {
                setRegionName(data[0].region);
            }
            const stormyForecast = data.find(f => f.condition === 'Stormy');
            if(stormyForecast) {
                addNotification({
                    type: 'weather',
                    title: 'Severe Weather Warning',
                    message: `Storm expected ${stormyForecast.day.toLowerCase()} in ${data[0].region || 'your area'} with high winds. Secure equipment and protect crops.`,
                    view: 'WEATHER'
                });
            }
        }).catch(err => {
            console.error(err);
        }).finally(() => setLoadingForecast(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <Card>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
          <h2 className="text-xl font-bold text-green-700">Regional Weather & Agro-Advisory</h2>
          {regionName && (
              <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full border border-green-200">
                  Sector: {regionName}
              </span>
          )}
      </div>
      
      {(geoLoading || loadingForecast) && (
        <div className="flex items-center justify-center p-6 bg-orange-50 border border-orange-200 rounded-xl shadow-sm my-4">
            <Spinner className="animate-spin h-6 w-6 text-orange-600" /> 
            <span className="ml-3 font-bold text-orange-700 text-lg animate-pulse">Fetching live regional data...</span>
        </div>
      )}
      {geoError && <div className="text-red-600 bg-red-100 p-3 rounded-md">{geoError}</div>}
      
      {!geoLoading && !loadingForecast && location && forecasts.length > 0 && (
        <div>
          <p className="text-gray-600 mb-4 text-sm">
            Based on regional reports for: Lat {location.latitude.toFixed(2)}, Lon {location.longitude.toFixed(2)}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {forecasts.map((forecast) => (
              <div key={forecast.day} className="bg-slate-800 text-white rounded-xl p-4 shadow-lg flex flex-col gap-3 relative overflow-hidden">
                
                <div className="flex items-center justify-between">
                    {/* Left Side: Temp & Icon */}
                    <div className="flex flex-col items-start gap-1 z-10">
                        <div className="flex items-center gap-3">
                            <WeatherIcon condition={forecast.condition} className={`w-12 h-12 ${forecast.condition === 'Stormy' ? 'text-red-400' : 'text-yellow-400'}`} />
                            <div>
                                <div className="text-3xl font-bold tracking-tighter">
                                    {forecast.temp}°C <span className="text-lg text-gray-400 font-normal">/ {(forecast.temp * 9/5 + 32).toFixed(0)}°F</span>
                                </div>
                                <div className="text-sm text-gray-300 font-medium">{forecast.condition}</div>
                            </div>
                        </div>
                        <div className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">{forecast.day}</div>
                    </div>

                    {/* Right Side: Details */}
                    <div className="flex flex-col gap-1.5 text-xs sm:text-sm text-gray-300 z-10 min-w-[100px] border-l border-slate-600 pl-4">
                        <div className="flex items-center gap-2">
                            <WindIcon className="w-4 h-4 text-slate-400" />
                            <span>{forecast.wind} km/h</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <DropletIcon className="w-4 h-4 text-slate-400" />
                            <span>{forecast.humidity || '--%'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <EyeIcon className="w-4 h-4 text-slate-400" />
                            <span>{forecast.visibility || '--'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <GaugeIcon className="w-4 h-4 text-slate-400" />
                            <span>{forecast.pressure || '--'}</span>
                        </div>
                    </div>
                </div>

                {/* Agromet Note */}
                {forecast.agromet_note && (
                    <div className="mt-2 pt-2 border-t border-slate-600">
                        <div className="flex items-start gap-2">
                            <SproutIcon className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-green-100 font-medium italic">
                                "{forecast.agromet_note}"
                            </p>
                        </div>
                    </div>
                )}
              </div>
            ))}
          </div>

          {/* Sources Section */}
          {sources.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 flex items-center gap-1 mb-2 font-semibold">
                    <SearchIcon className="w-3 h-3" /> Information Sources:
                </p>
                <div className="flex flex-wrap gap-2">
                    {sources.map((source, idx) => (
                        <a 
                            key={idx} 
                            href={source.uri} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 text-blue-600 px-2 py-1 rounded-md truncate max-w-[200px]"
                        >
                            {source.title}
                        </a>
                    ))}
                </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default Weather;
