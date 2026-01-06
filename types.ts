

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
  temp: number; // in Celsius
  wind: number; // in km/h
  humidity: string;
  visibility: string;
  pressure: string;
  region?: string;
  agromet_note?: string; // Brief agricultural advisory
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

export enum Market {
  Accra = 'Agbogbloshie, Accra',
  Kumasi = 'Central Market, Kumasi',
  Tamale = 'Central Market, Tamale',
  Takoradi = 'Market Circle, Takoradi',
  Techiman = 'Techiman Market',
  Hohoe = 'Hohoe Market',
  Ho = 'Ho Central Market',
  Kpando = 'Kpando Market',
  Keta = 'Keta Market',
  Sambu = 'Sambu Market',
  Kokomba = 'Kokomba Market',
}

export interface PriceData {
  market: string;
  price: number; // in GHS
  unit?: string; // e.g. "100kg bag"
  date?: string; // Date of the data
  trend?: 'up' | 'down' | 'stable';
}

export interface MarketplaceItem {
  id: string;
  name: string;
  category: 'Seeds' | 'Fertilizers' | 'Tools' | 'Produce';
  seller: string;
  price: number; // in GHS
  image_urls?: string[]; // snake_case
  usage_instructions?: string; // snake_case
  storage_recommendations?: string; // snake_case
  seller_email?: string; // snake_case
  seller_phone?: string; // snake_case
  seller_id?: string; // snake_case
  created_at?: string; // snake_case
  reviews?: Review[];
  likes?: number; // Total likes
  userHasLiked?: boolean; // If current user liked it (Derived on frontend)
}

export interface Review {
  id: number;
  author: string;
  rating: number;
  comment: string;
  date: string;
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

export interface AdvisoryStage {
    stage: string;
    timeline: string;
    instructions: string[];
}

export interface ForumReply {
    id: number;
    author: string;
    created_at: string; // snake_case
    content: string;
    image_url?: string; // snake_case
    images?: string[]; // Support multiple images
}

export interface ForumPost {
    id: number;
    author: string;
    created_at: string; // snake_case
    title: string;
    content: string;
    replies: ForumReply[];
    image_url?: string; // snake_case
    images?: string[]; // Support multiple images
}

export type MessageSender = 'user' | 'seller';

export interface Message {
  id: number;
  sender: MessageSender;
  text: string;
  timestamp: string;
}

export interface User {
  uid?: string;
  name: string;
  email: string;
  phone?: string;
  type: 'buyer' | 'seller' | 'farmer' | 'admin';
  merchant_id?: string; // snake_case
  photo_url?: string; // snake_case
  photo_storage_path?: string; // snake_case
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
  price_per_day: number; // snake_case
  image_url: string; // snake_case
  available: boolean;
  description: string;
  owner_email?: string; // snake_case
  owner_phone?: string; // snake_case
  owner_id?: string; // snake_case
  created_at?: string; // snake_case
}

export interface Order {
  id: string;
  date: string;
  items: string[];
  total: number;
  status: 'Processing' | 'Shipped' | 'Delivered';
}

export interface OrderStatus {
    status: 'Processing' | 'Shipped' | 'Delivered';
    color: string;
}

export interface UserFile {
  id: string;
  user_id: string; // snake_case
  download_url: string; // snake_case
  storage_path: string; // snake_case
  file_name: string; // snake_case
  file_type: string; // snake_case
  context: 'profile' | 'pest-diagnosis' | 'marketplace' | 'rental' | 'forum' | 'admin-logo';
  ai_summary?: string; // snake_case
  notes?: string;
  created_at: string; // snake_case
}

export interface Inquiry {
    id?: number;
    user_id?: string;
    item_id?: string;
    item_type?: 'marketplace' | 'equipment';
    name: string;
    email: string;
    phone: string;
    message: string;
    status?: 'pending' | 'reviewed' | 'resolved';
    created_at?: string;
}

export interface GroundingSource {
    title: string;
    uri: string;
}

export interface ServiceResponse<T> {
    data: T;
    sources: GroundingSource[];
}
