
import React, { useState, useEffect } from 'react';
import { Crop, PriceData, GroundingSource } from '../types';
import Card from './common/Card';
import { useNotifications } from '../contexts/NotificationContext';
import { getMarketPrices } from '../services/geminiService';
import { Spinner, TagIcon, ArrowUpIcon, ArrowDownIcon, SearchIcon, TractorIcon } from './common/icons';

// Livestock definition consistent with Advisory
const LIVESTOCK_GROUPS = [
  'Cow', 'Goat', 'Sheep', 'Chicken', 'Guinea Fowl', 'Turkey', 'Pig', 'Snail', 'Rabbit', 'Tilapia/Catfish', 'Eggs'
];

// Configuration for Standard Units and Baselines (2025/2026 Market Context)
const commodityStandards: Record<Crop, { baselinePrice: number, unit: string }> = {
    [Crop.Maize]: { baselinePrice: 750, unit: "100kg bag" },
    [Crop.Cassava]: { baselinePrice: 280, unit: "Maxi bag (90kg+)" },
    [Crop.Yam]: { baselinePrice: 2200, unit: "100 tubers (Medium/Large)" },
    [Crop.Cocoa]: { baselinePrice: 2587, unit: "64kg bag" },
    [Crop.Rice]: { baselinePrice: 950, unit: "50kg bag (Standard)" },
    [Crop.Tomato]: { baselinePrice: 3500, unit: "Crate (Large)" },
    [Crop.Pepper]: { baselinePrice: 1200, unit: "Maxi bag" },
    [Crop.Okro]: { baselinePrice: 450, unit: "Basket (Standard)" },
    [Crop.Eggplant]: { baselinePrice: 350, unit: "Bag" },
    [Crop.Plantain]: { baselinePrice: 120, unit: "Bunch (Large)" },
    [Crop.Banana]: { baselinePrice: 150, unit: "Carton" },
    [Crop.KpakpoShito]: { baselinePrice: 800, unit: "Bucket/Small Bag" },
    [Crop.Onion]: { baselinePrice: 1500, unit: "Maxi bag" },
    [Crop.Orange]: { baselinePrice: 300, unit: "100 fruits" },
    [Crop.Ginger]: { baselinePrice: 1100, unit: "Bag" },
    [Crop.Sorghum]: { baselinePrice: 800, unit: "100kg bag" },
    [Crop.Soyabean]: { baselinePrice: 900, unit: "100kg bag" },
    [Crop.Millet]: { baselinePrice: 800, unit: "100kg bag" },
    
    // Livestock
    [Crop.Cow]: { baselinePrice: 9000, unit: "Live Animal (Medium/Large)" },
    [Crop.Goat]: { baselinePrice: 1100, unit: "Live Animal (Adult)" },
    [Crop.Sheep]: { baselinePrice: 1800, unit: "Live Animal (Adult)" },
    [Crop.Chicken]: { baselinePrice: 150, unit: "Live Bird (Layer/Broiler)" },
    [Crop.GuineaFowl]: { baselinePrice: 180, unit: "Live Bird" },
    [Crop.Turkey]: { baselinePrice: 650, unit: "Live Bird" },
    [Crop.Pig]: { baselinePrice: 2200, unit: "Live Animal (Adult)" },
    [Crop.Snail]: { baselinePrice: 400, unit: "Crate/Pack (Large)" },
    [Crop.Rabbit]: { baselinePrice: 250, unit: "Live Animal" },
    [Crop.Fish]: { baselinePrice: 70, unit: "Kg (Fresh Tilapia)" },
    [Crop.Eggs]: { baselinePrice: 85, unit: "Crate (Large 30pcs)" },
};

