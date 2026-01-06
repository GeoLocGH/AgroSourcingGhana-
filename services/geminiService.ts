

import { GoogleGenAI, Type } from "@google/genai";
import { Crop, GeoLocation, WeatherForecast, PriceData, AdvisoryStage, ServiceResponse, GroundingSource } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const model = 'gemini-2.5-flash';

// Helper to extract sources from grounding metadata
const extractSources = (response: any): GroundingSource[] => {
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return chunks
        .map((c: any) => c.web ? { title: c.web.title, uri: c.web.uri } : null)
        .filter((s: any) => s !== null) as GroundingSource[];
};

const DIAGNOSIS_PROMPT = `You are an expert agronomist specializing in common crops and pests in Ghana. Analyze the provided image of a plant leaf. Identify the likely disease or pest infestation. Provide a concise report with the following sections in Markdown format: 
### Diagnosis
**[Name of disease/pest]**
### Symptoms
- [Brief description of visual symptoms]
- [Another symptom]
### Recommended Treatment
**Organic Options:**
- [Organic treatment 1]
- [Organic treatment 2]
**Chemical Options:**
- [Chemical treatment 1]
- [Chemical treatment 2]
### Prevention Tips
- [Preventive measure 1]
- [Preventive measure 2]

Format the response in simple, actionable language suitable for smallholder farmers in Ghana. If the image is unclear or not a plant, state that and ask for a better picture.`;

// Simple in-memory cache
const cache: Record<string, { timestamp: number, data: any }> = {};
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes (reduced for real-time nature)

// Helper for retry logic with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 2000,
  factor = 2
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Check for various forms of 429/Resource Exhausted errors
    const isRateLimit = 
        error?.status === 429 || 
        error?.code === 429 || 
        error?.message?.includes('429') || 
        error?.message?.includes('Resource has been exhausted') ||
        error?.message?.includes('quota');

    if (retries > 0 && isRateLimit) {
      console.warn(`Rate limit hit. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * factor, factor);
    }
    throw error;
  }
}

export const diagnosePlant = async (imageBase64: string, mimeType: string): Promise<string> => {
  const callApi = async () => {
    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      },
    };

    const textPart = {
      text: DIAGNOSIS_PROMPT,
    };

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [imagePart, textPart] },
    });

    if (response.text) {
      return response.text;
    } else {
      return "No diagnosis could be generated. The model did not provide a response. Please try again with a clearer image.";
    }
  };

  try {
    return await retryWithBackoff(callApi);
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error && (error.message.includes('429') || error.message.includes('exhausted'))) {
        return "The service is currently busy due to high demand (Quota Exceeded). Please wait a minute and try again.";
    }
    return `An error occurred while diagnosing: ${error instanceof Error ? error.message : String(error)}. Please check your connection and try again.`;
  }
};

export const getAdvisory = async (crop: Crop, plantingDate: string, location: GeoLocation): Promise<ServiceResponse<AdvisoryStage[]>> => {
  const ADVISORY_PROMPT = `
  Act as an expert agronomist. 
  First, search for the current agricultural conditions, recent pest outbreaks (like Fall Armyworm or others), and weather patterns specifically for "${crop}" in Ghana near Latitude ${location.latitude}, Longitude ${location.longitude} for the current date (${new Date().toDateString()}).

  Based on this real-time context and the planting date of ${plantingDate}, generate a stage-by-stage crop advisory plan.
  
  Provide a detailed, stage-by-stage guide. The advice should be practical, actionable, and tailored to the CURRENT real-world conditions in Ghana found via search.
  For the stage corresponding to the current date, include specific warnings or actions based on your search findings (e.g., "Due to recent reports of X in the region...").
  
  Output the result ONLY as a raw valid JSON array of objects. Do NOT use markdown code blocks.
  
  JSON Schema:
  [
    {
      "stage": "string (Name of the growth stage)",
      "timeline": "string (e.g., 'Week 1-2' or 'Current Stage')",
      "instructions": ["string", "string"] (List of specific actions)
    }
  ]
  `;

  const callApi = async () => {
     const response = await ai.models.generateContent({
      model: model,
      contents: ADVISORY_PROMPT,
      config: {
        tools: [{ googleSearch: {} }],
        // responseMimeType cannot be used with googleSearch tools for this model configuration sometimes, 
        // relying on manual JSON parsing for robustness with search grounding.
      },
     });
     
     if (response.text) {
        let jsonStr = response.text.trim();
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '');
        } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '');
        }
        
        return {
            data: JSON.parse(jsonStr) as AdvisoryStage[],
            sources: extractSources(response)
        };
     } else {
        throw new Error("The model did not return any text.");
     }
  };

  try {
    return await retryWithBackoff(callApi);
  } catch (error) {
    console.error("Error generating advisory:", error);
    // Fallback static data if search fails
    return {
        data: [{ 
            stage: "General Advisory (Offline)", 
            timeline: "N/A", 
            instructions: ["Could not fetch real-time data. Please check connection.", "Ensure regular watering.", "Scout for pests daily."] 
        }],
        sources: []
    };
  }
};

export const checkWeatherAlerts = async (location: GeoLocation): Promise<string> => {
  const cacheKey = `alerts-${location.latitude.toFixed(2)}-${location.longitude.toFixed(2)}`;
  const cached = cache[cacheKey];
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      return cached.data;
  }

  const prompt = `Search for current severe weather warnings, floods, drought alerts, or extreme heat advisories specifically for agricultural areas in Ghana near latitude ${location.latitude}, longitude ${location.longitude}. Summarize any active alerts in one short sentence. If there are no active severe alerts, simply say "No active severe weather alerts at this time."`;

  const callApi = async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    const result = response.text || "No active severe weather alerts at this time.";
    cache[cacheKey] = { timestamp: Date.now(), data: result };
    return result;
  };

  try {
    return await retryWithBackoff(callApi);
  } catch (error) {
    console.error("Error checking weather alerts:", error);
    return "Unable to fetch live weather alerts. Please check local radio.";
  }
};

export const getLocalWeather = async (location: GeoLocation): Promise<ServiceResponse<WeatherForecast[]>> => {
    const cacheKey = `weather-${location.latitude.toFixed(2)}-${location.longitude.toFixed(2)}`;
    const cached = cache[cacheKey];
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        return cached.data;
    }

    const prompt = `
      First, identify the Region and weather sector (e.g., Southern, Middle, Northern) in Ghana for latitude ${location.latitude}, longitude ${location.longitude}.
      Then, find the specific regional weather forecast and Agrometeorological Advisory for this area for Today, Tomorrow, and the Day After.
      
      Look for data similar to regional reports found on sites like 'ghaap.com/weather-forecast/'.
      
      Output the result ONLY as a raw valid JSON array of 3 objects. Do NOT use markdown code blocks (like \`\`\`json).
      
      Each object must follow this exact structure:
      {
        "day": "string (e.g., 'Today', 'Tomorrow')",
        "condition": "string (Must be exactly one of: 'Sunny', 'Cloudy', 'Rainy', 'Stormy')",
        "temp": number (Temperature in Celsius),
        "wind": number (Wind speed in km/h),
        "humidity": "string (e.g., '61%')",
        "visibility": "string (e.g., '10 km')",
        "pressure": "string (e.g., '1021 hPa')",
        "region": "string (The identified region or sector name)",
        "agromet_note": "string (Brief Agrometeorological Advisory for farmers, e.g., 'Favorable for drying grains', 'Avoid spraying due to high winds', 'Expect heavy rains, clear drains')"
      }
    `;

    const callApi = async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            }
        });
        
        if (response.text) {
            let jsonStr = response.text.trim();
            if (jsonStr.startsWith('```json')) {
                jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '');
            } else if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '');
            }
            
            const data = JSON.parse(jsonStr) as WeatherForecast[];
            const result = { data, sources: extractSources(response) };
            
            cache[cacheKey] = { timestamp: Date.now(), data: result };
            return result;
        }
        throw new Error("No weather data returned.");
    };

    try {
        return await retryWithBackoff(callApi);
    } catch (error) {
        console.error("Error fetching weather:", error);
        // Fallback
        return {
            data: [
                { day: 'Today', condition: 'Sunny', temp: 30, wind: 10, humidity: '60%', visibility: '10 km', pressure: '1012 hPa', region: 'Accra (Fallback)', agromet_note: 'General conditions are fair.' },
                { day: 'Tomorrow', condition: 'Cloudy', temp: 29, wind: 12, humidity: '65%', visibility: '9 km', pressure: '1010 hPa', region: 'Accra (Fallback)', agromet_note: 'Good day for field work.' },
                { day: 'In 2 Days', condition: 'Rainy', temp: 28, wind: 15, humidity: '80%', visibility: '8 km', pressure: '1008 hPa', region: 'Accra (Fallback)', agromet_note: 'Prepare for rains.' },
            ],
            sources: []
        };
    }
};

