
import React, { useState, useRef, useEffect } from 'react';
import { EquipmentType, EquipmentItem, Message, User, Inquiry, View } from '../types';
import Card from './common/Card';
import Button from './common/Button';
import { TractorIcon, SearchIcon, MessageSquareIcon, XIcon, PlusIcon, PencilIcon, TrashIcon, Spinner, UploadIcon, MailIcon, GridIcon, ShieldCheckIcon, StarIcon } from './common/icons';
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
  const [messages, setMessages] = useState<Message[]>([]);
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
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
                timestamp: msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'
            }));
            setMessages(mappedMessages);
        } else {
            setMessages([]);
        }
    };
    fetchMessages();

    const channel = supabase
        .channel(`chat_equipment:${chatContext.id}`)
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
                
                // IMPORTANT: Filter messages relevant to this specific conversation
                const isRelevant = 
                    (newRecord.sender_id === user.uid) || 
                    (newRecord.receiver_id === user.uid);

                if (isRelevant) {
                    const newMessage: Message = {
                        id: newRecord.id,
                        sender: newRecord.sender_id === user.uid ? 'user' : 'seller',
                        text: newRecord.message_text,
                        timestamp: new Date(newRecord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    };
                    setMessages((prev) => [...prev, newMessage]);
                }
            }
        )
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chatContext, isChatVisible, user?.uid]);


  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'All' || item.type === selectedType;
    return matchesSearch && matchesType;
  });

  const fetchOwnerRating = async (ownerId: string) => {
      if (!ownerId) return;
      try {
          const { data, error } = await supabase
              .from('user_reviews')
              .select('rating')
              .eq('target_user_id', ownerId);
          
          if (error) throw error;

          if (data && data.length > 0) {
              const total = data.reduce((acc, curr) => acc + curr.rating, 0);
              setOwnerStats({
                  avg: total / data.length,
                  count: data.length
              });
          } else {
              setOwnerStats({ avg: 0, count: 0 });
          }
      } catch (err) {
          console.error("Error fetching rating", err);
          setOwnerStats(null);
      }
  };

  const handleSubmitRating = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user?.uid || !selectedItem) return;
      
      setIsSubmittingRating(true);
      try {
          const { error } = await supabase.from('user_reviews').insert([{
              reviewer_id: user.uid,
              target_user_id: selectedItem.user_id,
              item_id: String(selectedItem.id),
              context: 'rental',
              rating: ratingValue,
              comment: ratingComment
          }]);

          if (error) throw error;

          addNotification({ type: 'rental', title: 'Review Submitted', message: 'Thank you for your feedback!', view: 'RENTAL' });
          setShowRatingModal(false);
          setRatingValue(0);
          setRatingComment('');
          fetchOwnerRating(selectedItem.user_id);
      } catch (err: any) {
          console.error("Review Error:", err);
          addNotification({ type: 'rental', title: 'Error', message: 'Could not submit review.', view: 'RENTAL' });
      } finally {
          setIsSubmittingRating(false);
      }
  };

  const handleOpenInquiry = (item: EquipmentItem) => {
      setInquiryItem(item);
      setInquiryForm({
          name: user?.name || '',
          email: user?.email || '',
          phone: user?.phone || '',
          message: `I am interested in renting the ${item.name}. Is it available?`
      });
      setIsInquiryVisible(true);
  };

  const submitInquiry = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inquiryItem) return;
      
      setIsSubmitting(true);
      try {
          // Provide default subject and ensure IDs are valid
          const subject = `Inquiry about ${inquiryItem.name}`;
          const recipientId = inquiryItem.user_id;

          const inquiryData = {
              user_id: user?.uid || null,
              item_id: String(inquiryItem.id),
              item_type: 'equipment',
              recipient_id: recipientId, // Important for Profile Inbox
              name: inquiryForm.name,
              email: inquiryForm.email,
              phone: inquiryForm.phone,
              message: inquiryForm.message,
              subject: subject,
              status: 'pending'
          };

          const { error } = await supabase.from('inquiries').insert([inquiryData]);
          if (error) throw error;

          setIsInquiryVisible(false);
          addNotification({ type: 'rental', title: 'Inquiry Sent', message: 'The owner will contact you shortly.', view: 'RENTAL' });
      } catch (err: any) {
          console.error("Error sending inquiry:", err);
          const errorMessage = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
          addNotification({ type: 'rental', title: 'Error', message: `Failed to send inquiry: ${errorMessage}`, view: 'RENTAL' });
      } finally {
          setIsSubmitting(false);
      }
  };

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
              message_text: currentMessage.trim()
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

  const handleUseMyLocation = (e: React.MouseEvent) => {
    e.preventDefault();
    if (location) {
        setCurrentItem(prev => ({
            ...prev,
            location_lat: location.latitude,
            location_lng: location.longitude,
            location: prev.location || 'Current Location' 
        }));
    } else {
        alert("Could not detect location. Please ensure location services are enabled.");
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user?.uid) {
          onRequireLogin();
          return;
      }
      
      setIsSubmitting(true);
      try {
          let imageUrls: string[] = [];
          let mainImageUrl = '';

          const { data: { user: authUser } } = await supabase.auth.getUser();
          const userId = authUser?.id || user.uid;

          if (itemImages.length > 0) {
              const uploadPromises = itemImages.map((file, index) => 
                  uploadUserFile(userId, file, 'rental', '', `Rental: ${currentItem.name} ${index + 1}`)
              );
              const results = await Promise.all(uploadPromises);
              imageUrls = results.map(res => res.file_url);
              mainImageUrl = imageUrls[0]; // Set first image as main
          }

          const newItem = {
              name: currentItem.name,
              type: currentItem.type,
              location: currentItem.location,
              location_lat: currentItem.location_lat ?? null,
              location_lng: currentItem.location_lng ?? null,
              price_per_day: isNaN(Number(currentItem.price_per_day)) ? 0 : Number(currentItem.price_per_day),
              description: currentItem.description,
              image_url: mainImageUrl, // Backward compatibility
              image_urls: imageUrls,
              owner: user.name,
              user_id: userId,
              available: true,
              created_at: new Date().toISOString()
          };

          const { error: dbError } = await supabase.from('equipment').insert([newItem]);
          if (dbError) throw dbError;

          setIsFormVisible(false);
          resetForm();
          addNotification({ type: 'rental', title: 'Equipment Added', message: `${newItem.name} is now listed.`, view: 'RENTAL' });
      } catch (error: any) {
          console.error("Error adding equipment:", JSON.stringify(error, null, 2));
          addNotification({ type: 'rental', title: 'Error', message: `Failed to list equipment. ${error.message || ''}`, view: 'RENTAL' });
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.uid || !currentItem.id) return;

        setIsSubmitting(true);
        try {
            let imageUrls = currentItem.image_urls || (currentItem.image_url ? [currentItem.image_url] : []);
            
            if (itemImages.length > 0) {
                const uploadPromises = itemImages.map((file, index) => 
                    uploadUserFile(user.uid!, file, 'rental', '', `Rental Update: ${currentItem.name} ${index + 1}`)
                );
                const results = await Promise.all(uploadPromises);
                const newUrls = results.map(res => res.file_url);
                imageUrls = [...imageUrls, ...newUrls];
            }

            const updates = {
                name: currentItem.name,
                type: currentItem.type,
                location: currentItem.location,
                location_lat: currentItem.location_lat ?? null,
                location_lng: currentItem.location_lng ?? null,
                price_per_day: isNaN(Number(currentItem.price_per_day)) ? 0 : Number(currentItem.price_per_day),
                description: currentItem.description,
                image_url: imageUrls.length > 0 ? imageUrls[0] : '', // Ensure main image is updated
                image_urls: imageUrls
            };

            const { error } = await supabase.from('equipment').update(updates).eq('id', currentItem.id);
            if (error) throw error;

            setIsFormVisible(false);
            resetForm();
            addNotification({ type: 'rental', title: 'Updated', message: 'Equipment details updated.', view: 'RENTAL' });
        } catch (error) {
            console.error("Error updating:", JSON.stringify(error, null, 2));
            addNotification({ type: 'rental', title: 'Error', message: 'Failed to update item.', view: 'RENTAL' });
        } finally {
            setIsSubmitting(false);
        }
  };

  const handleDeleteItem = async () => {
      if (!itemToDelete) return;
      try {
          const { error } = await supabase.from('equipment').delete().eq('id', itemToDelete.id);
          if (error) throw error;
          
          setIsDeleteModalVisible(false);
          setItemToDelete(null);
          addNotification({ type: 'rental', title: 'Deleted', message: 'Equipment removed.', view: 'RENTAL' });
      } catch (error) {
          console.error("Error deleting:", JSON.stringify(error, null, 2));
          addNotification({ type: 'rental', title: 'Error', message: 'Failed to delete item.', view: 'RENTAL' });
      }
  };

  const openEditModal = (item: EquipmentItem) => {
      setCurrentItem(item);
      // Pre-populate previews
      const existingImages = item.image_urls && item.image_urls.length > 0 ? item.image_urls : (item.image_url ? [item.image_url] : []);
      setImagePreviews(existingImages);
      setIsEditMode(true);
      setIsFormVisible(true);
  };

  const resetForm = () => {
      setCurrentItem({
          name: '',
          type: EquipmentType.Tractor,
          location: '',
          location_lat: undefined,
          location_lng: undefined,
          price_per_day: 0,
          description: '',
          owner: ''
      });
      setItemImages([]);
      setImagePreviews([]);
      setIsEditMode(false);
  };

  const canManage = (item: EquipmentItem) => {
      return user && (user.uid === item.user_id || user.type === 'admin');
  };

  const goToMyEquipment = () => {
      if(!user) {
          onRequireLogin();
          return;
      }
      sessionStorage.setItem('profile_tab', 'LISTINGS');
      setActiveView('PROFILE');
  }

  return (
    <div className="space-y-6">
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
                <div className="col-span-full flex justify-center py-12"><Spinner className="w-8 h-8 text-indigo-600" /></div>
            ) : filteredItems.length === 0 ? (
                <div className="col-span-full text-center py-12 bg-gray-50 rounded border border-dashed text-gray-500">
                    No equipment found matching your search.
                </div>
            ) : (
                filteredItems.map(item => {
                    const displayImage = item.image_urls?.[0] || item.image_url || 'https://placehold.co/600x400?text=Equipment';
                    const moreImagesCount = (item.image_urls?.length || 0) + (item.image_url && !item.image_urls ? 1 : 0) - 1;

                    return (
                        <Card key={item.id} className="flex flex-col h-full overflow-hidden hover:shadow-lg transition-shadow">
                            <div 
                                className="relative h-48 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 mb-4 bg-gray-200 group overflow-hidden cursor-pointer"
                                onClick={() => setSelectedItem(item)}
                            >
                                <img 
                                    src={displayImage} 
                                    alt={item.name} 
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.onerror = null;
                                        target.src = 'https://placehold.co/600x400?text=No+Image';
                                    }}
                                />
                                {moreImagesCount > 0 && (
                                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm">
                                        +{moreImagesCount} more
                                    </div>
                                )}
                                {canManage(item) && (
                                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                        <button onClick={() => openEditModal(item)} className="p-1.5 bg-white rounded-full text-gray-600 hover:text-blue-600 shadow-sm"><PencilIcon className="w-4 h-4" /></button>
                                        <button onClick={() => { setItemToDelete(item); setIsDeleteModalVisible(true); }} className="p-1.5 bg-white rounded-full text-gray-600 hover:text-red-600 shadow-sm"><TrashIcon className="w-4 h-4" /></button>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="font-bold text-lg text-gray-900 line-clamp-1">{item.name}</h3>
                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                        <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">{item.type}</span>
                                        <span className="truncate max-w-[120px]">• {item.location}</span>
                                    </p>
                                </div>
                                <p className="font-bold text-indigo-700 whitespace-nowrap">GHS {item.price_per_day}<span className="text-xs text-gray-500 font-normal">/day</span></p>
                            </div>
                            {item.description && <p className="text-sm text-gray-600 mb-4 line-clamp-2">{item.description}</p>}
                            
                            <div className="mt-auto pt-2 grid grid-cols-2 gap-2">
                                {canManage(item) ? (
                                    <div className="text-xs text-gray-400 italic w-full text-center py-2 bg-gray-50 rounded col-span-2">Your Listing</div>
                                ) : (
                                    <>
                                        <Button onClick={() => setSelectedItem(item)} className="text-xs py-2 bg-gray-100 !text-gray-900 hover:bg-gray-200">
                                            Details
                                        </Button>
                                        <Button onClick={() => handleOpenInquiry(item)} className="text-xs py-2 bg-indigo-600 hover:bg-indigo-700">
                                            <MailIcon className="w-4 h-4 mr-1 inline" /> Inquiry
                                        </Button>
                                    </>
                                )}
                            </div>
                        </Card>
                    );
                })
            )}
        </div>

        {/* Equipment Details Modal */}
        {selectedItem && (
           <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedItem(null)}>
               <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                   <div className="flex justify-between items-start mb-4">
                       <h3 className="text-xl font-bold text-gray-800">{selectedItem.name}</h3>
                       <button onClick={() => setSelectedItem(null)} className="text-gray-500 hover:text-gray-800 bg-gray-100 rounded-full p-1"><XIcon className="w-6 h-6" /></button>
                   </div>
                   
                   <div className="relative h-64 bg-gray-100 rounded-lg overflow-hidden mb-4 border border-gray-200 group">
                       {getSelectedImages().length > 0 ? (
                           getSelectedImages().map((url, idx) => (
                               <img 
                                   key={idx}
                                   src={url} 
                                   alt={`${selectedItem.name} - view ${idx + 1}`}
                                   className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${idx === currentImageIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                               />
                           ))
                       ) : (
                           <img 
                               src='https://placehold.co/600x400?text=No+Image' 
                               alt={selectedItem.name}
                               className="w-full h-full object-cover"
                           />
                       )}
                       
                       <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded z-20">
                           {selectedItem.location || 'Location Unknown'}
                       </div>

                       {/* Pagination Dots */}
                       {getSelectedImages().length > 1 && (
                           <div className="absolute bottom-2 right-2 flex gap-1 z-20">
                               {getSelectedImages().map((_, idx) => (
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
                           <span className="text-2xl font-bold text-indigo-700">GHS {selectedItem.price_per_day.toFixed(2)}<span className='text-sm text-gray-500 font-normal'>/day</span></span>
                           <div className="flex flex-col items-end">
                               <span className="text-xs text-gray-500">Type</span>
                               <span className="font-medium bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded">{selectedItem.type}</span>
                           </div>
                       </div>

                       <div>
                           <h4 className="font-bold text-sm text-gray-700 mb-1">Description</h4>
                           <div className="bg-gray-50 p-3 rounded border border-gray-100 text-sm text-gray-600">
                               <p className="leading-relaxed whitespace-pre-wrap">
                                   {selectedItem.description || 'No detailed description available.'}
                               </p>
                           </div>
                       </div>

                       <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                           <div className="flex justify-between items-center mb-2">
                               <h4 className="font-bold text-sm text-blue-900 flex items-center">
                                   Owner Information
                                   <ShieldCheckIcon className="w-4 h-4 ml-1 text-blue-600" />
                               </h4>
                               {ownerStats && (
                                   <div className="flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm border border-blue-100">
                                       <StarIcon className="w-4 h-4 text-yellow-400 fill-current" />
                                       <span className="text-sm font-bold text-gray-800">{ownerStats.avg.toFixed(1)}</span>
                                       <span className="text-xs text-gray-500">({ownerStats.count})</span>
                                   </div>
                               )}
                           </div>
                           <div className="text-sm mb-3">
                               <span className="block text-xs text-blue-700 uppercase">Name</span>
                               <span className="font-medium text-blue-900">{selectedItem.owner}</span>
                           </div>
                           
                           {/* Rate Owner Button */}
                           {user && user.uid !== selectedItem.user_id && (
                               <button 
                                   onClick={() => setShowRatingModal(true)}
                                   className="text-xs text-blue-600 hover:text-blue-800 underline font-medium"
                               >
                                   Rate Owner
                               </button>
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
                   </div>
               </Card>
           </div>
       )}

       {/* Rating Modal */}
       {showRatingModal && selectedItem && (
           <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 animate-fade-in">
               <Card className="w-full max-w-sm text-center">
                   <h3 className="text-lg font-bold text-gray-900 mb-2">Rate {selectedItem.owner}</h3>
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
                       className="w-full border p-2 rounded mb-4 text-sm !bg-white !text-gray-900" 
                       placeholder="Optional comment..." 
                       rows={3} 
                   />
                   
                   <div className="flex gap-2">
                       <Button onClick={() => setShowRatingModal(false)} className="flex-1 bg-gray-200 !text-gray-900">Cancel</Button>
                       <Button onClick={handleSubmitRating} isLoading={isSubmittingRating} disabled={ratingValue === 0} className="flex-1">Submit</Button>
                   </div>
               </Card>
           </div>
       )}

        {/* Modal Declarations are same as before, simplified for brevity but full code is present above */}
        {isFormVisible && (
             <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                 {/* ... Form Content ... */}
                 <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-gray-800">{isEditMode ? 'Edit Equipment' : 'List Equipment'}</h3>
                        <button onClick={() => setIsFormVisible(false)} className="text-gray-500 hover:text-gray-800"><XIcon className="w-6 h-6" /></button>
                    </div>
                    <form onSubmit={isEditMode ? handleUpdateItem : handleAddItem} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Equipment Name</label>
                            <input required type="text" value={currentItem.name} onChange={e => setCurrentItem({...currentItem, name: e.target.value})} className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Type</label>
                                <select value={currentItem.type} onChange={e => setCurrentItem({...currentItem, type: e.target.value as EquipmentType})} className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none">
                                    {Object.values(EquipmentType).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Price per Day (GHS)</label>
                                <input required type="number" value={currentItem.price_per_day} onChange={e => setCurrentItem({...currentItem, price_per_day: parseFloat(e.target.value)})} className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Location Name</label>
                            <input required type="text" value={currentItem.location} onChange={e => setCurrentItem({...currentItem, location: e.target.value})} className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Kumasi Central" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 bg-gray-50 p-3 rounded border border-gray-200">
                             <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-gray-700 mb-2">GPS Coordinates (Optional)</label>
                                 <button type="button" onClick={handleUseMyLocation} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded border border-blue-200 hover:bg-blue-200 flex items-center mb-2 font-medium">
                                    <GridIcon className="w-3 h-3 mr-1" /> Auto-Detect Location
                                </button>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600">Latitude</label>
                                <input type="number" step="any" value={currentItem.location_lat ?? ''} onChange={e => setCurrentItem({...currentItem, location_lat: e.target.value ? parseFloat(e.target.value) : undefined})} className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0.000000" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600">Longitude</label>
                                <input type="number" step="any" value={currentItem.location_lng ?? ''} onChange={e => setCurrentItem({...currentItem, location_lng: e.target.value ? parseFloat(e.target.value) : undefined})} className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0.000000" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Description</label>
                            <textarea value={currentItem.description} onChange={e => setCurrentItem({...currentItem, description: e.target.value})} className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none" rows={3}></textarea>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Images</label>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-4">
                                    <Button type="button" onClick={() => fileInputRef.current?.click()} className="bg-gray-100 !text-gray-700 hover:bg-gray-200 border-gray-300 w-full flex justify-center"><UploadIcon className="w-4 h-4 mr-2" /> Select Photos</Button>
                                    <input type="file" multiple ref={fileInputRef} onChange={handleImageChange} className="hidden" accept="image/*" />
                                </div>
                                {imagePreviews.length > 0 && (
                                   <div className="grid grid-cols-4 gap-2 mt-2">
                                       {imagePreviews.map((src, idx) => (
                                           <div key={idx} className="relative w-16 h-16 bg-gray-100 rounded border flex items-center justify-center overflow-hidden group">
                                               <img src={src} className="w-full h-full object-cover" alt={`Preview ${idx}`} />
                                               {!isEditMode || itemImages.length > 0 ? (
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
                        <div className="flex gap-2 pt-4">
                            <Button type="submit" isLoading={isSubmitting} className="flex-1 bg-indigo-600 hover:bg-indigo-700">{isEditMode ? 'Save Changes' : 'List Item'}</Button>
                            <Button type="button" onClick={() => setIsFormVisible(false)} className="flex-1 bg-gray-200 !text-gray-900 hover:bg-gray-300">Cancel</Button>
                        </div>
                    </form>
                 </Card>
             </div>
        )}
        {isDeleteModalVisible && (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                <Card className="w-full max-w-sm text-center">
                    <TrashIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold mb-2">Delete Equipment?</h3>
                    <p className="text-gray-600 mb-6">Are you sure you want to remove this listing?</p>
                    <div className="flex gap-3">
                        <Button onClick={() => setIsDeleteModalVisible(false)} className="flex-1 bg-gray-200 !text-gray-900">Cancel</Button>
                        <Button onClick={handleDeleteItem} className="flex-1 bg-red-600 text-white">Delete</Button>
                    </div>
                </Card>
            </div>
        )}
        {isInquiryVisible && inquiryItem && (
             <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                <Card className="w-full max-w-md">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-gray-800">Inquiry for {inquiryItem.name}</h3>
                        <button onClick={() => setIsInquiryVisible(false)} className="text-gray-500 hover:text-gray-800"><XIcon className="w-6 h-6" /></button>
                    </div>
                    <form onSubmit={submitInquiry} className="space-y-3">
                        <input required placeholder="Your Name" value={inquiryForm.name} onChange={e => setInquiryForm({...inquiryForm, name: e.target.value})} className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900" />
                        <input required placeholder="Email" type="email" value={inquiryForm.email} onChange={e => setInquiryForm({...inquiryForm, email: e.target.value})} className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900" />
                        <input required placeholder="Phone" type="tel" value={inquiryForm.phone} onChange={e => setInquiryForm({...inquiryForm, phone: e.target.value})} className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900" />
                        <textarea required placeholder="Message" value={inquiryForm.message} onChange={e => setInquiryForm({...inquiryForm, message: e.target.value})} className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900" rows={3}></textarea>
                        <Button type="submit" isLoading={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700">Send Inquiry</Button>
                    </form>
                </Card>
            </div>
        )}
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
                                    <p className={`text-xs mt-1 ${msg.sender === 'user' ? 'text-indigo-200' : 'text-gray-500'} text-right`}>{msg.timestamp}</p>
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
