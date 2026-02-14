
import React, { useEffect, useState } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { getLocalWeather } from '../services/geminiService';
import type { WeatherReport, GroundingSource, WeatherForecast } from '../types';
import Card from './common/Card';
import { SunIcon, RainIcon, CloudyIcon, Spinner, WindIcon, DropletIcon, EyeIcon, GaugeIcon, SproutIcon, SearchIcon, GridIcon, ClockIcon } from './common/icons';
import { useNotifications } from '../contexts/NotificationContext';
import Button from './common/Button';

// Helper to determine icon based on string condition
const WeatherIcon: React.FC<{ condition: string; className?: string }> = ({ condition, className }) => {
  const c = (condition || '').toLowerCase(); // Safe check for undefined
  if (c.includes('rain') || c.includes('drizzle')) return <RainIcon className={className} />;
  if (c.includes('storm') || c.includes('thunder')) return <RainIcon className={className} />; // Reusing Rain for now, ideally Thunder
  if (c.includes('sun') || c.includes('clear')) return <SunIcon className={className} />;
  return <CloudyIcon className={className} />;
};

const Weather: React.FC = () => {
  const { location, loading: geoLoading, error: geoError, retry: retryGeo } = useGeolocation();
  const { addNotification } = useNotifications();
  
  const [report, setReport] = useState<WeatherReport | null>(null);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [loadingForecast, setLoadingForecast] = useState(false);
  
  // Manual Location State
  const [manualLocation, setManualLocation] = useState('');
  const [isUsingManual, setIsUsingManual] = useState(false);

  // Fetch weather based on current effective location (GPS or Manual)
  const fetchWeather = async (loc: any, isManual: boolean) => {
      setLoadingForecast(true);
      try {
          const response = await getLocalWeather(loc);
          const data = response.data;
          setReport(data);
          setSources(response.sources);
          setIsUsingManual(isManual);

          // Check for severe weather in the daily forecast
          const stormyDay = data.daily?.find(f => (f.condition || '').toLowerCase().includes('storm'));
          if(stormyDay) {
            addNotification({
                type: 'weather',
                title: 'Severe Weather Warning',
                message: `Storm expected on ${stormyDay.day}. Secure equipment.`,
                view: 'WEATHER'
            });
          }
      } catch (err) {
          console.error(err);
      } finally {
          setLoadingForecast(false);
      }
  };

  // Auto-fetch when GPS location arrives
  useEffect(() => {
    if (location) {
        fetchWeather(location, false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const handleManualSearch = (e: React.FormEvent) => {
      e.preventDefault();
      if (!manualLocation.trim()) return;
      fetchWeather(manualLocation, true);
  };

  return (
    <Card className="min-h-[500px]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-2">
          <div>
              <h2 className="text-2xl font-bold text-green-800">Regional Weather & Agro-Advisory</h2>
              <p className="text-sm text-gray-500">Hyper-local hourly and weekly forecasts.</p>
          </div>
          {report?.current?.region && (
              <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full border border-green-200">
                  Sector: {report.current.region}
              </span>
          )}
      </div>
      
      {/* Loading State */}
      {(geoLoading || loadingForecast) && (
        <div className="flex items-center justify-center p-12 bg-gray-50 border border-dashed border-gray-300 rounded-xl shadow-inner my-4">
            <Spinner className="animate-spin h-8 w-8 text-green-600" /> 
            <div className="ml-4 text-left">
                <p className="font-bold text-green-800 text-lg">Analyzing Atmospheric Data...</p>
                <p className="text-sm text-gray-500">Fetching satellite imagery and forecasts.</p>
            </div>
        </div>
      )}
      
      {/* Error / Manual Input State */}
      {(geoError && !loadingForecast && !report) && (
          <div className="space-y-4 max-w-md mx-auto py-10">
              <div className="text-red-600 bg-red-50 border border-red-200 p-4 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center gap-2 font-bold">
                       <GridIcon className="w-5 h-5" /> 
                       <span>{geoError}</span>
                  </div>
                  <p className="text-sm text-gray-700">
                      {geoError.includes("denied") 
                        ? "Please enable location services or use manual search."
                        : "Satellite signal is weak. You can retry GPS or enter your town below."}
                  </p>
                  
                  {!geoError.includes("denied") && (
                      <button 
                        onClick={retryGeo}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-700 shadow-sm flex items-center gap-2 transition-all w-fit mt-2"
                      >
                          <GridIcon className="w-4 h-4" /> Retry GPS
                      </button>
                  )}
              </div>

              {/* Manual Fallback Form */}
              <form onSubmit={handleManualSearch} className="bg-white p-4 border rounded-xl shadow-sm">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Search Location Manually</label>
                  <div className="flex gap-2">
                      <input 
                          type="text" 
                          value={manualLocation}
                          onChange={(e) => setManualLocation(e.target.value)}
                          placeholder="Enter City, Town, or Village..."
                          className="flex-grow border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 outline-none text-gray-900"
                      />
                      <Button type="submit" className="bg-green-700 hover:bg-green-800">
                          <SearchIcon className="w-4 h-4" />
                      </Button>
                  </div>
              </form>
          </div>
      )}
      
      {/* Weather Display */}
      {!geoLoading && !loadingForecast && report && (
        <div className="animate-fade-in space-y-6">
          
          {/* Location Bar */}
          <div className="flex justify-between items-center text-sm text-gray-500 bg-gray-50 p-2 rounded-lg border border-gray-100">
              <span className="flex items-center gap-1">
                <GridIcon className={`w-4 h-4 ${isUsingManual ? 'text-orange-500' : 'text-green-500'}`} />
                {isUsingManual ? `Manual Search: "${manualLocation}"` : `GPS: ${location?.latitude.toFixed(4)}, ${location?.longitude.toFixed(4)}`}
              </span>
              {isUsingManual && <button onClick={retryGeo} className="text-xs text-blue-600 hover:underline">Try GPS</button>}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Current Weather & Hourly */}
              <div className="lg:col-span-2 space-y-6">
                  {/* Current Weather Hero Card */}
                  <div className="bg-gradient-to-br from-green-700 to-green-900 text-white rounded-2xl p-6 shadow-lg relative overflow-hidden">
                      {/* Background Pattern */}
                      <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-1/4 -translate-y-1/4">
                          <SunIcon className="w-64 h-64 text-white" />
                      </div>

                      <div className="relative z-10 flex flex-col sm:flex-row justify-between items-center sm:items-start gap-6">
                          <div className="text-center sm:text-left">
                              <h3 className="text-xl font-medium text-green-100 mb-1">Current Weather</h3>
                              {report.current && (
                                  <>
                                    <div className="text-5xl sm:text-7xl font-bold tracking-tighter mb-2">
                                        {report.current.temp}°C
                                    </div>
                                    <p className="text-lg font-medium text-green-50 capitalize flex items-center justify-center sm:justify-start gap-2">
                                        <WeatherIcon condition={report.current.condition} className="w-6 h-6" />
                                        {report.current.condition}
                                    </p>
                                  </>
                              )}
                          </div>
                          
                          {report.current && (
                              <div className="grid grid-cols-2 gap-4 bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10 w-full sm:w-auto">
                                  <div className="flex items-center gap-3">
                                      <WindIcon className="w-5 h-5 text-green-200" />
                                      <div>
                                          <p className="text-xs text-green-200 uppercase">Wind</p>
                                          <p className="font-bold">{report.current.wind} km/h</p>
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                      <DropletIcon className="w-5 h-5 text-green-200" />
                                      <div>
                                          <p className="text-xs text-green-200 uppercase">Humidity</p>
                                          <p className="font-bold">{report.current.humidity}</p>
                                      </div>
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>

                  {/* Hourly Forecast Scroller */}
                  {report.hourly && report.hourly.length > 0 && (
                      <div>
                          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                              <ClockIcon className="w-5 h-5 text-gray-500" /> Hourly Forecast (24h)
                          </h3>
                          <div className="flex overflow-x-auto no-scrollbar gap-3 pb-2">
                              {report.hourly.map((hour, idx) => (
                                  <div key={idx} className="flex-shrink-0 w-24 bg-white border border-gray-200 rounded-xl p-3 flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                                      <span className="text-xs text-gray-500 mb-2">{hour.time}</span>
                                      <WeatherIcon condition={hour.condition} className="w-8 h-8 text-gray-700 mb-2" />
                                      <span className="font-bold text-gray-900">{hour.temp}°</span>
                                      <span className="text-[10px] text-gray-400 truncate w-full text-center">{hour.condition}</span>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
                  
                  {/* Advisory Box (Placed here for better visibility on mobile/tablet) */}
                  <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                      <div className="flex items-start gap-3">
                          <div className="p-2 bg-green-100 rounded-full text-green-700"><SproutIcon className="w-6 h-6" /></div>
                          <div>
                              <h3 className="font-bold text-green-900 mb-1">Agro-Advisory Note</h3>
                              <p className="text-sm text-green-800 leading-relaxed italic">
                                  "{report.advisory}"
                              </p>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Right Column: 7-Day Forecast */}
              <div className="lg:col-span-1">
                  <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                      <GridIcon className="w-5 h-5 text-gray-500" /> 7-Day Forecast
                  </h3>
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
                      {report.daily && report.daily.length > 0 ? report.daily.map((day, idx) => (
                          <div key={idx} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                              <div className="w-16 font-medium text-gray-700 text-sm">{day.day}</div>
                              <div className="flex items-center gap-2 flex-grow justify-center">
                                  <WeatherIcon condition={day.condition} className="w-6 h-6 text-gray-500" />
                                  <span className="text-xs text-gray-500 hidden sm:inline-block w-16 truncate">{day.condition}</span>
                              </div>
                              <div className="flex items-center gap-3 text-sm w-24 justify-end">
                                  <span className="font-bold text-gray-900">{day.high}°</span>
                                  <span className="text-gray-400">{day.low}°</span>
                              </div>
                          </div>
                      )) : <p className="p-4 text-gray-500 text-sm">No forecast available.</p>}
                  </div>
              </div>
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
