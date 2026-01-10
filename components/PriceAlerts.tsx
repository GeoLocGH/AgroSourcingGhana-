
import React, { useState, useEffect } from 'react';
import { Crop, PriceData, GroundingSource } from '../types';
import Card from './common/Card';
import { useNotifications } from '../contexts/NotificationContext';
import { getMarketPrices } from '../services/geminiService';
import { Spinner, TagIcon, ArrowUpIcon, ArrowDownIcon, SearchIcon } from './common/icons';

// Baseline reference for alerting logic only (approximate averages in GHS)
const priceBaselines: Record<Crop, number> = {
    [Crop.Maize]: 240, // per bag
    [Crop.Cassava]: 140, // per bag
    [Crop.Yam]: 380, // per 100 tubers (small)
    [Crop.Cocoa]: 820, // per bag
    [Crop.Rice]: 330, // per 50kg
    [Crop.Tomato]: 100, // per crate (fluctuates heavily)
    [Crop.Pepper]: 120,
    [Crop.Okro]: 180,
    [Crop.Eggplant]: 130,
    [Crop.Plantain]: 60, // per bunch
    [Crop.Banana]: 90,
    [Crop.KpakpoShito]: 220,
    [Crop.Onion]: 500, // per sack
    [Crop.Orange]: 150,
    [Crop.Ginger]: 350,
    [Crop.Sorghum]: 280,
    [Crop.Soyabean]: 300,
    [Crop.Millet]: 290,
    // Livestock Baselines (Average Unit Price)
    [Crop.Cow]: 3500,
    [Crop.Goat]: 450,
    [Crop.Sheep]: 600,
    [Crop.Chicken]: 70,
    [Crop.GuineaFowl]: 90,
    [Crop.Turkey]: 300,
    [Crop.Pig]: 800,
    [Crop.Snail]: 20, // per pack or jumbo size
    [Crop.Rabbit]: 120,
    [Crop.Fish]: 45, // per kg
}

const PriceAlerts: React.FC = () => {
  const [selectedCommodity, setSelectedCommodity] = useState<Crop>(Crop.Maize);
  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const { addNotification } = useNotifications();

  useEffect(() => {
    const fetchPrices = async () => {
      setLoading(true);
      setPriceData([]);
      setSources([]);
      try {
        const response = await getMarketPrices(selectedCommodity);
        const data = response.data;
        setPriceData(data);
        setSources(response.sources);
        setLastUpdated(new Date().toLocaleString());
        
        // Analyze for Alerts
        const basePrice = priceBaselines[selectedCommodity];
        let hasAlert = false;

        data.forEach(p => {
            // Alert if price is 20% higher than baseline OR trend is explicitly 'up'
            if ((basePrice && p.price > basePrice * 1.2) || p.trend === 'up') {
                if (!hasAlert) { // Avoid spamming multiple alerts at once
                    addNotification({
                        type: 'price',
                        title: `Price Surge: ${selectedCommodity}`,
                        message: `High prices detected at ${p.market} (GHS ${p.price}). Market trend is Up.`,
                        view: 'PRICES'
                    });
                    hasAlert = true;
                }
            }
        });
      } catch (err) {
        console.error("Failed to load prices", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommodity]);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-green-100 rounded-full text-green-700">
             <TagIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-green-800">Nationwide Market Prices</h2>
            <p className="text-xs text-gray-500">Powered by AI Search Grounding • Real-time Data</p>
          </div>
      </div>
      
      <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <label htmlFor="crop-select" className="block text-sm font-medium text-gray-700 mb-1">
          Select Commodity to Scan:
        </label>
        <select
          id="crop-select"
          value={selectedCommodity}
          onChange={(e) => setSelectedCommodity(e.target.value as Crop)}
          className="mt-1 block w-full pl-3 pr-10 py-3 text-base font-medium text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          {Object.values(Crop).map((crop) => (
            <option key={crop} value={crop}>
              {crop}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-bold text-gray-800">
            Latest Prices for {selectedCommodity}
            </h3>
            {lastUpdated && <span className="text-xs text-gray-400">Updated: {lastUpdated}</span>}
        </div>

        {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
                <Spinner className="w-8 h-8 text-green-600 mb-2" />
                <p className="text-sm text-green-700 font-medium animate-pulse">Scanning markets across Ghana...</p>
            </div>
        ) : priceData.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <p className="text-gray-500">No recent data found for this commodity. Please try again later.</p>
            </div>
        ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Market</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price (GHS)</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trend</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {priceData.map((data, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{data.market}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-700">{data.price.toFixed(2)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{data.unit || '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {data.trend === 'up' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800"><ArrowUpIcon className="w-3 h-3 mr-1"/> Up</span>}
                                    {data.trend === 'down' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800"><ArrowDownIcon className="w-3 h-3 mr-1"/> Down</span>}
                                    {(!data.trend || data.trend === 'stable') && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">Stable</span>}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400">{data.date || 'Recent'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {sources.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200">
             <p className="text-xs text-gray-500 flex items-center gap-1 mb-2 font-semibold">
                <SearchIcon className="w-3 h-3" /> Price Sources:
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
        
        <div className="mt-4 p-3 bg-blue-50 text-blue-800 text-xs rounded border border-blue-100">
            <strong>Note:</strong> Prices are aggregated from online sources and may vary from actual on-ground trading. Always confirm before transaction.
        </div>
      </div>
    </Card>
  );
};

export default PriceAlerts;
