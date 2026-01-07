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

function extractSources(response: any) {
    return response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || 'Source',
        uri: chunk.web?.uri || ''
    })).filter((s: any) => s.uri) || [];
}

export const checkWeatherAlerts = async (location: GeoLocation): Promise<string> => {
    const prompt = `Check for active severe weather alerts for location: ${location.latitude}, ${location.longitude}. 
    If none, say "No active severe weather alerts."`;
    
    return retryWithBackoff(async () => {
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

export const getLocalWeather = async (location: GeoLocation): Promise<ServiceResponse<WeatherForecast[]>> => {
    const prompt = `Get the 3-day weather forecast for coordinates ${location.latitude}, ${location.longitude}. Return JSON.`;
    
    return retryWithBackoff(async () => {
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

export const getMarketPrices = async (crop: string): Promise<ServiceResponse<PriceData[]>> => {
    const prompt = `Get current market prices for ${crop} in major markets in Ghana. Return JSON.`;

    return retryWithBackoff(async () => {
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
    return retryWithBackoff(async () => {
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

export const getAdvisory = async (crop: string, plantingDate: string, location: GeoLocation): Promise<ServiceResponse<AdvisoryStage[]>> => {
    const prompt = `Create a crop advisory for ${crop} planted on ${plantingDate} at location ${location.latitude}, ${location.longitude}. Return JSON.`;

    return retryWithBackoff(async () => {
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

    return retryWithBackoff(async () => {
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

    return retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt
        });
        return response.text || "Could not generate report.";
    });
};
