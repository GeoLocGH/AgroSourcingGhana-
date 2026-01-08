
export type View = 
  | 'DASHBOARD' 
  | 'WEATHER' 
  | 'PRICES' 
  | 'DIAGNOSIS' 
  | 'MARKETPLACE' 
  | 'ADVISORY' 
  | 'FORUM' 
  | 'RENTAL' 
  | 'WALLET' 
  | 'ORDERS' 
  | 'ADMIN' 
  | 'PROFILE';

export type UserType = 'admin' | 'buyer' | 'seller' | 'farmer' | 'agent';

export interface User {
  uid?: string;
  id?: string;
  name: string;
  email: string;
  phone?: string;
  photo_url?: string;
  type: UserType;
  merchant_id?: string;
  messaging_enabled?: boolean;
  network?: string; // Updated from momo_network
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
  address?: string; // Added optional address
}

export interface WeatherForecast {
  day: string;
  condition: 'Sunny' | 'Cloudy' | 'Rainy' | 'Stormy';
  temp: number;
  wind: number;
  humidity: string;
  visibility: string;
  pressure: string;
  region: string;
  agromet_note: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ServiceResponse<T> {
  data: T;
  sources: GroundingSource[];
}

export interface PriceData {
  market: string;
  price: number;
  unit: string;
  date: string;
  trend: 'up' | 'down' | 'stable';
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
  Eggplant = 'Eggplant',
  Plantain = 'Plantain',
  Banana = 'Banana',
  KpakpoShito = 'Kpakpo Shito',
  Onion = 'Onion',
  Orange = 'Orange',
  Ginger = 'Ginger',
  Sorghum = 'Sorghum',
  Soyabean = 'Soyabean',
  Millet = 'Millet',
}

export interface AdvisoryStage {
  stage: string;
  timeline: string;
  instructions: string[];
}

export interface PaymentExtractionResult {
  status: 'pending' | 'completed' | 'failed' | 'flagged';
  amount: number;
  provider_reference: string;
  phone_number: string;
}

export interface MarketplaceItem {
  id: string;
  title: string;
  category: 'Seeds' | 'Fertilizers' | 'Tools' | 'Produce' | 'All';
  seller_name: string;
  owner_id: string;
  seller_email?: string;
  seller_phone?: string;
  price: number;
  usage_instructions?: string;
  storage_recommendations?: string;
  location_lat?: number;
  location_lng?: number;
  location_name?: string;
  image_urls?: string[];
  createdAt?: string; // Corrected to match DB schema (camelCase)
  likes?: number;
  userHasLiked?: boolean;
  merchant_id?: string | null;
  messaging_enabled?: boolean;
}

export interface Message {
  id: number;
  sender: 'user' | 'seller';
  text: string;
  timestamp: string;
}

export interface SellerOrder {
  id: string;
  buyer_id: string;
  item_id: string;
  amount: number;
  status: string;
  created_at: string;
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
  image_url?: string | null;
  images?: string[];
  replies: ForumReply[];
}

export type NotificationType = 'weather' | 'price' | 'market' | 'pest' | 'auth' | 'wallet' | 'rental' | 'admin';

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  view?: View;
}

export enum EquipmentType {
  Tractor = 'Tractor',
  Harvester = 'Harvester',
  Plow = 'Plow',
  Seeder = 'Seeder',
  Sprayer = 'Sprayer',
  Other = 'Other'
}

export interface EquipmentItem {
  id: string;
  name: string;
  type: EquipmentType;
  owner: string;
  owner_id?: string;
  location: string;
  location_lat?: number;
  location_lng?: number;
  price_per_day: number;
  image_url?: string;
  available: boolean;
  description?: string;
  created_at?: string; // Corrected to match DB schema (snake_case)
}

export interface Inquiry {
  user_id?: string | null;
  item_id: string;
  item_type: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  status: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'LOAN' | 'PAYMENT' | 'TRANSFER';
  status: 'completed' | 'pending' | 'failed' | 'flagged' | 'refunded';
  provider: string;
  provider_reference: string;
  phone_number: string;
  description?: string;
  created_at: string;
}

export interface Order {
  id: string;
  status: 'Processing' | 'Shipped' | 'Delivered';
  date: string;
  items: string[];
  total: number;
}

export interface UserFile {
  id: string;
  user_id: string;
  file_url: string;
  storage_path: string;
  file_name: string;
  file_type: string;
  context: 'admin-logo' | 'profile' | 'pest-diagnosis' | 'marketplace' | 'rental' | 'forum' | 'misc';
  ai_summary?: string | null;
  notes?: string | null;
  createdAt: string;
}