export const getMarketPrices = async (crop: string): Promise<ServiceResponse<PriceData[]>> => {
    const cacheKey = `market_prices_${crop}`;
    if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_DURATION) {
         return cache[cacheKey].data;
    }

    const prompt = `
      Act as an agricultural market expert. Search for the most recent wholesale market prices for "${crop}" in Ghana and key sub-Saharan markets.
      Focus on major trading centers like Techiman, Agbogbloshie, Kumasi Central, Tamale, and others relevant to the crop.
      
      Look for data from reliable sources like Esoko, Ministry of Food and Agriculture, or recent news reports.
      
      Output strictly a raw JSON array of objects (no markdown, no backticks).
      Schema:
      [
        {
          "market": "string (Name of the market, e.g. 'Techiman Market')",
          "price": number (Price in GHS. If given in other currency, convert approx to GHS. If a range is found, use the average),
          "unit": "string (e.g., '100kg bag', 'Tonne', 'Box', 'Crate')",
          "trend": "string ('up', 'down', or 'stable' based on recent news or comparison)",
          "date": "string (approximate date of data or 'Current')"
        }
      ]
      
      Provide at least 4 different markets if possible.
    `;

    const callApi = async () => {
         const response = await ai.models.generateContent({
             model: 'gemini-2.5-flash',
             contents: prompt,
             config: { tools: [{ googleSearch: {} }] }
         });

         const text = response.text;
         if (!text) throw new Error("No data returned from AI");
         
         let jsonStr = text.trim();
         if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '');
         } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '');
         }
         
         return {
             data: JSON.parse(jsonStr),
             sources: extractSources(response)
         };
    };

    try {
        const result = await retryWithBackoff(callApi);
        cache[cacheKey] = { timestamp: Date.now(), data: result };
        return result;
    } catch (e) {
        console.error("Error fetching market prices:", e);
        return { data: [], sources: [] };
    }
};