const PriceAlerts: React.FC = () => {
  const [selectedCommodity, setSelectedCommodity] = useState<Crop>(Crop.Maize);
  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const { addNotification } = useNotifications();

  const isLivestock = LIVESTOCK_GROUPS.includes(selectedCommodity);
  const standardInfo = commodityStandards[selectedCommodity] || { baselinePrice: 0, unit: 'Standard Unit' };

  useEffect(() => {
    const fetchPrices = async () => {
      setLoading(true);
      setPriceData([]);
      setSources([]);
      try {
        const response = await getMarketPrices(
            selectedCommodity, 
            isLivestock ? 'Livestock' : 'Crop', 
            standardInfo.unit
        );
        const data = response.data;
        setPriceData(data);
        setSources(response.sources);
        setLastUpdated(new Date().toLocaleString());
        
        // Analyze for Alerts
        const basePrice = standardInfo.baselinePrice;
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
          <div className={`p-2 rounded-full ${isLivestock ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
             {isLivestock ? <TractorIcon className="w-6 h-6" /> : <TagIcon className="w-6 h-6" />}
          </div>
          <div>
            <h2 className={`text-xl font-bold ${isLivestock ? 'text-orange-800' : 'text-green-800'}`}>
                {isLivestock ? 'Nationwide Livestock Prices' : 'Nationwide Crop Prices'}
            </h2>
            <p className="text-xs text-gray-500">Powered by AI Search Grounding • Real-time 2025/2026 Data</p>
          </div>
      </div>
      
      <div className={`mb-6 p-4 rounded-lg border ${isLivestock ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
        <label htmlFor="crop-select" className="block text-sm font-medium text-gray-700 mb-1">
          Select Commodity to Scan:
        </label>
        <div className="flex gap-2 items-center">
            <select
            id="crop-select"
            value={selectedCommodity}
            onChange={(e) => setSelectedCommodity(e.target.value as Crop)}
            className="block w-full pl-3 pr-10 py-3 text-base font-medium text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
                <optgroup label="Crops">
                    {Object.values(Crop).filter(c => !LIVESTOCK_GROUPS.includes(c)).map((crop) => (
                        <option key={crop} value={crop}>{crop}</option>
                    ))}
                </optgroup>
                <optgroup label="Livestock">
                    {Object.values(Crop).filter(c => LIVESTOCK_GROUPS.includes(c)).map((crop) => (
                        <option key={crop} value={crop}>{crop}</option>
                    ))}
                </optgroup>
            </select>
            <div className="bg-white px-4 py-2 border border-gray-300 rounded-lg hidden sm:block min-w-[140px]">
                <span className="text-[10px] text-gray-500 uppercase block font-bold">Target Market Unit</span>
                <span className="text-sm font-bold text-gray-800 truncate" title={standardInfo.unit}>{standardInfo.unit}</span>
            </div>
        </div>
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
                <Spinner className={`w-8 h-8 ${isLivestock ? 'text-orange-600' : 'text-green-600'} mb-2`} />
                <p className={`text-sm font-medium animate-pulse ${isLivestock ? 'text-orange-700' : 'text-green-700'}`}>
                    AI is fast-scanning 2026 market data for {standardInfo.unit}...
                </p>
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
                        {priceData.map((data, idx) => {
                            // Check if returned unit matches expected standard unit roughly
                            const isUnitMismatch = data.unit && data.unit.toLowerCase() !== standardInfo.unit.toLowerCase();
                            
                            return (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{data.market}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-700">{data.price.toFixed(2)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={isUnitMismatch ? 'text-orange-600 font-medium' : 'text-gray-500'}>
                                            {data.unit || standardInfo.unit}
                                        </span>
                                        {isUnitMismatch && <span className="block text-[10px] text-orange-500">(Differs from target)</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {data.trend === 'up' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800"><ArrowUpIcon className="w-3 h-3 mr-1"/> Up</span>}
                                        {data.trend === 'down' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800"><ArrowDownIcon className="w-3 h-3 mr-1"/> Down</span>}
                                        {(!data.trend || data.trend === 'stable') && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">Stable</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400">{data.date || 'Recent'}</td>
                                </tr>
                            );
                        })}
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
            <strong>Note:</strong> Prices are aggregated from online sources. "Target Market Unit" indicates the unit used for AI scanning. If the source unit differs, it is highlighted in orange. Always confirm prices before transaction.
        </div>
      </div>
    </Card>
  );
};

export default PriceAlerts;
