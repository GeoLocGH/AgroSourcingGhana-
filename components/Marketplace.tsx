
import React, { useState, useEffect, useRef } from 'react';
import Card from './common/Card';
import Button from './common/Button';
import { ShoppingCartIcon, SearchIcon, PlusIcon, MessageSquareIcon, XIcon, UploadIcon, PhoneIcon, MailIcon, HeartIcon, TagIcon, PencilIcon, TrashIcon, GridIcon, ShieldCheckIcon, StarIcon, DoubleCheckIcon, UserCircleIcon } from './common/icons';
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
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  
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
              setSellerStats(null);
          }
      } catch (err) {
          console.error("Error fetching rating", err);
          setSellerStats(null);
      }
  };

  const submitRating = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!detailsItem || !user) return;
      
      setIsSubmittingRating(true);
      try {
          const { error } = await supabase.from('user_reviews').insert({
              reviewer_id: user.uid,
              target_user_id: detailsItem.user_id,
              rating: ratingValue,
              comment: ratingComment,
              created_at: new Date().toISOString()
          });

          if (error) throw error;

          addNotification({ type: 'market', title: 'Review Submitted', message: 'Thank you for rating the seller!', view: 'MARKETPLACE' });
          setShowRatingModal(false);
          setRatingValue(0);
          setRatingComment('');
          fetchSellerRating(detailsItem.user_id); // Refresh stats
      } catch (err: any) {
          console.error("Rating error:", err);
          addNotification({ type: 'market', title: 'Error', message: 'Could not submit review.', view: 'MARKETPLACE' });
      } finally {
          setIsSubmittingRating(false);
      }
  };

  // Chat logic
  useEffect(() => {
    if(isChatVisible) {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatVisible]);

  useEffect(() => {
    let mounted = true;
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
        
        if (mounted && data) {
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
                if (!mounted) return;

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

                        setMessages(prev => {
                            if (prev.some(m => m.id === newRecord.id)) return prev;
                            return [...prev, {
                                id: newRecord.id,
                                sender: newRecord.sender_id === user.uid ? 'user' : 'seller',
                                text: newRecord.message_text,
                                timestamp: new Date(newRecord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                is_read: newRecord.is_read
                            }];
                        });
                    }
                }
                if (payload.eventType === 'UPDATE') {
                    const updated = payload.new;
                    setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, is_read: updated.is_read } : m));
                }
            }
        )
        .subscribe();

    return () => { 
        mounted = false;
        supabase.removeChannel(channel); 
    };
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

  const filteredItems = items.filter(item => {
      const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
  });
  
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          setItemImages([file]); // Single image for now, array for future
          const preview = URL.createObjectURL(file);
          setImagePreviews([preview]);
      }
  };

  const removeImage = (index: number) => {
      setItemImages([]);
      setImagePreviews([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUseMyLocation = (e: React.MouseEvent) => {
      e.preventDefault();
      if (location) {
          setNewItem(prev => ({
              ...prev,
              location_name: `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`,
              location_lat: location.latitude,
              location_lng: location.longitude
          }));
      } else {
          addNotification({ type: 'market', title: 'Location Error', message: 'GPS location not available.', view: 'MARKETPLACE' });
      }
  };

  const resetForm = () => {
      setNewItem({
          title: '',
          category: 'Produce',
          price: 0,
          usage_instructions: '',
          location_name: '',
      });
      setItemImages([]);
      setImagePreviews([]);
  };

  const handleAddItem = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) {
          onRequireLogin();
          return;
      }
      if (!newItem.title || !newItem.price) {
          addNotification({ type: 'market', title: 'Validation', message: 'Please fill in required fields.', view: 'MARKETPLACE' });
          return;
      }

      setIsSubmitting(true);
      try {
          let imageUrl = '';
          if (itemImages.length > 0) {
              const res = await uploadUserFile(user.uid, itemImages[0], 'marketplace', '', `Product: ${newItem.title}`);
              imageUrl = res.file_url;
          }

          const productPayload = {
              user_id: user.uid,
              seller_name: user.name,
              seller_phone: user.phone || '',
              seller_email: user.email,
              title: newItem.title,
              category: newItem.category,
              price: newItem.price,
              usage_instructions: newItem.usage_instructions,
              location_name: newItem.location_name || 'Ghana',
              location_lat: newItem.location_lat,
              location_lng: newItem.location_lng,
              image_url: imageUrl,
              image_urls: [imageUrl],
              created_at: new Date().toISOString()
          };

          const { error } = await supabase.from('marketplace').insert([productPayload]);
          if (error) throw error;

          addNotification({ type: 'market', title: 'Success', message: 'Item listed for sale!', view: 'MARKETPLACE' });
          setShowAddModal(false);
          resetForm();
      } catch (err: any) {
          console.error(err);
          addNotification({ type: 'market', title: 'Error', message: err.message || 'Failed to list item.', view: 'MARKETPLACE' });
      } finally {
          setIsSubmitting(false);
      }
  };

  const goToMyStore = () => { setActiveView('PROFILE'); };

  return (
    <div className="space-y-6">
       {/* Header and Search */}
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

       {/* Items Grid */}
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {loading ? <p className="col-span-full text-center py-10">Loading marketplace...</p> : 
            filteredItems.map(item => (
                <Card key={item.id} className="flex flex-col h-full hover:shadow-lg transition-shadow overflow-hidden group">
                    <div className="relative h-48 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 mb-4 bg-gray-100 overflow-hidden cursor-pointer" onClick={() => setDetailsItem(item)}>
                        <img 
                            src={item.image_urls?.[0] || 'https://placehold.co/600x400?text=No+Image'} 
                            alt={item.title} 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                        />
                        <span className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                            {item.category}
                        </span>
                    </div>
                    
                    {/* Item Details in Card */}
                    <div className="mb-4">
                        <div className="flex justify-between items-start">
                            <h3 className="text-lg font-bold text-gray-900 leading-tight truncate w-full mb-1">{item.title}</h3>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-green-700 font-bold">GHS {item.price.toFixed(2)}</span>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                                <UserCircleIcon className="w-3 h-3"/> {item.seller_name}
                            </div>
                        </div>
                    </div>

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

        {/* Sell Item Modal */}
        {showAddModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
                <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-gray-800">List New Item</h3>
                        <button onClick={() => setShowAddModal(false)} className="text-gray-500 hover:text-gray-800"><XIcon className="w-6 h-6" /></button>
                    </div>
                    
                    <form onSubmit={handleAddItem} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Product Title</label>
                            <input 
                                required
                                value={newItem.title} 
                                onChange={e => setNewItem({...newItem, title: e.target.value})} 
                                className="w-full p-2 border border-gray-300 rounded text-gray-900 bg-white"
                                placeholder="e.g. Fresh Tomatoes"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                <select 
                                    value={newItem.category} 
                                    onChange={e => setNewItem({...newItem, category: e.target.value as any})} 
                                    className="w-full p-2 border border-gray-300 rounded text-gray-900 bg-white"
                                >
                                    {categories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Price (GHS)</label>
                                <input 
                                    type="number" 
                                    required
                                    value={newItem.price} 
                                    onChange={e => setNewItem({...newItem, price: parseFloat(e.target.value)})} 
                                    className="w-full p-2 border border-gray-300 rounded text-gray-900 bg-white"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                            <div className="flex gap-2">
                                <input 
                                    value={newItem.location_name} 
                                    onChange={e => setNewItem({...newItem, location_name: e.target.value})} 
                                    className="flex-grow p-2 border border-gray-300 rounded text-gray-900 bg-white"
                                    placeholder="Town or Region"
                                />
                                <button type="button" onClick={handleUseMyLocation} className="px-3 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 text-gray-600" title="Use GPS">
                                    <GridIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea 
                                value={newItem.usage_instructions} 
                                onChange={e => setNewItem({...newItem, usage_instructions: e.target.value})} 
                                className="w-full p-2 border border-gray-300 rounded text-gray-900 bg-white"
                                rows={3}
                                placeholder="Quantity, quality, delivery options..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Photo</label>
                            <div className="flex items-center gap-4">
                                <button 
                                    type="button" 
                                    onClick={() => fileInputRef.current?.click()} 
                                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded bg-white hover:bg-gray-50 text-gray-700 text-sm"
                                >
                                    <UploadIcon className="w-4 h-4" /> Upload
                                </button>
                                <input type="file" ref={fileInputRef} onChange={handleImageChange} className="hidden" accept="image/*" />
                                
                                {imagePreviews.length > 0 && (
                                    <div className="relative">
                                        <img src={imagePreviews[0]} alt="Preview" className="h-12 w-12 object-cover rounded border" />
                                        <button 
                                            type="button" 
                                            onClick={() => removeImage(0)}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-sm"
                                        >
                                            <XIcon className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <Button type="submit" isLoading={isSubmitting} className="w-full bg-purple-600 hover:bg-purple-700">
                            List Item
                        </Button>
                    </form>
                </Card>
            </div>
        )}

       {/* Details Modal */}
       {detailsItem && (
           <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setDetailsItem(null)}>
               <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => { e.stopPropagation(); /* Prevent close on card click */ }}>
                   <div className="flex justify-between items-start mb-4">
                       <h3 className="text-xl font-bold text-gray-800">{detailsItem.title}</h3>
                       <button onClick={() => setDetailsItem(null)} className="text-gray-500 hover:text-gray-800 bg-gray-100 rounded-full p-1"><XIcon className="w-6 h-6" /></button>
                   </div>
                   
                   <div className="relative h-64 bg-gray-100 rounded-lg overflow-hidden mb-4 border border-gray-200 group">
                       {detailsItem.image_urls && detailsItem.image_urls.length > 0 ? (
                           detailsItem.image_urls.map((url, idx) => (
                               <img 
                                   key={idx}
                                   src={url} 
                                   alt={`${detailsItem.title} - view ${idx + 1}`}
                                   className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${idx === currentImageIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                               />
                           ))
                       ) : (
                           <img 
                               src='https://placehold.co/600x400?text=No+Image' 
                               alt={detailsItem.title}
                               className="w-full h-full object-cover"
                           />
                       )}
                       
                       <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded z-20">
                           {detailsItem.location_name || 'Location Unknown'}
                       </div>
                   </div>

                   <div className="space-y-4 text-gray-800">
                       <div className="flex justify-between items-center border-b pb-3">
                           <span className="text-2xl font-bold text-green-700">GHS {detailsItem.price.toFixed(2)}</span>
                           <div className="flex flex-col items-end">
                               <span className="text-xs text-gray-500">Category</span>
                               <span className="font-medium bg-gray-100 px-2 py-0.5 rounded">{detailsItem.category}</span>
                           </div>
                       </div>

                       <div>
                           <h4 className="font-bold text-sm text-gray-700 mb-1">Description</h4>
                           <div className="bg-gray-50 p-3 rounded border border-gray-100 text-sm text-gray-600 space-y-2">
                               <p className="leading-relaxed whitespace-pre-wrap">
                                   <span className="font-bold text-gray-800 block mb-1">Usage: </span>
                                   {detailsItem.usage_instructions || 'No specific usage instructions provided.'}
                               </p>
                               {detailsItem.storage_recommendations && (
                                   <p className="leading-relaxed whitespace-pre-wrap border-t border-gray-200 pt-2 mt-2">
                                       <span className="font-bold text-gray-800 block mb-1">Storage: </span>
                                       {detailsItem.storage_recommendations}
                                   </p>
                               )}
                           </div>
                       </div>

                       <div className="flex items-center justify-between text-sm text-gray-500 bg-gray-50 p-2 rounded">
                           <span className="flex items-center gap-1"><UserCircleIcon className="w-4 h-4"/> Seller: {detailsItem.seller_name}</span>
                           {sellerStats ? (
                               <span className="flex items-center gap-1 text-yellow-600 font-bold">
                                   <StarIcon className="w-4 h-4 text-yellow-500" /> {sellerStats.avg.toFixed(1)} ({sellerStats.count})
                               </span>
                           ) : (
                               <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded border">New Seller</span>
                           )}
                       </div>

                       {user?.uid !== detailsItem.user_id ? (
                           <div className="space-y-2">
                               <Button onClick={() => { 
                                   const itemToChat = detailsItem;
                                   setDetailsItem(null); 
                                   handleOpenChat(itemToChat); 
                               }} className="w-full bg-green-700 hover:bg-green-800 py-3 text-base shadow-lg">
                                   <MessageSquareIcon className="w-5 h-5 mr-2" /> Chat with Seller to Buy
                               </Button>
                               <button 
                                   onClick={() => {
                                       if(!user) { onRequireLogin(); return; }
                                       setRatingValue(0);
                                       setRatingComment('');
                                       setShowRatingModal(true);
                                   }}
                                   className="w-full py-2 text-sm text-yellow-600 hover:bg-yellow-50 rounded border border-yellow-200 font-medium transition-colors"
                               >
                                   Rate Seller
                               </button>
                           </div>
                       ) : (
                           <div className="p-3 bg-gray-100 text-center rounded-lg text-gray-500 text-sm font-medium border border-gray-200">
                               <UserCircleIcon className="w-4 h-4 inline mr-1" /> This is your listing
                           </div>
                       )}
                   </div>
               </Card>
           </div>
       )}

       {/* Rating Modal */}
       {showRatingModal && detailsItem && (
           <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 animate-fade-in">
               <Card className="w-full max-w-sm">
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="text-lg font-bold text-gray-800">Rate {detailsItem.seller_name}</h3>
                       <button onClick={() => setShowRatingModal(false)} className="text-gray-500 hover:text-gray-800"><XIcon className="w-6 h-6" /></button>
                   </div>
                   <form onSubmit={submitRating} className="space-y-4">
                       <div className="flex justify-center gap-2 mb-4">
                           {[1, 2, 3, 4, 5].map((star) => (
                               <button
                                   key={star}
                                   type="button"
                                   onClick={() => setRatingValue(star)}
                                   className="focus:outline-none transform hover:scale-110 transition-transform"
                               >
                                   <StarIcon className={`w-8 h-8 ${star <= ratingValue ? 'text-yellow-500' : 'text-gray-300'}`} />
                               </button>
                           ))}
                       </div>
                       <textarea 
                           value={ratingComment}
                           onChange={(e) => setRatingComment(e.target.value)}
                           className="w-full p-3 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-yellow-500 outline-none"
                           placeholder="Describe your experience (optional)..."
                           rows={3}
                       />
                       <Button type="submit" isLoading={isSubmittingRating} disabled={ratingValue === 0} className="w-full bg-yellow-600 hover:bg-yellow-700">
                           Submit Review
                       </Button>
                   </form>
               </Card>
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
