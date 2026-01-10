
import React, { useState, useEffect, useRef } from 'react';
import Card from './common/Card';
import Button from './common/Button';
import { ShoppingCartIcon, SearchIcon, PlusIcon, MessageSquareIcon, XIcon, UploadIcon, PhoneIcon, MailIcon, HeartIcon, TagIcon, PencilIcon, TrashIcon, GridIcon, ShieldCheckIcon, StarIcon } from './common/icons';
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
  const [messages, setMessages] = useState<Message[]>([]);
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

  // Reset slideshow and fetch rating when details modal opens
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

  const handleSubmitRating = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user?.uid || !detailsItem) return;
      
      setIsSubmitting(true);
      try {
          const { error } = await supabase.from('user_reviews').insert([{
              reviewer_id: user.uid,
              target_user_id: detailsItem.user_id,
              item_id: detailsItem.id,
              context: 'marketplace',
              rating: ratingValue,
              comment: ratingComment
          }]);

          if (error) throw error;

          addNotification({ type: 'market', title: 'Review Submitted', message: 'Thank you for your feedback!', view: 'MARKETPLACE' });
          setShowRatingModal(false);
          setRatingValue(0);
          setRatingComment('');
          fetchSellerRating(detailsItem.user_id); // Refresh stats
      } catch (err: any) {
          console.error("Review Error:", err);
          addNotification({ type: 'market', title: 'Error', message: 'Could not submit review.', view: 'MARKETPLACE' });
      } finally {
          setIsSubmitting(false);
      }
  };

  // Chat logic
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatVisible]);

  useEffect(() => {
    if (!chatContext?.id || !isChatVisible || !user?.uid) return;

    const fetchMessages = async () => {
        // Fetch message where item_id matches AND (sender is me OR receiver is me)
        const { data } = await supabase
            .from('chats')
            .select('*')
            .eq('item_id', chatContext.id)
            .or(`sender_id.eq.${user.uid},receiver_id.eq.${user.uid}`)
            .order('created_at', { ascending: true });
        
        if (data) {
             const mappedMessages: Message[] = data.map((msg: any, index: number) => ({
                id: msg.id || index,
                sender: msg.sender_id === user.uid ? 'user' : 'seller',
                text: msg.message_text,
                timestamp: msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
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
                event: 'INSERT', 
                schema: 'public', 
                table: 'chats', 
                filter: `item_id=eq.${chatContext.id}` 
            }, 
            (payload) => {
                const newRecord = payload.new;
                
                const isRelevant = 
                    (newRecord.sender_id === user.uid) || 
                    (newRecord.receiver_id === user.uid);

                if (isRelevant) {
                    setMessages(prev => [...prev, {
                        id: newRecord.id,
                        sender: newRecord.sender_id === user.uid ? 'user' : 'seller',
                        text: newRecord.message_text,
                        timestamp: new Date(newRecord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }]);
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
              message_text: currentMessage.trim()
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

  const handleLike = async (item: MarketplaceItem) => {
      if (!user?.uid) {
          onRequireLogin();
          return;
      }

      const isLiked = item.userHasLiked;
      
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, userHasLiked: !isLiked, likes: (i.likes || 0) + (isLiked ? -1 : 1) } : i));

      try {
          if (isLiked) {
              await supabase.from('marketplace_likes').delete().eq('user_id', user.uid).eq('item_id', item.id);
          } else {
              await supabase.from('marketplace_likes').insert([{ user_id: user.uid, item_id: item.id }]);
          }
      } catch (err) {
          console.error(err);
          setItems(prev => prev.map(i => i.id === item.id ? { ...i, userHasLiked: isLiked, likes: (i.likes || 0) + (isLiked ? 1 : -1) } : i));
      }
  };

  const filteredItems = items.filter(item => {
      const searchLower = searchTerm.toLowerCase();
      const locationMatch = (item.location_name || '').toLowerCase().includes(searchLower);
      const titleMatch = item.title.toLowerCase().includes(searchLower);
      const matchesSearch = titleMatch || locationMatch;
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
  });

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          const filesArray: File[] = Array.from(e.target.files);
          const validFiles = filesArray.filter(f => f.size <= 4 * 1024 * 1024);
          
          if (validFiles.length !== filesArray.length) {
             alert("Some files were skipped because they exceed 4MB.");
          }
          
          const newPreviews = await Promise.all(validFiles.map(fileToDataUri));
          
          setItemImages(prev => [...prev, ...validFiles]);
          setImagePreviews(prev => [...prev, ...newPreviews]);
      }
  };

  const removeImage = (index: number) => {
      setItemImages(prev => prev.filter((_, i) => i !== index));
      setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleUseMyLocation = () => {
      if (location) {
          setNewItem(prev => ({
              ...prev,
              location_lat: location.latitude,
              location_lng: location.longitude,
              location_name: prev.location_name || 'Current Location'
          }));
      } else {
          const msg = geoError || "Location not available. Please enable GPS.";
          alert(msg);
      }
  };

  const resetForm = () => {
      setNewItem({ title: '', category: 'Produce', price: 0, usage_instructions: '', storage_recommendations: '', location_name: '' });
      setItemImages([]);
      setImagePreviews([]);
      setIsEditMode(false);
  };

  const handleAddItem = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user?.uid) return;
      
      setIsSubmitting(true);
      try {
          let imageUrls: string[] = [];
          if (itemImages.length > 0) {
               const uploadPromises = itemImages.map((file, index) => 
                   uploadUserFile(user.uid!, file, 'marketplace', '', `Product: ${newItem.title} ${index + 1}`)
               );
               const results = await Promise.all(uploadPromises);
               imageUrls = results.map(res => res.file_url);
          }

          const productData = {
              title: newItem.title,
              category: newItem.category,
              price: Number(newItem.price),
              usage_instructions: newItem.usage_instructions,
              storage_recommendations: newItem.storage_recommendations,
              location_name: newItem.location_name,
              location_lat: newItem.location_lat,
              location_lng: newItem.location_lng,
              image_urls: imageUrls,
              user_id: user.uid,
              seller_name: user.name,
              seller_email: user.email,
              seller_phone: user.phone,
              created_at: new Date().toISOString()
          };

          const { error } = await supabase.from('marketplace').insert([productData]);
          if (error) throw error;

          setShowAddModal(false);
          resetForm();
          addNotification({ type: 'market', title: 'Success', message: 'Item listed successfully.', view: 'MARKETPLACE' });
      } catch (err: any) {
          console.error(err);
          addNotification({ type: 'market', title: 'Error', message: 'Failed to list item.', view: 'MARKETPLACE' });
      } finally {
          setIsSubmitting(false);
      }
  };
  
  const handleUpdateItem = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user?.uid || !newItem.id) return;

      setIsSubmitting(true);
      try {
          // Default to existing images if no new ones are uploaded
          let imageUrls = newItem.image_urls || []; 

          // If user added new images, upload them
          if (itemImages.length > 0) {
               // NOTE: In a real app you might want to decide if you Append or Replace.
               // Here we replace if new files are selected to simplify logic, or append?
               // Let's adopt a Replace strategy if files are present in the upload queue for this MVP editor
               // OR: We merge them. Let's merge for better UX if possible, but complexity is higher.
               // Simpler: If new files uploaded, we add them to the list.
               
               const uploadPromises = itemImages.map((file, index) => 
                   uploadUserFile(user.uid!, file, 'marketplace', '', `Product Update: ${newItem.title} ${index + 1}`)
               );
               const results = await Promise.all(uploadPromises);
               const newUrls = results.map(res => res.file_url);
               imageUrls = [...imageUrls, ...newUrls]; 
          }
          // Note: Removing images isn't fully supported in this edit flow yet, only adding.

          const updates = {
              title: newItem.title,
              category: newItem.category,
              price: Number(newItem.price),
              usage_instructions: newItem.usage_instructions,
              storage_recommendations: newItem.storage_recommendations,
              location_name: newItem.location_name,
              location_lat: newItem.location_lat,
              location_lng: newItem.location_lng,
              image_urls: imageUrls
          };

          const { error } = await supabase.from('marketplace').update(updates).eq('id', newItem.id);
          if (error) throw error;

          setShowAddModal(false);
          resetForm();
          addNotification({ type: 'market', title: 'Success', message: 'Item updated.', view: 'MARKETPLACE' });
      } catch (err: any) {
          console.error(err);
          addNotification({ type: 'market', title: 'Error', message: 'Update failed.', view: 'MARKETPLACE' });
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleDeleteItem = async () => {
      if (!itemToDelete) return;
      try {
          await supabase.from('marketplace').delete().eq('id', itemToDelete.id);
          setShowDeleteModal(false);
          setItemToDelete(null);
          addNotification({ type: 'market', title: 'Deleted', message: 'Item removed.', view: 'MARKETPLACE' });
      } catch (err) {
          addNotification({ type: 'market', title: 'Error', message: 'Delete failed.', view: 'MARKETPLACE' });
      }
  };

  const openEditModal = (item: MarketplaceItem) => {
      setNewItem(item);
      // Pre-populate previews with existing URLs so user sees them
      setImagePreviews(item.image_urls || []);
      // We don't populate 'itemImages' (Files) because we can't create File objects from URLs
      setIsEditMode(true);
      setShowAddModal(true);
  };

  const isOwner = (item: MarketplaceItem) => user?.uid === item.user_id;

  const goToMyStore = () => {
      if(!user) {
          onRequireLogin();
          return;
      }
      sessionStorage.setItem('profile_tab', 'LISTINGS');
      setActiveView('PROFILE');
  }

  return (
    <div className="space-y-6">
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
            filteredItems.length === 0 ? <p className="col-span-full text-center py-10 text-gray-500">No items found.</p> :
            filteredItems.map(item => (
                <Card key={item.id} className="flex flex-col h-full hover:shadow-lg transition-shadow overflow-hidden group">
                    <div className="relative h-48 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 mb-4 bg-gray-100 overflow-hidden cursor-pointer" onClick={() => setDetailsItem(item)}>
                        <img 
                            src={item.image_urls?.[0] || 'https://placehold.co/600x400?text=No+Image'} 
                            alt={item.title} 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                        />
                        <div className="absolute top-2 right-2 flex gap-1">
                             {isOwner(item) ? (
                                 <>
                                     <button onClick={(e) => { e.stopPropagation(); openEditModal(item); }} className="p-1.5 bg-white/90 rounded-full text-gray-700 hover:text-blue-600 shadow-sm"><PencilIcon className="w-4 h-4" /></button>
                                     <button onClick={(e) => { e.stopPropagation(); setItemToDelete(item); setShowDeleteModal(true); }} className="p-1.5 bg-white/90 rounded-full text-gray-700 hover:text-red-600 shadow-sm"><TrashIcon className="w-4 h-4" /></button>
                                 </>
                             ) : (
                                 <button onClick={(e) => { e.stopPropagation(); handleLike(item); }} className="p-1.5 bg-white/90 rounded-full text-gray-700 hover:text-red-500 shadow-sm">
                                     <HeartIcon className="w-4 h-4" filled={item.userHasLiked} />
                                 </button>
                             )}
                        </div>
                        {item.image_urls && item.image_urls.length > 1 && (
                            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm">
                                +{item.image_urls.length - 1} more
                            </div>
                        )}
                        <div className="absolute bottom-2 left-2">
                             <span className="bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                                 {item.category}
                             </span>
                        </div>
                    </div>

                    <div className="flex justify-between items-start mb-1">
                        <div>
                            <h3 className="font-bold text-lg text-gray-900 line-clamp-1">{item.title}</h3>
                        </div>
                        <p className="font-bold text-green-700 whitespace-nowrap">GHS {item.price.toFixed(2)}</p>
                    </div>

                    {/* Seller Info Row */}
                    <div className="flex items-center gap-2 mb-3 text-sm">
                        <span className="text-blue-600 font-medium cursor-pointer hover:underline">{item.seller_name}</span>
                        {item.merchant_id && (
                            <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center border border-blue-200">
                                <ShieldCheckIcon className="w-3 h-3 mr-0.5" /> VERIFIED
                            </span>
                        )}
                        <div className="flex items-center gap-1 text-gray-500 ml-auto">
                            <HeartIcon className="w-3 h-3 text-red-500" filled />
                            <span className="text-xs font-semibold">{item.likes || 0}</span>
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

                       {/* Pagination Dots for Slideshow */}
                       {detailsItem.image_urls && detailsItem.image_urls.length > 1 && (
                           <div className="absolute bottom-2 right-2 flex gap-1 z-20">
                               {detailsItem.image_urls.map((_, idx) => (
                                   <div 
                                     key={idx} 
                                     className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${idx === currentImageIndex ? 'bg-white' : 'bg-white/40'}`} 
                                   />
                               ))}
                           </div>
                       )}
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

                       <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                           <div className="flex justify-between items-center mb-2">
                               <h4 className="font-bold text-sm text-blue-900 flex items-center">
                                   Seller Information
                                   {detailsItem.merchant_id && <ShieldCheckIcon className="w-4 h-4 ml-1 text-blue-600" />}
                               </h4>
                               {sellerStats && (
                                   <div className="flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm border border-blue-100">
                                       <StarIcon className="w-4 h-4 text-yellow-400 fill-current" />
                                       <span className="text-sm font-bold text-gray-800">{sellerStats.avg.toFixed(1)}</span>
                                       <span className="text-xs text-gray-500">({sellerStats.count})</span>
                                   </div>
                               )}
                           </div>
                           <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                               <div>
                                   <span className="block text-xs text-blue-700 uppercase">Name</span>
                                   <span className="font-medium text-blue-900">{detailsItem.seller_name}</span>
                               </div>
                               <div>
                                   <span className="block text-xs text-blue-700 uppercase">Phone</span>
                                   <span className="font-medium text-blue-900">{detailsItem.seller_phone || 'Hidden'}</span>
                               </div>
                           </div>
                           
                           {/* Rate Seller Button */}
                           {user && user.uid !== detailsItem.user_id && (
                               <button 
                                   onClick={() => setShowRatingModal(true)}
                                   className="text-xs text-blue-600 hover:text-blue-800 underline font-medium"
                               >
                                   Rate Seller
                               </button>
                           )}
                       </div>

                       <Button onClick={() => { 
                           const itemToChat = detailsItem;
                           setDetailsItem(null); 
                           handleOpenChat(itemToChat); 
                       }} className="w-full bg-green-700 hover:bg-green-800 py-3 text-base shadow-lg">
                           <MessageSquareIcon className="w-5 h-5 mr-2" /> Chat with Seller to Buy
                       </Button>
                   </div>
               </Card>
           </div>
       )}

       {/* Rating Modal */}
       {showRatingModal && detailsItem && (
           <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 animate-fade-in">
               <Card className="w-full max-w-sm text-center">
                   <h3 className="text-lg font-bold text-gray-900 mb-2">Rate {detailsItem.seller_name}</h3>
                   <p className="text-sm text-gray-500 mb-4">How was your experience?</p>
                   
                   <div className="flex justify-center gap-2 mb-4">
                       {[1, 2, 3, 4, 5].map((star) => (
                           <button 
                               key={star} 
                               type="button" 
                               onClick={() => setRatingValue(star)}
                               className="focus:outline-none transition-transform hover:scale-110"
                           >
                               <StarIcon className={`w-8 h-8 ${star <= ratingValue ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} />
                           </button>
                       ))}
                   </div>
                   
                   <textarea 
                       value={ratingComment} 
                       onChange={e => setRatingComment(e.target.value)} 
                       className="w-full border p-2 rounded mb-4 text-sm" 
                       placeholder="Optional comment..." 
                       rows={3} 
                   />
                   
                   <div className="flex gap-2">
                       <Button onClick={() => setShowRatingModal(false)} className="flex-1 bg-gray-200 !text-gray-900">Cancel</Button>
                       <Button onClick={handleSubmitRating} isLoading={isSubmitting} disabled={ratingValue === 0} className="flex-1">Submit</Button>
                   </div>
               </Card>
           </div>
       )}

       {/* Add/Edit Modal */}
       {showAddModal && (
           <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
               <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="text-xl font-bold text-gray-800">{isEditMode ? 'Edit Product' : 'Sell Product'}</h3>
                       <button onClick={() => setShowAddModal(false)}><XIcon className="w-6 h-6 text-gray-500" /></button>
                   </div>
                   <form onSubmit={isEditMode ? handleUpdateItem : handleAddItem} className="space-y-4">
                       <div>
                           <label className="text-sm font-medium text-gray-700 block mb-1">Product Title</label>
                           <input required value={newItem.title} onChange={e => setNewItem({...newItem, title: e.target.value})} className="w-full border p-2 rounded bg-white text-gray-900" placeholder="e.g. Fresh Tomatoes" />
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                           <div>
                               <label className="text-sm font-medium text-gray-700 block mb-1">Category</label>
                               <select value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value as any})} className="w-full border p-2 rounded bg-white text-gray-900">
                                   {categories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                           </div>
                           <div>
                               <label className="text-sm font-medium text-gray-700 block mb-1">Price (GHS)</label>
                               <input required type="number" value={newItem.price} onChange={e => setNewItem({...newItem, price: parseFloat(e.target.value)})} className="w-full border p-2 rounded bg-white text-gray-900" />
                           </div>
                       </div>
                       <div>
                           <label className="text-sm font-medium text-gray-700 block mb-1">Usage / Description</label>
                           <textarea value={newItem.usage_instructions} onChange={e => setNewItem({...newItem, usage_instructions: e.target.value})} className="w-full border p-2 rounded bg-white text-gray-900 h-20" placeholder="How to use this product..." />
                       </div>
                       <div>
                           <label className="text-sm font-medium text-gray-700 block mb-1">Storage Instructions (Optional)</label>
                           <textarea value={newItem.storage_recommendations || ''} onChange={e => setNewItem({...newItem, storage_recommendations: e.target.value})} className="w-full border p-2 rounded bg-white text-gray-900 h-20" placeholder="e.g. Keep in a cool dry place..." />
                       </div>
                       <div>
                           <label className="text-sm font-medium text-gray-700 block mb-1">Location</label>
                           <div className="flex gap-2">
                               <input required value={newItem.location_name} onChange={e => setNewItem({...newItem, location_name: e.target.value})} className="flex-grow border p-2 rounded bg-white text-gray-900" placeholder="e.g. Accra Market" />
                               <button type="button" onClick={handleUseMyLocation} className="px-3 bg-gray-100 border rounded text-gray-600 hover:bg-gray-200" title="Use GPS"><GridIcon className="w-5 h-5" /></button>
                           </div>
                       </div>
                       <div>
                           <label className="text-sm font-medium text-gray-700 block mb-1">Images</label>
                           <div className="flex flex-col gap-2">
                               <div className="flex items-center gap-4">
                                   <Button type="button" onClick={() => fileInputRef.current?.click()} className="bg-gray-100 !text-gray-700 hover:bg-gray-200 border-gray-300 w-full flex justify-center"><UploadIcon className="w-4 h-4 mr-2" /> Select Photos</Button>
                                   <input type="file" multiple ref={fileInputRef} onChange={handleImageChange} className="hidden" accept="image/*" />
                               </div>
                               
                               {/* Image Previews */}
                               {imagePreviews.length > 0 && (
                                   <div className="grid grid-cols-4 gap-2 mt-2">
                                       {imagePreviews.map((src, idx) => (
                                           <div key={idx} className="relative w-16 h-16 bg-gray-100 rounded border flex items-center justify-center overflow-hidden group">
                                               <img src={src} className="w-full h-full object-cover" alt={`Preview ${idx}`} />
                                               {!isEditMode || itemImages.length > 0 ? ( // Allow removal if newly added or not strictly locked
                                                   <button type="button" onClick={() => removeImage(idx)} className="absolute top-0 right-0 bg-red-500 text-white rounded-bl p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                                       <XIcon className="w-3 h-3" />
                                                   </button>
                                               ) : null}
                                           </div>
                                       ))}
                                   </div>
                               )}
                           </div>
                       </div>
                       <Button type="submit" isLoading={isSubmitting} className="w-full bg-purple-600 hover:bg-purple-700">{isEditMode ? 'Save Changes' : 'List Item'}</Button>
                   </form>
               </Card>
           </div>
       )}

       {/* Delete Modal */}
       {showDeleteModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <Card className="max-w-sm w-full text-center">
                    <TrashIcon className="w-12 h-12 text-red-500 mx-auto mb-3" />
                    <h3 className="text-lg font-bold mb-2">Delete Item?</h3>
                    <p className="text-gray-600 mb-6">Are you sure you want to remove this product?</p>
                    <div className="flex gap-3">
                        <Button onClick={() => setShowDeleteModal(false)} className="flex-1 bg-gray-200 !text-gray-900">Cancel</Button>
                        <Button onClick={handleDeleteItem} className="flex-1 bg-red-600 text-white">Delete</Button>
                    </div>
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
                                   <p className={`text-[10px] mt-1 text-right ${msg.sender === 'user' ? 'text-purple-200' : 'text-gray-400'}`}>{msg.timestamp}</p>
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
