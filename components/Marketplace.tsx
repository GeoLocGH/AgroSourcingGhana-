
import React, { useState, useEffect, useRef } from 'react';
import Card from './common/Card';
import Button from './common/Button';
import { ShoppingCartIcon, SearchIcon, PlusIcon, MessageSquareIcon, XIcon, UploadIcon, PhoneIcon, MailIcon, HeartIcon, TagIcon, PencilIcon, TrashIcon, GridIcon, ShieldCheckIcon, StarIcon, DoubleCheckIcon } from './common/icons';
import { supabase } from '../services/supabase';
import { uploadUserFile } from '../services/storageService';
import { fileToDataUri } from '../utils';
import { useNotifications } from '../contexts/NotificationContext';
import { useGeolocation } from '../hooks/useGeolocation';
import type { User, MarketplaceItem, Message, View } from '../types';

interface MarketplaceProps {
  user: User | null;
  setActiveView: (view: View) => void;
  onRequireLogin: () => void;
}

interface ChatContext {
    id: string;
    name: string;
    subject: string;
    participants?: string[];
    receiverId?: string;
}

const Marketplace: React.FC<MarketplaceProps> = ({ user, setActiveView, onRequireLogin }) => {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [detailsItem, setDetailsItem] = useState<MarketplaceItem | null>(null); // For Details View
  const [currentImageIndex, setCurrentImageIndex] = useState(0); // For Slideshow
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Rating State
  const [sellerStats, setSellerStats] = useState<{ avg: number, count: number } | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  
  // Add Item Form State
  const [newItem, setNewItem] = useState<Partial<MarketplaceItem>>({
      title: '',
      category: 'Produce',
      price: 0,
      usage_instructions: '', // Description/Details
      storage_recommendations: '',
      location_name: '',
      location_lat: undefined,
      location_lng: undefined
  });
  
  // Multiple Image State
  const [itemImages, setItemImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat State
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [messages, setMessages] = useState<(Message & { is_read?: boolean })[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Edit/Delete State
  const [isEditMode, setIsEditMode] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MarketplaceItem | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const { addNotification } = useNotifications();
  const { location, error: geoError } = useGeolocation();

  const categories = ['All', 'Seeds', 'Fertilizers', 'Livestock Feed', 'Livestock', 'Tools', 'Produce'];

  useEffect(() => {
    fetchItems();
    
    const subscription = supabase
        .channel('public:marketplace')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace' }, fetchItems)
        .subscribe();

    return () => { subscription.unsubscribe(); };
  }, []);

  // ... (Slideshow effects remain same)

  // Slideshow Logic for Details Modal
  useEffect(() => {
      if (detailsItem) {
          setCurrentImageIndex(0);
          fetchSellerRating(detailsItem.user_id);
      } else {
          setSellerStats(null);
      }
  }, [detailsItem]);

  // Slideshow Auto-Advance
  useEffect(() => {
      if (!detailsItem?.image_urls || detailsItem.image_urls.length <= 1) return;

      const interval = setInterval(() => {
          setCurrentImageIndex(prev => (prev + 1) % detailsItem.image_urls!.length);
      }, 3000); // Change image every 3 seconds

      return () => clearInterval(interval);
  }, [detailsItem]);

  const fetchItems = async () => {
      setLoading(true);
      try {
          const { data, error } = await supabase
              .from('marketplace')
              .select('*')
              .order('created_at', { ascending: false });
          
          if (error) throw error;
          
          // Data normalization: Ensure user_id is present by checking owner_id fallback
          let itemsList = (data || []).map((item: any) => ({
              ...item,
              user_id: item.user_id || item.owner_id
          })) as MarketplaceItem[];

          if (user?.uid) {
               const { data: likes } = await supabase.from('marketplace_likes').select('item_id').eq('user_id', user.uid);
               const likedIds = new Set(likes?.map((l: any) => l.item_id));
               itemsList = itemsList.map(item => ({
                   ...item,
                   userHasLiked: likedIds.has(item.id)
               }));
          }

          setItems(itemsList);
      } catch (err) {
          console.error("Error fetching marketplace items:", err);
      } finally {
          setLoading(false);
      }
  };

  const fetchSellerRating = async (sellerId: string) => {
      if (!sellerId) return;
      try {
          const { data, error } = await supabase
              .from('user_reviews')
              .select('rating')
              .eq('target_user_id', sellerId);
          
          if (error) throw error;

          if (data && data.length > 0) {
              const total = data.reduce((acc, curr) => acc + curr.rating, 0);
              setSellerStats({
                  avg: total / data.length,
                  count: data.length
              });
          } else {
              setSellerStats({ avg: 0, count: 0 });
          }
      } catch (err) {
          console.error("Error fetching rating", err);
          setSellerStats(null);
      }
  };

  const handleSubmitRating = async (e: React.FormEvent) => { /* ... (Unchanged) */ };

  // Chat logic
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatVisible]);

  useEffect(() => {
    if (!chatContext?.id || !isChatVisible || !user?.uid) return;

    const fetchMessages = async () => {
        // Mark as read first
        await supabase.from('chats')
            .update({ is_read: true })
            .eq('item_id', chatContext.id)
            .eq('receiver_id', user.uid);

        // Fetch message where item_id matches AND (sender is me OR receiver is me)
        const { data } = await supabase
            .from('chats')
            .select('*')
            .eq('item_id', chatContext.id)
            .or(`sender_id.eq.${user.uid},receiver_id.eq.${user.uid}`)
            .order('created_at', { ascending: true });
        
        if (data) {
             const mappedMessages = data.map((msg: any) => ({
                id: msg.id,
                sender: msg.sender_id === user.uid ? 'user' : 'seller',
                text: msg.message_text,
                timestamp: msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
                is_read: msg.is_read
            }));
            setMessages(mappedMessages);
        }
    };
    fetchMessages();

    const channel = supabase
        .channel(`chat_market:${chatContext.id}`)
        .on(
            'postgres_changes', 
            { 
                event: '*', 
                schema: 'public', 
                table: 'chats', 
                filter: `item_id=eq.${chatContext.id}` 
            }, 
            (payload) => {
                if (payload.eventType === 'INSERT') {
                    const newRecord = payload.new;
                    const isRelevant = 
                        (newRecord.sender_id === user.uid) || 
                        (newRecord.receiver_id === user.uid);

                    if (isRelevant) {
                        // If receiving message while chat is open, mark read
                        if (newRecord.receiver_id === user.uid) {
                            supabase.from('chats').update({ is_read: true }).eq('id', newRecord.id);
                        }

                        setMessages(prev => [...prev, {
                            id: newRecord.id,
                            sender: newRecord.sender_id === user.uid ? 'user' : 'seller',
                            text: newRecord.message_text,
                            timestamp: new Date(newRecord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            is_read: newRecord.is_read
                        }]);
                    }
                }
                if (payload.eventType === 'UPDATE') {
                    const updated = payload.new;
                    setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, is_read: updated.is_read } : m));
                }
            }
        )
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chatContext, isChatVisible, user?.uid]);

  const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentMessage.trim() || !chatContext) return;
      setIsSending(true);

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
           addNotification({ type: 'market', title: 'Error', message: 'Please log in.', view: 'MARKETPLACE' });
           setIsSending(false);
           return;
      }
      
      const receiverId = chatContext.receiverId || chatContext.participants?.find(p => p !== currentUser.id);
      if (!receiverId) {
          console.error("Receiver ID missing", chatContext);
          addNotification({ type: 'market', title: 'Error', message: 'Cannot verify seller info to send message.', view: 'MARKETPLACE' });
          setIsSending(false);
          return;
      }

      try {
          const { error } = await supabase.from('chats').insert([{
              sender_id: currentUser.id,
              receiver_id: receiverId,
              item_id: String(chatContext.id),
              message_text: currentMessage.trim(),
              is_read: false
          }]);
          
          if (error) throw error;
          setCurrentMessage('');
      } catch (err: any) {
          console.error("Chat Error:", err.message);
          addNotification({ type: 'market', title: 'Error', message: `Failed to send: ${err.message}`, view: 'MARKETPLACE' });
      } finally {
          setIsSending(false);
      }
  };

  // ... (Other handlers unchanged)
  const handleOpenChat = (item: MarketplaceItem) => {
      if (!user?.uid) {
          onRequireLogin();
          return;
      }
      if (item.user_id === user.uid) {
          addNotification({ type: 'market', title: 'Oops', message: 'This is your own item.', view: 'MARKETPLACE' });
          return;
      }
      
      if (!item.user_id) {
          addNotification({ type: 'market', title: 'Unavailable', message: 'Seller information is incomplete. Try refreshing.', view: 'MARKETPLACE' });
          return;
      }

      setChatContext({
          id: item.id,
          name: item.seller_name,
          subject: item.title,
          participants: [user.uid, item.user_id],
          receiverId: item.user_id
      });
      setIsChatVisible(true);
  };

  const handleLike = async (item: MarketplaceItem) => { /*...*/ };
  const filteredItems = items.filter(item => { /*...*/ return true; }); // Simplified for brevity
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => { /*...*/ };
  const removeImage = (index: number) => { /*...*/ };
  const handleUseMyLocation = () => { /*...*/ };
  const resetForm = () => { /*...*/ };
  const handleAddItem = async (e: React.FormEvent) => { /*...*/ };
  const handleUpdateItem = async (e: React.FormEvent) => { /*...*/ };
  const handleDeleteItem = async () => { /*...*/ };
  const openEditModal = (item: MarketplaceItem) => { /*...*/ };
  const isOwner = (item: MarketplaceItem) => user?.uid === item.user_id;
  const goToMyStore = () => { /*...*/ };

  return (
    <div className="space-y-6">
       {/* ... Header and Search ... */}
       <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
           <div className="flex items-center gap-4">
               <div className="p-4 bg-green-100 rounded-full text-green-800 shadow-sm border border-green-200">
                   <ShoppingCartIcon className="w-10 h-10" />
               </div>
               <div>
                   <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Marketplace</h2>
                   <p className="text-lg text-orange-700 font-medium">Buy and sell agricultural products.</p>
               </div>
           </div>
           <div className="flex gap-2">
               {user && (
                   <Button onClick={goToMyStore} className="bg-white !text-purple-700 border border-purple-200 hover:bg-purple-50 shadow-sm">
                       <ShoppingCartIcon className="w-5 h-5 mr-2" /> My Store
                   </Button>
               )}
               <Button onClick={() => { 
                   if(!user) { onRequireLogin(); return; }
                   resetForm(); 
                   setShowAddModal(true); 
               }}>
                   <PlusIcon className="w-5 h-5 mr-2" /> Sell Item
               </Button>
           </div>
       </div>

       {/* Search & Filter */}
       <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4">
           {/* ... Search UI ... */}
           <div className="relative flex-grow">
               <input 
                   value={searchTerm}
                   onChange={e => setSearchTerm(e.target.value)}
                   placeholder="Search items..."
                   className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
               />
               <SearchIcon className="absolute left-3 top-2.5 text-gray-400 w-5 h-5" />
           </div>
           <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
               {categories.map(cat => (
                   <button 
                       key={cat}
                       onClick={() => setSelectedCategory(cat)}
                       className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-colors ${selectedCategory === cat ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                   >
                       {cat}
                   </button>
               ))}
           </div>
       </div>

       {/* Items Grid (Unchanged mostly, just ensure handlers are passed) */}
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {loading ? <p className="col-span-full text-center py-10">Loading marketplace...</p> : 
            filteredItems.map(item => (
                <Card key={item.id} className="flex flex-col h-full hover:shadow-lg transition-shadow overflow-hidden group">
                    {/* ... Card content ... */}
                    <div className="relative h-48 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 mb-4 bg-gray-100 overflow-hidden cursor-pointer" onClick={() => setDetailsItem(item)}>
                        <img 
                            src={item.image_urls?.[0] || 'https://placehold.co/600x400?text=No+Image'} 
                            alt={item.title} 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                        />
                        {/* ... */}
                    </div>
                    {/* ... */}
                    <div className="mt-auto grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                        <Button 
                            onClick={() => setDetailsItem(item)} 
                            className="bg-gray-200 !text-gray-900 hover:bg-gray-300 py-2 text-sm shadow-none"
                        >
                            Details
                        </Button>
                        <Button 
                            onClick={() => handleOpenChat(item)} 
                            className="bg-green-700 hover:bg-green-800 py-2 text-sm flex items-center justify-center gap-1 shadow-md"
                        >
                            <ShoppingCartIcon className="w-4 h-4" /> Buy Now
                        </Button>
                    </div>
                </Card>
            ))
           }
       </div>

       {/* Details Modal (Unchanged) */}
       {detailsItem && (
           <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setDetailsItem(null)}>
               {/* ... Details Modal Content ... */}
               <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => { e.stopPropagation(); /* Prevent close on card click */ }}>
                   {/* ... */}
                   <Button onClick={() => { 
                       const itemToChat = detailsItem;
                       setDetailsItem(null); 
                       handleOpenChat(itemToChat); 
                   }} className="w-full bg-green-700 hover:bg-green-800 py-3 text-base shadow-lg">
                       <MessageSquareIcon className="w-5 h-5 mr-2" /> Chat with Seller to Buy
                   </Button>
               </Card>
           </div>
       )}

       {/* Rating Modal */}
       {showRatingModal && detailsItem && (
           <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 animate-fade-in">
               <Card className="w-full max-w-sm text-center">
                   {/* ... Rating UI ... */}
                   <h3 className="text-lg font-bold text-gray-900 mb-2">Rate {detailsItem.seller_name}</h3>
                   {/* ... */}
                   <div className="flex gap-2">
                       <Button onClick={() => setShowRatingModal(false)} className="flex-1 bg-gray-200 !text-gray-900">Cancel</Button>
                       <Button onClick={handleSubmitRating} isLoading={isSubmitting} disabled={ratingValue === 0} className="flex-1">Submit</Button>
                   </div>
               </Card>
           </div>
       )}

       {/* Add/Edit Modal (Unchanged) */}
       {showAddModal && (
           <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
               {/* ... */}
           </div>
       )}

       {/* Delete Modal (Unchanged) */}
       {showDeleteModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                {/* ... */}
            </div>
       )}

       {/* Chat Modal */}
       {isChatVisible && chatContext && (
           <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
               <div className="bg-white w-full max-w-md h-[500px] flex flex-col rounded-xl shadow-2xl z-50">
                   <div className="p-4 border-b flex justify-between items-center bg-purple-50 rounded-t-xl">
                       <div>
                           <h3 className="font-bold text-gray-800">{chatContext.name}</h3>
                           <p className="text-xs text-purple-700 truncate max-w-[200px]">{chatContext.subject}</p>
                       </div>
                       <button onClick={() => setIsChatVisible(false)} className="text-gray-500 hover:text-gray-800"><XIcon className="w-6 h-6" /></button>
                   </div>
                   <div className="flex-grow p-4 overflow-y-auto space-y-3 bg-gray-50/50">
                       {messages.map((msg, i) => (
                           <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                               <div className={`max-w-[80%] p-3 rounded-lg text-sm ${msg.sender === 'user' ? 'bg-purple-600 text-white rounded-br-none' : 'bg-white border text-gray-800 rounded-bl-none shadow-sm'}`}>
                                   <p>{msg.text}</p>
                                   <div className="flex justify-end items-center gap-1 mt-1">
                                        <p className={`text-[10px] ${msg.sender === 'user' ? 'text-purple-200' : 'text-gray-400'}`}>{msg.timestamp}</p>
                                        {msg.sender === 'user' && (
                                            msg.is_read ? 
                                            <DoubleCheckIcon className="w-3 h-3 text-blue-200" /> : 
                                            <DoubleCheckIcon className="w-3 h-3 text-purple-300 opacity-60" />
                                        )}
                                   </div>
                               </div>
                           </div>
                       ))}
                       <div ref={chatEndRef} />
                   </div>
                   <form onSubmit={handleSendMessage} className="p-3 border-t bg-white rounded-b-xl flex gap-2">
                       <input 
                           value={currentMessage} 
                           onChange={e => setCurrentMessage(e.target.value)}
                           className="flex-grow border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-purple-500 !text-gray-900 !bg-white placeholder-gray-500"
                           placeholder="Type a message..."
                       />
                       <Button type="submit" isLoading={isSending} className="bg-purple-600 hover:bg-purple-700 px-4">Send</Button>
                   </form>
               </div>
           </div>
       )}
    </div>
  );
};

export default Marketplace;
