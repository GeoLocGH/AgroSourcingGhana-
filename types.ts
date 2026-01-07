
export type View = 'DASHBOARD' | 'WEATHER' | 'PRICES' | 'DIAGNOSIS' | 'MARKETPLACE' | 'ADVISORY' | 'FORUM' | 'RENTAL' | 'WALLET' | 'ADMIN' | 'ORDERS' | 'PROFILE';

export type NotificationType = 'weather' | 'price' | 'market' | 'pest' | 'auth' | 'rental' | 'wallet';

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  view?: View;
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
}

export interface WeatherForecast {
  day: string;
  condition: 'Sunny' | 'Cloudy' | 'Rainy' | 'Stormy';
  temp: number;
  wind: number;
  humidity: string;
  visibility: string;
  pressure: string;
  region?: string;
  agromet_note?: string;
}

export enum Crop {
  Maize = 'Maize',
  Cassava = 'Cassava',
  Yam = 'Yam',
  Cocoa = 'Cocoa',
  Rice = 'Rice',
  Tomato = 'Tomato',
  Pepper = 'Pepper',
  Okro = 'Okro',
  Eggplant = 'Eggplant (Garden Eggs)',
  Plantain = 'Plantain',
  Banana = 'Banana',
  KpakpoShito = 'Kpakpo Shito (Pepper)',
  Onion = 'Onion',
  Orange = 'Orange',
  Ginger = 'Ginger',
  Sorghum = 'Sorghum',
  Soyabean = 'Soyabean',
  Millet = 'Millet'
}

export interface PriceData {
  market: string;
  price: number;
  unit?: string;
  date?: string;
  trend?: 'up' | 'down' | 'stable';
}

export interface MarketplaceItem {
  id: string;
  name: string;
  category: 'Seeds' | 'Fertilizers' | 'Tools' | 'Produce';
  seller: string;
  price: number;
  image_urls?: string[];
  usage_instructions?: string;
  storage_recommendations?: string;
  seller_email?: string;
  seller_phone?: string;
  seller_id?: string;
  createdAt?: string;
  likes?: number;
  userHasLiked?: boolean;
  location_lat?: number;
  location_lng?: number;
  location_name?: string;
}

export interface AdvisoryStage {
    stage: string;
    timeline: string;
    instructions: string[];
}

export interface ForumReply {
    id: number;
    author: string;
    created_at: string;
    content: string;
    image_url?: string;
    images?: string[];
}

export interface ForumPost {
    id: number;
    author: string;
    created_at: string;
    title: string;
    content: string;
    replies: ForumReply[];
    image_url?: string;
    images?: string[];
}

export interface User {
  uid?: string;
  name: string;
  email: string;
  phone?: string;
  type: 'buyer' | 'seller' | 'farmer' | 'admin';
  merchant_id?: string;
  photo_url?: string;
}

export enum EquipmentType {
  Tractor = 'Tractor',
  Plow = 'Plow',
  Harvester = 'Harvester',
  Sprayer = 'Sprayer',
  Other = 'Other'
}

export interface EquipmentItem {
  id: string;
  name: string;
  type: EquipmentType;
  owner: string;
  location: string;
  price_per_day: number;
  image_url: string;
  available: boolean;
  description: string;
  owner_id?: string;
  created_at?: string;
}

export interface Order {
  id: string;
  date: string;
  items: string[];
  total: number;
  status: 'Processing' | 'Shipped' | 'Delivered';
}

export interface UserFile {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  storage_path: string;
  file_type: string;
  context: 'profile' | 'pest-diagnosis' | 'marketplace' | 'rental' | 'forum' | 'admin-logo';
  ai_summary: string | null;
  notes: string | null;
  created_at: string;
}

export interface GroundingSource {
    title: string;
    uri: string;
}

export interface ServiceResponse<T> {
    data: T;
    sources: GroundingSource[];
}

export interface Message {
  id: number;
  sender: 'user' | 'seller';
  text: string;
  timestamp: string;
}

export interface SellerOrder {
  id: string;
  buyerName: string;
  itemName: string;
  quantity: number;
  total: number;
  date: string;
  status: 'Pending' | 'Shipped' | 'Delivered';
}

export interface Inquiry {
  id?: string;
  user_id: string | null;
  item_id: string;
  item_type: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  status: string;
  created_at?: string;
}

/**
 * Payment & Transaction Types
 */
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded' | 'flagged';

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  provider: 'MTN' | 'Telecel' | 'AirtelTigo' | string;
  provider_reference: string;
  status: PaymentStatus;
  phone_number: string;
  created_at: string;
  // Optional fields for UI backward compatibility
  type?: 'DEPOSIT' | 'WITHDRAWAL' | 'PAYMENT' | 'TRANSFER';
  description?: string;
}

export interface PaymentExtractionResult {
  status: PaymentStatus;
  amount: number;
  provider_reference: string;
  phone_number: string;
  raw_message?: string;
}

export interface ReconciliationResult {
    transaction_id: string;
    amount: number;
    date: string;
    sender: string;
    sql_query: string;
}
