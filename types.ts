
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

// Deprecated for new calls, kept for legacy if needed, but we are switching to WeatherReport
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

export interface HourlyForecast {
  time: string;
  temp: number;
  condition: 'Sunny' | 'Cloudy' | 'Rainy' | 'Stormy';
}

export interface DailyForecast {
  day: string;
  condition: 'Sunny' | 'Cloudy' | 'Rainy' | 'Stormy';
  high: number;
  low: number;
  rainChance: string;
}

export interface WeatherReport {
  current: {
    temp: number;
    condition: 'Sunny' | 'Cloudy' | 'Rainy' | 'Stormy';
    humidity: string;
    wind: number;
    region: string;
  };
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  advisory: string;
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
  // Crops
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
  
  // Livestock
  Cow = 'Cow',
  Goat = 'Goat',
  Sheep = 'Sheep',
  Chicken = 'Chicken',
  GuineaFowl = 'Guinea Fowl',
  Turkey = 'Turkey',
  Pig = 'Pig',
  Snail = 'Snail',
  Rabbit = 'Rabbit',
  Fish = 'Tilapia/Catfish',
  Eggs = 'Eggs'
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
  category: 'Seeds' | 'Fertilizers' | 'Tools' | 'Produce' | 'Livestock Feed' | 'Livestock' | 'All';
  seller_name: string;
  user_id: string; // Updated from owner_id to user_id
  seller_email?: string;
  seller_phone?: string;
  price: number;
  usage_instructions?: string;
  storage_recommendations?: string;
  location_lat?: number;
  location_lng?: number;
  location_name?: string;
  image_urls?: string[];
  created_at?: string; // Reverted to created_at based on latest DB error hint
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
  user_id?: string; // Added user_id
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
  user_id: string; // Explicitly using user_id
  location: string;
  location_lat?: number;
  location_lng?: number;
  price_per_day: number;
  image_url?: string;
  image_urls?: string[]; // Added support for multiple images
  available: boolean;
  description?: string;
  created_at?: string; 
}

export interface Inquiry {
  id?: number;
  user_id?: string | null;
  recipient_id?: string | null; // Added for Inbox logic
  item_id: string;
  item_type: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  subject?: string; // Added subject
  status: string;
  created_at?: string;
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
  created_at: string; // Standardized to snake_case
}

export interface AdBanner {
  id: string | number;
  title: string;
  text: string;
  color: string; // e.g. "bg-green-50 border-green-100"
  imageUrl?: string;
  link?: string;
  isActive?: boolean;
}

export interface Review {
    id: number;
    reviewer_id: string;
    target_user_id: string;
    rating: number;
    comment: string;
    created_at: string;
}
