
import React, { useState, useEffect } from 'react';
import { getAdvisory } from '../services/geminiService';
import { useGeolocation } from '../hooks/useGeolocation';
import type { AdvisoryStage, GroundingSource } from '../types';
import { Crop } from '../types';
import Card from './common/Card';
import Button from './common/Button';
import { Spinner, TimelineIcon, SearchIcon, AlertTriangleIcon, SproutIcon } from './common/icons';

const CropAdvisory: React.FC = () => {
  const { location, loading: geoLoading, error: geoError } = useGeolocation();
  const [selectedCrop, setSelectedCrop] = useState<Crop>(Crop.Maize);
  const [plantingDate, setPlantingDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [advisory, setAdvisory] = useState<AdvisoryStage[]>([]);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!location) return;
    setLoading(true);
    setError('');
    setAdvisory([]);
    setSources([]);

    try {
      const response = await getAdvisory(selectedCrop, plantingDate, location);
      setAdvisory(response.data);
      setSources(response.sources);
    } catch (err) {
      console.error(err);
      setError('Failed to generate advisory. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate if location loads and no data yet
  useEffect(() => {
    if (location && !loading && advisory.length === 0 && !error) {
       // Optional: Auto-load or wait for user. Let's wait for user to confirm crop/date usually, 
       // but for smooth UX we can just show the "Generate" button state or auto-load defaults.
       // We'll leave it manual to let user pick date/crop first.
    }
  }, [location]);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-green-100 rounded-full text-green-700">
             <SproutIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-green-800">Smart Crop Advisory</h2>
            <p className="text-xs text-gray-500">Real-time farming guidance based on current conditions.</p>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Crop</label>
          <select
            value={selectedCrop}
            onChange={(e) => setSelectedCrop(e.target.value as Crop)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          >
            {Object.values(Crop).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Planting Date</label>
          <input
            type="date"
            value={plantingDate}
            onChange={(e) => setPlantingDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          />
        </div>
      </div>

      {geoError && <div className="mb-4 text-red-600 bg-red-50 p-3 rounded">{geoError}</div>}

      <div className="flex justify-end mb-6">
        <Button 
            onClick={handleGenerate} 
            disabled={loading || geoLoading || !location} 
            isLoading={loading}
            className="w-full md:w-auto"
        >
          {loading ? 'Analyzing Conditions...' : 'Generate Plan'}
        </Button>
      </div>

      {error && (
         <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 mb-4 flex items-center gap-2">
             <AlertTriangleIcon className="w-5 h-5" />
             {error}
         </div>
      )}

      <div className="space-y-6 relative">
        {advisory.length > 0 && (
            <div className="absolute left-3.5 top-2 bottom-2 w-0.5 bg-green-200"></div>
        )}
        
        {advisory.map((stage, index) => (
          <div key={index} className="relative pl-10 animate-fade-in" style={{ animationDelay: `${index * 100}ms` }}>
            <div className="absolute left-0 top-0 p-1.5 bg-green-500 rounded-full border-4 border-white shadow-sm z-10">
               <div className="w-2 h-2 bg-white rounded-full"></div>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg text-gray-800">{stage.stage}</h3>
                  <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wide">
                      {stage.timeline}
                  </span>
              </div>
              <ul className="space-y-2">
                {stage.instructions.map((instruction, i) => (
                  <li key={i} className="flex items-start text-sm text-gray-600">
                    <span className="mr-2 mt-1.5 w-1.5 h-1.5 bg-green-400 rounded-full flex-shrink-0"></span>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {sources.length > 0 && (
          <div className="mt-8 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 flex items-center gap-1 mb-2 font-semibold">
               <SearchIcon className="w-3 h-3" /> Data Sources (Google Search Grounding):
            </p>
            <div className="flex flex-wrap gap-2">
                {sources.map((source, idx) => (
                    <a 
                        key={idx} 
                        href={source.uri} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 text-blue-600 px-2 py-1 rounded-md truncate max-w-[250px] flex items-center gap-1 transition-colors"
                        title={source.title}
                    >
                        {source.title}
                    </a>
                ))}
            </div>
          </div>
      )}
    </Card>
  );
};

export default CropAdvisory;
