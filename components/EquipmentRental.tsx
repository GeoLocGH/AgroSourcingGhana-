
import React, { useState, useRef, useEffect } from 'react';
import { EquipmentType, EquipmentItem, Message, User, Inquiry, View } from '../types';
import Card from './common/Card';
import Button from './common/Button';
import { TractorIcon, SearchIcon, MessageSquareIcon, XIcon, PlusIcon, PencilIcon, TrashIcon, Spinner, UploadIcon, MailIcon, GridIcon, ShieldCheckIcon, StarIcon, DoubleCheckIcon } from './common/icons';
import { useNotifications } from '../contexts/NotificationContext';
import { fileToDataUri } from '../utils';
import { supabase } from '../services/supabase';
import { uploadUserFile } from '../services/storageService';
import { useGeolocation } from '../hooks/useGeolocation';

interface ChatContext {
    id: string;
    name: string;
    subject: string;
    participants?: string[];
    receiverId?: string; // Explicit receiver ID for reliability
}

interface EquipmentRentalProps {
    user: User | null;
    setActiveView: (view: View) => void;
    onRequireLogin: () => void;
}

const EquipmentRental: React.FC<EquipmentRentalProps> = ({ user, setActiveView, onRequireLogin }) => {
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<EquipmentType | 'All'>('All');
  const { addNotification } = useNotifications();
  const { location } = useGeolocation();

  // Modal State for Details
  const [selectedItem, setSelectedItem] = useState<EquipmentItem | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Rating State
  const [ownerStats, setOwnerStats] = useState<{ avg: number, count: number } | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  // Form State
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentItem, setCurrentItem] = useState<Partial<EquipmentItem>>({
      name: '',
      type: EquipmentType.Tractor,
      location: '',
      location_lat: undefined,
      location_lng: undefined,
      price_per_day: 0,
      description: '',
      owner: ''
  });
  
  // Multiple Image State
  const [itemImages, setItemImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<EquipmentItem | null>(null);

  // Inquiry Modal State
  const [isInquiryVisible, setIsInquiryVisible] = useState(false);
  const [inquiryItem, setInquiryItem] = useState<EquipmentItem | null>(null);
  const [inquiryForm, setInquiryForm] = useState<Partial<Inquiry>>({
      name: '',
      email: '',
      phone: '',
      message: ''
  });

  const [isChatVisible, setIsChatVisible] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [messages, setMessages] = useState<(Message & { is_read?: boolean })[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    const fetchItems = async () => {
        try {
            const { data, error } = await supabase
                .from('equipment')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) {
                console.error("Error fetching equipment:", JSON.stringify(error, null, 2));
                setItems([]);
            } else {
                // Ensure user_id is populated from owner_id if missing (legacy fix)
                const fixedData = (data || []).map((item: any) => ({
                    ...item,
                    user_id: item.user_id || item.owner_id
                }));
                setItems((fixedData as EquipmentItem[]) || []);
            }
        } catch (err) {
            console.error("Unexpected error fetching equipment:", err);
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    const subscription = supabase
        .channel('public:equipment')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, fetchItems)
        .subscribe();

    fetchItems();
    return () => { subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if(isChatVisible) {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatVisible]);

  // Slideshow Logic for Details Modal
  useEffect(() => {
      if (selectedItem) {
          setCurrentImageIndex(0);
          fetchOwnerRating(selectedItem.user_id);
      } else {
          setOwnerStats(null);
      }
  }, [selectedItem]);

  // Convert single image to array for slideshow consistency (future-proof)
  const getSelectedImages = () => {
      if (!selectedItem) return [];
      if (selectedItem.image_urls && selectedItem.image_urls.length > 0) return selectedItem.image_urls;
      if (selectedItem.image_url) return [selectedItem.image_url];
      return [];
  };

  useEffect(() => {
      const images = getSelectedImages();
      if (images.length <= 1) return;

      const interval = setInterval(() => {
          setCurrentImageIndex(prev => (prev + 1) % images.length);
      }, 3000);

      return () => clearInterval(interval);
  }, [selectedItem]);

  // Chat Listener
  useEffect(() => {
    let mounted = true;
    if (!chatContext?.id || !isChatVisible || !user?.uid) return;

    const fetchMessages = async () => {
        // Mark as read
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
                timestamp: msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
                is_read: msg.is_read
            }));
            setMessages(mappedMessages);
        } else if (mounted) {
            setMessages([]);
        }
    };
    fetchMessages();

    const channel = supabase
        .channel(`chat_equipment:${chatContext.id}`)
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
                        if (newRecord.receiver_id === user.uid) {
                            supabase.from('chats').update({ is_read: true }).eq('id', newRecord.id);
                        }

                        setMessages((prev) => {
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


  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'All' || item.type === selectedType;
    return matchesSearch && matchesType;
  });

  const fetchOwnerRating = async (ownerId: string) => { /* ... (Unchanged) */ };
  const handleSubmitRating = async (e: React.FormEvent) => { /* ... (Unchanged) */ };
  const handleOpenInquiry = (item: EquipmentItem) => { /* ... (Unchanged) */ };
  const submitInquiry = async (e: React.FormEvent) => { /* ... (Unchanged) */ };

  const handleOpenChat = (item: EquipmentItem) => {
      if (!user || !user.uid) {
          onRequireLogin();
          return;
      }
      if (item.user_id === user.uid) {
          addNotification({ type: 'rental', title: 'Error', message: 'You cannot chat with yourself.', view: 'RENTAL' });
          return;
      }
      
      if (!item.user_id) {
          addNotification({ type: 'rental', title: 'Unavailable', message: 'Owner information is missing for this item.', view: 'RENTAL' });
          return;
      }

      setChatContext({
          id: String(item.id),
          name: item.owner,
          subject: item.name,
          participants: [user.uid, item.user_id],
          receiverId: item.user_id
      });
      setIsChatVisible(true);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentMessage.trim() || !chatContext) return;

      setIsSending(true);

      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();

      if (authError || !currentUser) {
          addNotification({ type: 'rental', title: 'Authentication Error', message: 'Please log in again.', view: 'RENTAL' });
          setIsSending(false);
          return;
      }

      const receiverId = chatContext.receiverId || chatContext.participants?.find(p => p !== currentUser.id);
      
      if (!chatContext.id) {
          console.error("Missing Item ID (Chat Context ID)");
          setIsSending(false);
          return;
      }
      if (!receiverId) {
          console.error("Missing Receiver ID.");
          addNotification({ type: 'rental', title: 'Error', message: 'Unable to identify message recipient.', view: 'RENTAL' });
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
          const errorMessage = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
          addNotification({ type: 'rental', title: 'Error', message: `Failed to send: ${errorMessage}`, view: 'RENTAL' });
      } finally {
          setIsSending(false);
      }
  };

  // ... (Other handlers unchanged)
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => { /* ... */ };
  const removeImage = (index: number) => { /* ... */ };
  const handleUseMyLocation = (e: React.MouseEvent) => { /* ... */ };
  const handleAddItem = async (e: React.FormEvent) => { /* ... */ };
  const handleUpdateItem = async (e: React.FormEvent) => { /* ... */ };
  const handleDeleteItem = async () => { /* ... */ };
  const openEditModal = (item: EquipmentItem) => { /* ... */ };
  const resetForm = () => { /* ... */ };
  const canManage = (item: EquipmentItem) => { /* ... */ return false; };
  const goToMyEquipment = () => { setActiveView('PROFILE'); };

  return (
    <div className="space-y-6">
        {/* ... Header and Grid ... (Unchanged) */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-full text-green-800">
                    <TractorIcon className="w-8 h-8" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white">Equipment Rental</h2>
                    <p className="text-orange-700 font-medium">Rent tractors, harvesters, and tools.</p>
                </div>
            </div>
            <div className="flex gap-2">
                {user && (
                    <Button onClick={goToMyEquipment} className="bg-white !text-indigo-700 border border-indigo-200 hover:bg-indigo-50 shadow-sm">
                        <TractorIcon className="w-5 h-5 mr-2" /> My Equipment
                    </Button>
                )}
                <Button onClick={() => { resetForm(); setIsFormVisible(true); }}>
                    <PlusIcon className="w-5 h-5 mr-2" /> List Equipment
                </Button>
            </div>
        </div>

        {/* ... Filter Logic ... */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4">
            <div className="relative flex-grow">
                <input 
                    type="text" 
                    placeholder="Search by name or location..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-gray-900"
                />
                <SearchIcon className="absolute left-3 top-2.5 text-gray-400 w-5 h-5" />
            </div>
            <select 
                value={selectedType} 
                onChange={(e) => setSelectedType(e.target.value as EquipmentType | 'All')}
                className="p-2 border border-gray-300 rounded-lg bg-white text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
            >
                <option value="All">All Types</option>
                {Object.values(EquipmentType).map(type => (
                    <option key={type} value={type}>{type}</option>
                ))}
            </select>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* ... Item Cards ... */}
            {loading ? <div className="col-span-full text-center"><Spinner className="w-8 h-8"/></div> : filteredItems.map(item => (
                <Card key={item.id} className="flex flex-col h-full overflow-hidden hover:shadow-lg transition-shadow">
                    <div 
                        className="relative h-48 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 mb-4 bg-gray-200 group overflow-hidden cursor-pointer"
                        onClick={() => setSelectedItem(item)}
                    >
                        <img 
                            src={item.image_urls?.[0] || item.image_url || 'https://placehold.co/600x400?text=Equipment'} 
                            alt={item.name} 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                        />
                    </div>
                    <div className="mt-auto pt-2 grid grid-cols-2 gap-2">
                        <Button onClick={() => setSelectedItem(item)} className="text-xs py-2 bg-gray-100 !text-gray-900 hover:bg-gray-200">
                            Details
                        </Button>
                        <Button onClick={() => handleOpenInquiry(item)} className="text-xs py-2 bg-indigo-600 hover:bg-indigo-700">
                            <MailIcon className="w-4 h-4 mr-1 inline" /> Inquiry
                        </Button>
                    </div>
                </Card>
            ))}
        </div>

        {/* Equipment Details Modal */}
        {selectedItem && (
           <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedItem(null)}>
               <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                   <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">{selectedItem.name}</h3>
                            <p className="text-sm text-gray-500 flex items-center gap-1">
                                <GridIcon className="w-3 h-3" /> {selectedItem.location}
                            </p>
                        </div>
                        <button onClick={() => setSelectedItem(null)} className="text-gray-500 hover:text-gray-800 bg-gray-100 rounded-full p-1"><XIcon className="w-6 h-6" /></button>
                   </div>

                   {/* Image Slideshow */}
                   <div className="relative h-64 bg-gray-100 rounded-lg overflow-hidden mb-4 border border-gray-200 group">
                        {getSelectedImages().length > 0 ? (
                            getSelectedImages().map((url, idx) => (
                                <img 
                                    key={idx}
                                    src={url} 
                                    alt={`${selectedItem.name} ${idx}`}
                                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${idx === currentImageIndex ? 'opacity-100' : 'opacity-0'}`}
                                />
                            ))
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400">No Image</div>
                        )}
                        
                        {getSelectedImages().length > 1 && (
                            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-1">
                                {getSelectedImages().map((_, idx) => (
                                    <div key={idx} className={`w-1.5 h-1.5 rounded-full ${idx === currentImageIndex ? 'bg-white' : 'bg-white/50'}`} />
                                ))}
                            </div>
                        )}
                   </div>

                   <div className="space-y-4 mb-6">
                        <div className="flex justify-between items-center border-b pb-3 border-gray-100">
                            <span className="text-2xl font-bold text-indigo-700">GHS {selectedItem.price_per_day.toFixed(2)}<span className="text-sm text-gray-500 font-normal">/day</span></span>
                            <span className="bg-indigo-50 text-indigo-800 px-2 py-1 rounded text-xs font-bold uppercase">{selectedItem.type}</span>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold text-gray-700 mb-1">Description</h4>
                            <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{selectedItem.description || "No description provided."}</p>
                        </div>

                        {ownerStats && (
                            <div className="flex items-center gap-1 bg-yellow-50 p-2 rounded text-yellow-800 text-sm">
                                <StarIcon className="w-4 h-4 text-yellow-500" />
                                <span className="font-bold">{ownerStats.avg.toFixed(1)}</span>
                                <span className="text-yellow-600">({ownerStats.count} reviews)</span>
                            </div>
                        )}
                   </div>

                   {!canManage(selectedItem) && (
                       <div className="grid grid-cols-2 gap-3">
                           <Button onClick={() => { setSelectedItem(null); handleOpenInquiry(selectedItem); }} className="bg-indigo-600 hover:bg-indigo-700">
                               <MailIcon className="w-4 h-4 mr-2" /> Send Inquiry
                           </Button>
                           <Button onClick={() => { setSelectedItem(null); handleOpenChat(selectedItem); }} className="bg-green-600 text-white hover:bg-green-700 border-none shadow-md">
                               <MessageSquareIcon className="w-4 h-4 mr-2" /> Chat Now
                           </Button>
                       </div>
                   )}
               </Card>
           </div>
       )}

       {/* Chat Modal */}
       {isChatVisible && chatContext && (
             <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-lg w-full max-w-md flex flex-col h-[70vh]">
                    <div className="p-4 border-b flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-lg text-gray-800">Chat with {chatContext.name}</h3>
                            <p className="text-sm text-gray-500">Re: {chatContext.subject}</p>
                        </div>
                        <button onClick={() => setIsChatVisible(false)} className="text-gray-500 hover:text-gray-800"><XIcon className="w-6 h-6" /></button>
                    </div>
                    <div className="flex-grow p-4 overflow-y-auto bg-gray-50 space-y-4">
                        {messages.length > 0 ? messages.map((msg, index) => (
                            <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-xs lg:max-w-md p-3 rounded-lg ${msg.sender === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-800'}`}>
                                    <p>{msg.text}</p>
                                    <div className="flex justify-end items-center gap-1 mt-1">
                                        <p className={`text-xs ${msg.sender === 'user' ? 'text-indigo-200' : 'text-gray-500'}`}>{msg.timestamp}</p>
                                        {msg.sender === 'user' && (
                                            msg.is_read ? 
                                            <DoubleCheckIcon className="w-3 h-3 text-blue-200" /> : 
                                            <DoubleCheckIcon className="w-3 h-3 text-indigo-300 opacity-60" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <p className="text-center text-gray-500 mt-10">Start a conversation!</p>
                        )}
                        <div ref={chatEndRef} />
                    </div>
                    <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2">
                        <input type="text" value={currentMessage} onChange={(e) => setCurrentMessage(e.target.value)} placeholder="Type your message..." className="flex-grow border border-gray-300 p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 !bg-white !text-gray-900" />
                        <Button type="submit" isLoading={isSending}>Send</Button>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};

export default EquipmentRental;
