
import { GoogleGenAI, Type } from "@google/genai";
import type { GeoLocation, WeatherForecast, PriceData, AdvisoryStage, ServiceResponse, PaymentExtractionResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

// Renamed helper to avoid conflicts if needed, but keeping it simple
async function retryWithBackoffHelper<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoffHelper(fn, retries - 1, delay * 2);
  }
}

function extractSources(response: any) {
    return response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || 'Source',
        uri: chunk.web?.uri || ''
    })).filter((s: any) => s.uri) || [];
}

export const checkWeatherAlerts = async (location: GeoLocation | string): Promise<string> => {
    const locString = typeof location === 'string' 
        ? location 
        : `${location.latitude}, ${location.longitude}`;

    const prompt = `Check for active severe weather alerts for location: ${locString}. 
    If none, say "No active severe weather alerts."`;
    
    return retryWithBackoffHelper(async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });
        return response.text || "No active severe weather alerts.";
    });
};

export const getFarmingTip = async (location: GeoLocation | string): Promise<string> => {
    const locString = typeof location === 'string'
        ? location
        : `${location.latitude}, ${location.longitude}`;

    const prompt = `Provide one specific, actionable farming tip for a farmer in ${locString} for today, considering the typical climate or current season in Ghana. Keep it under 20 words.`;

    return retryWithBackoffHelper(async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });
        return response.text || "Inspect your crops for early signs of pests.";
    });
};

export const getLocalWeather = async (location: GeoLocation | string): Promise<ServiceResponse<WeatherForecast[]>> => {
    const locString = typeof location === 'string' 
        ? location 
        : `${location.latitude}, ${location.longitude}`;

    const prompt = `Get the 3-day weather forecast for ${locString}. Return JSON.`;
    
    return retryWithBackoffHelper(async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            day: { type: Type.STRING },
                            condition: { type: Type.STRING, enum: ['Sunny', 'Cloudy', 'Rainy', 'Stormy'] },
                            temp: { type: Type.NUMBER },
                            wind: { type: Type.NUMBER },
                            humidity: { type: Type.STRING },
                            visibility: { type: Type.STRING },
                            pressure: { type: Type.STRING },
                            region: { type: Type.STRING },
                            agromet_note: { type: Type.STRING }
                        },
                        required: ['day', 'condition', 'temp', 'wind', 'humidity', 'visibility', 'pressure', 'region']
                    }
                }
            }
        });
        
        const data = JSON.parse(response.text || "[]");
        const sources = extractSources(response);
        return { data, sources };
    });
};

export const getMarketPrices = async (commodity: string, category: 'Crop' | 'Livestock' = 'Crop', preferredUnit: string = ''): Promise<ServiceResponse<PriceData[]>> => {
    const unitInstruction = preferredUnit 
        ? `Strictly find prices for the unit: "${preferredUnit}". If online sources quote a different unit (e.g. per kg, per bowl), CONVERT the price to "${preferredUnit}" based on typical weights (e.g. Maize bag = 100kg) and note this in the unit column. Ensure the data is recent (2025/2026).` 
        : '';
        
    const prompt = category === 'Livestock'
        ? `Get current (2025/2026) market prices for live ${commodity} in major livestock markets in Ghana. ${unitInstruction} Return JSON. Columns: Market, Price (GHS), Unit (e.g. ${preferredUnit || 'per animal'}), Date, Trend.`
        : `Get current (2025/2026) market prices for ${commodity} (crop produce) in major markets in Ghana. ${unitInstruction} Return JSON. Columns: Market, Price (GHS), Unit (e.g. ${preferredUnit || 'bag, crate'}), Date, Trend.`;

    return retryWithBackoffHelper(async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            market: { type: Type.STRING },
                            price: { type: Type.NUMBER },
                            unit: { type: Type.STRING },
                            date: { type: Type.STRING },
                            trend: { type: Type.STRING, enum: ['up', 'down', 'stable'] }
                        },
                        required: ['market', 'price', 'unit', 'trend']
                    }
                }
            }
        });

        const data = JSON.parse(response.text || "[]");
        const sources = extractSources(response);
        return { data, sources };
    });
};

export const diagnosePlant = async (base64Image: string, mimeType: string): Promise<string> => {
    return retryWithBackoffHelper(async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { inlineData: { mimeType, data: base64Image } },
                    { text: "Diagnose the disease or pest affecting this plant. Provide treatment recommendations in Markdown." }
                ]
            }
        });
        return response.text || "Diagnosis failed.";
    });
};

export const getAdvisory = async (subject: string, date: string, location: GeoLocation | string, category: 'Crop' | 'Livestock'): Promise<ServiceResponse<AdvisoryStage[]>> => {
    const locString = typeof location === 'string' 
        ? location 
        : `${location.latitude}, ${location.longitude}`;
        
    let prompt;
    if (category === 'Livestock') {
        prompt = `Create a livestock rearing advisory for ${subject} in Ghana, starting from ${date} at location ${locString}. 
        Return JSON. The advisory must be specific to raising animals.
        Do NOT use terms like 'seed', 'germination', or 'planting'. 
        Use terms like 'housing', 'brooding', 'feeding', 'vaccination', 'weaning'.
        Stages should be sequential (e.g., Housing Prep, Arrival/Birth, Growing, Maturity).`;
    } else {
        prompt = `Create a crop farming advisory for ${subject} in Ghana, planted on ${date} at location ${locString}. 
        Return JSON. Focus on stages like Land Prep, Planting, Vegetative, Flowering, Harvest.`;
    }

    return retryWithBackoffHelper(async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            stage: { type: Type.STRING },
                            timeline: { type: Type.STRING },
                            instructions: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ['stage', 'timeline', 'instructions']
                    }
                }
            }
        });

        const data = JSON.parse(response.text || "[]");
        const sources = extractSources(response);
        return { data, sources };
    });
};

export const parsePaymentSMS = async (smsText: string): Promise<PaymentExtractionResult> => {
    const prompt = `Extract payment details from this SMS: "${smsText}". Return JSON.`;

    return retryWithBackoffHelper(async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        status: { type: Type.STRING, enum: ['pending', 'completed', 'failed', 'flagged'] },
                        amount: { type: Type.NUMBER },
                        provider_reference: { type: Type.STRING },
                        phone_number: { type: Type.STRING }
                    },
                    required: ['status', 'amount', 'provider_reference', 'phone_number']
                }
            }
        });

        return JSON.parse(response.text || "{}") as PaymentExtractionResult;
    });
};

export const generateAnalyticsReport = async (inputData: string): Promise<string> => {
    const prompt = `
    You are the Executive Strategy AI for Agro Sourcing Ghana. The CEO has provided transaction data below.
    
    Data:
    ${inputData}

    Task:
    1. **Data Parsing**: If the data is CSV, parse it intelligently.
    2. **Day of Week Analysis**: For any dates provided, determine the Day of the Week. Identify which day has the highest volume.
    3. **Metrics Calculation**:
       - Calculate Week-Over-Week (WoW) growth if applicable.
       - Calculate **Average Transaction Value (ATV)** = Total Revenue / Total Transactions.
    4. **Provider Comparison**: Compare Mobile Money Providers (MTN vs Telecel/Vodafone/AirtelTigo).
    5. **Executive Summary**: Write a concise 3-sentence executive summary suitable for sending via WhatsApp.

    Formatting:
    - Use Markdown for the main analysis.
    - Use bolding for key figures.
    - Put the 'WhatsApp Summary' in a distinct block at the end.
    `;

    return retryWithBackoffHelper(async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt
        });
        return response.text || "Could not generate report.";
    });
};
