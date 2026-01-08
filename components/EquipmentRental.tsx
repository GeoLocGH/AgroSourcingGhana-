
import React, { useState, useRef, useEffect } from 'react';
import { EquipmentType, EquipmentItem, Message, User, Inquiry } from '../types';
import Card from './common/Card';
import Button from './common/Button';
import { TractorIcon, SearchIcon, MessageSquareIcon, XIcon, PlusIcon, PencilIcon, TrashIcon, Spinner, UploadIcon, PhoneIcon, MailIcon, GridIcon } from './common/icons';
import { useNotifications } from '../contexts/NotificationContext';
import { fileToDataUri } from '../utils';
import { uploadUserFile } from '../services/storageService';
import { supabase } from '../services/supabase';
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
    onRequireLogin: () => void;
}

const EquipmentRental: React.FC<EquipmentRentalProps> = ({ user, onRequireLogin }) => {
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<EquipmentType | 'All'>('All');
  const { addNotification } = useNotifications();
  const { location } = useGeolocation();

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
  
  const [itemImagePreview, setItemImagePreview] = useState<string | null>(null);
  const [itemImageFile, setItemImageFile] = useState<File | null>(null);
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
                setItems((data as EquipmentItem[]) || []);
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

  // Chat Listener
  useEffect(() => {
    if (!chatContext?.id || !isChatVisible || !user?.uid) return;

    const fetchMessages = async () => {
        const { data, error } = await supabase
            .from('chats')
            .select('*')
            .eq('item_id', chatContext.id)
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
                const newMessage: Message = {
                    id: newRecord.id,
                    sender: newRecord.sender_id === user.uid ? 'user' : 'seller',
                    text: newRecord.message_text,
                    timestamp: new Date(newRecord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };

                setMessages((prev) => [...prev, newMessage]);

                // Play notification sound if message is incoming
                if (newRecord.sender_id !== user.uid) {
                     try {
                        new Audio('/notification.mp3').play().catch(() => {});
                     } catch(e) {}
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
          const inquiryData = {
              user_id: user?.uid || null,
              item_id: inquiryItem.id,
              item_type: 'equipment',
              name: inquiryForm.name,
              email: inquiryForm.email,
              phone: inquiryForm.phone,
              message: inquiryForm.message,
              status: 'pending'
          };

          const { error } = await supabase.from('inquiries').insert([inquiryData]);
          if (error) throw error;

          setIsInquiryVisible(false);
          addNotification({ type: 'rental', title: 'Inquiry Sent', message: 'The owner will contact you shortly.', view: 'RENTAL' });
      } catch (err: any) {
          console.error("Error sending inquiry:", err);
          addNotification({ type: 'rental', title: 'Error', message: 'Failed to send inquiry.', view: 'RENTAL' });
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleOpenChat = (item: EquipmentItem) => {
      if (!user || !user.uid) {
          onRequireLogin();
          return;
      }
      if (item.owner_id === user.uid) {
          addNotification({ type: 'rental', title: 'Error', message: 'You cannot chat with yourself.', view: 'RENTAL' });
          return;
      }

      setChatContext({
          id: String(item.id),
          name: item.owner,
          subject: item.name,
          participants: [user.uid, item.owner_id || ''],
          receiverId: item.owner_id
      });
      setIsChatVisible(true);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentMessage.trim() || !chatContext) return;

      setIsSending(true);

      // 1. Get the current logged-in user securely
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();

      if (authError || !currentUser) {
          addNotification({ type: 'rental', title: 'Authentication Error', message: 'Please log in again.', view: 'RENTAL' });
          setIsSending(false);
          return;
      }

      // 2. Identify Receiver
      const receiverId = chatContext.receiverId || chatContext.participants?.find(p => p !== currentUser.id);
      
      // 3. Log data to console for debugging as requested
      console.log("Sender:", currentUser.id);
      console.log("Receiver:", receiverId);
      console.log("Item:", chatContext.id);

      // --- Strict Validation Checklist ---
      if (!chatContext.id) {
          console.error("Missing Item ID (Chat Context ID)");
          setIsSending(false);
          return;
      }
      if (!receiverId) {
          console.error("Missing Receiver ID. Participants:", chatContext.participants);
          setIsSending(false);
          return;
      }

      try {
          const { error } = await supabase.from('chats').insert([{
              sender_id: currentUser.id,
              receiver_id: receiverId,
              item_id: String(chatContext.id), // Ensure string format
              message_text: currentMessage.trim()
          }]);
          
          if (error) throw error;
          
          setCurrentMessage('');
      } catch (err: any) {
          console.error("Chat Error:", err.message);
          addNotification({ type: 'rental', title: 'Error', message: 'Failed to send message.', view: 'RENTAL' });
      } finally {
          setIsSending(false);
      }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          if (file.size > 4 * 1024 * 1024) {
              addNotification({ type: 'rental', title: 'Error', message: 'Image size must be less than 4MB.', view: 'RENTAL' });
              return;
          }
          setItemImageFile(file);
          const preview = await fileToDataUri(file);
          setItemImagePreview(preview);
      }
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
          let imageUrl = '';
          if (itemImageFile) {
              const uploaded = await uploadUserFile(user.uid, itemImageFile, 'rental', '', `Equipment: ${currentItem.name}`);
              imageUrl = uploaded.file_url;
          }

          const newItem = {
              name: currentItem.name,
              type: currentItem.type,
              location: currentItem.location,
              location_lat: currentItem.location_lat,
              location_lng: currentItem.location_lng,
              price_per_day: currentItem.price_per_day,
              description: currentItem.description,
              image_url: imageUrl,
              owner: user.name,
              owner_id: user.uid,
              available: true,
              created_at: new Date().toISOString()
          };

          const { error } = await supabase.from('equipment').insert([newItem]);
          if (error) throw error;

          setIsFormVisible(false);
          resetForm();
          addNotification({ type: 'rental', title: 'Equipment Added', message: `${newItem.name} is now listed.`, view: 'RENTAL' });
      } catch (error: any) {
          console.error("Error adding equipment:", error);
          addNotification({ type: 'rental', title: 'Error', message: 'Failed to list equipment.', view: 'RENTAL' });
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.uid || !currentItem.id) return;

        setIsSubmitting(true);
        try {
            let imageUrl = currentItem.image_url;
            if (itemImageFile) {
                const uploaded = await uploadUserFile(user.uid, itemImageFile, 'rental', '', `Equipment: ${currentItem.name}`);
                imageUrl = uploaded.file_url;
            }

            const updates = {
                name: currentItem.name,
                type: currentItem.type,
                location: currentItem.location,
                location_lat: currentItem.location_lat,
                location_lng: currentItem.location_lng,
                price_per_day: currentItem.price_per_day,
                description: currentItem.description,
                image_url: imageUrl,
            };

            const { error } = await supabase.from('equipment').update(updates).eq('id', currentItem.id);
            if (error) throw error;

            setIsFormVisible(false);
            resetForm();
            addNotification({ type: 'rental', title: 'Updated', message: 'Equipment details updated.', view: 'RENTAL' });
        } catch (error) {
            console.error("Error updating:", error);
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
          console.error("Error deleting:", error);
          addNotification({ type: 'rental', title: 'Error', message: 'Failed to delete item.', view: 'RENTAL' });
      }
  };

  const openEditModal = (item: EquipmentItem) => {
      setCurrentItem(item);
      setItemImagePreview(item.image_url || null);
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
      setItemImageFile(null);
      setItemImagePreview(null);
      setIsEditMode(false);
  };

  const canManage = (item: EquipmentItem) => {
      return user && (user.uid === item.owner_id || user.type === 'admin');
  };

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-100 rounded-full text-indigo-700">
                    <TractorIcon className="w-8 h-8" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Equipment Rental</h2>
                    <p className="text-gray-600">Rent tractors, harvesters, and tools.</p>
                </div>
            </div>
            <Button onClick={() => { resetForm(); setIsFormVisible(true); }}>
                <PlusIcon className="w-5 h-5 mr-2" /> List Equipment
            </Button>
        </div>

        {/* Filters */}
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

        {/* List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
                <div className="col-span-full flex justify-center py-12"><Spinner className="w-8 h-8 text-indigo-600" /></div>
            ) : filteredItems.length === 0 ? (
                <div className="col-span-full text-center py-12 bg-gray-50 rounded border border-dashed text-gray-500">
                    No equipment found matching your search.
                </div>
            ) : (
                filteredItems.map(item => (
                    <Card key={item.id} className="flex flex-col h-full overflow-hidden hover:shadow-lg transition-shadow">
                        <div className="relative h-48 -mx-6 -mt-6 mb-4 bg-gray-200">
                             <img src={item.image_url || 'https://placehold.co/600x400?text=Equipment'} alt={item.name} className="w-full h-full object-cover" />
                             {canManage(item) && (
                                 <div className="absolute top-2 right-2 flex gap-1">
                                     <button onClick={() => openEditModal(item)} className="p-1.5 bg-white rounded-full text-gray-600 hover:text-blue-600"><PencilIcon className="w-4 h-4" /></button>
                                     <button onClick={() => { setItemToDelete(item); setIsDeleteModalVisible(true); }} className="p-1.5 bg-white rounded-full text-gray-600 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                                 </div>
                             )}
                        </div>
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="font-bold text-lg text-gray-900">{item.name}</h3>
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                    <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">{item.type}</span>
                                    <span>• {item.location}</span>
                                </p>
                            </div>
                            <p className="font-bold text-indigo-700">GHS {item.price_per_day}<span className="text-xs text-gray-500 font-normal">/day</span></p>
                        </div>
                        {item.description && <p className="text-sm text-gray-600 mb-4 line-clamp-2">{item.description}</p>}
                        
                        <div className="mt-auto pt-2 flex gap-2">
                            {canManage(item) ? (
                                <div className="text-xs text-gray-400 italic w-full text-center py-2 bg-gray-50 rounded">Your Listing</div>
                            ) : (
                                <>
                                    <Button onClick={() => handleOpenInquiry(item)} className="flex-1 text-xs py-2 bg-indigo-600 hover:bg-indigo-700">
                                        <MailIcon className="w-4 h-4 mr-1 inline" /> Inquiry
                                    </Button>
                                    <Button onClick={() => handleOpenChat(item)} className="flex-1 text-xs py-2 bg-white !text-indigo-700 border border-indigo-200 hover:bg-indigo-50">
                                        <MessageSquareIcon className="w-4 h-4 mr-1 inline" /> Chat
                                    </Button>
                                </>
                            )}
                        </div>
                    </Card>
                ))
            )}
        </div>

        {/* Add/Edit Modal */}
        {isFormVisible && (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-gray-800">{isEditMode ? 'Edit Equipment' : 'List Equipment'}</h3>
                        <button onClick={() => setIsFormVisible(false)} className="text-gray-500 hover:text-gray-800"><XIcon className="w-6 h-6" /></button>
                    </div>
                    <form onSubmit={isEditMode ? handleUpdateItem : handleAddItem} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Equipment Name</label>
                            <input 
                                required 
                                type="text" 
                                value={currentItem.name} 
                                onChange={e => setCurrentItem({...currentItem, name: e.target.value})} 
                                className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none" 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Type</label>
                                <select 
                                    value={currentItem.type} 
                                    onChange={e => setCurrentItem({...currentItem, type: e.target.value as EquipmentType})} 
                                    className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    {Object.values(EquipmentType).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Price per Day (GHS)</label>
                                <input 
                                    required 
                                    type="number" 
                                    value={currentItem.price_per_day} 
                                    onChange={e => setCurrentItem({...currentItem, price_per_day: parseFloat(e.target.value)})} 
                                    className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Location Name</label>
                            <input 
                                required 
                                type="text" 
                                value={currentItem.location} 
                                onChange={e => setCurrentItem({...currentItem, location: e.target.value})} 
                                className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                placeholder="e.g. Kumasi Central" 
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 bg-gray-50 p-3 rounded border border-gray-200">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-gray-700 mb-2">GPS Coordinates (Optional)</label>
                                 <button 
                                    type="button" 
                                    onClick={handleUseMyLocation}
                                    className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded border border-blue-200 hover:bg-blue-200 flex items-center mb-2 font-medium"
                                >
                                    <GridIcon className="w-3 h-3 mr-1" /> Auto-Detect Location
                                </button>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600">Latitude</label>
                                <input 
                                    type="number" 
                                    step="any"
                                    value={currentItem.location_lat ?? ''} 
                                    onChange={e => setCurrentItem({...currentItem, location_lat: e.target.value ? parseFloat(e.target.value) : undefined})} 
                                    className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                                    placeholder="0.000000"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600">Longitude</label>
                                <input 
                                    type="number" 
                                    step="any"
                                    value={currentItem.location_lng ?? ''} 
                                    onChange={e => setCurrentItem({...currentItem, location_lng: e.target.value ? parseFloat(e.target.value) : undefined})} 
                                    className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                                    placeholder="0.000000"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Description</label>
                            <textarea 
                                value={currentItem.description} 
                                onChange={e => setCurrentItem({...currentItem, description: e.target.value})} 
                                className="w-full border border-gray-300 p-2 rounded !bg-white !text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                rows={3}
                            ></textarea>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Image</label>
                            <div className="flex items-center gap-4 mt-1">
                                <div className="w-20 h-20 bg-gray-100 rounded border flex items-center justify-center overflow-hidden">
                                    {itemImagePreview ? <img src={itemImagePreview} className="w-full h-full object-cover" alt="Preview" /> : <TractorIcon className="w-8 h-8 text-gray-300" />}
                                </div>
                                <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
                                <Button type="button" onClick={() => fileInputRef.current?.click()} className="bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300">
                                    <UploadIcon className="w-4 h-4 mr-2" /> Upload
                                </Button>
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

        {/* Delete Modal */}
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

        {/* Inquiry Modal */}
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
                                    <p className={`text-xs mt-1 ${msg.sender === 'user' ? 'text-indigo-200' : 'text-gray-500'} text-right`}>{msg.timestamp}</p>
                                </div>
                            </div>
                        )) : (
                            <p className="text-center text-gray-500 mt-10">Start a conversation!</p>
                        )}
                        <div ref={chatEndRef} />
                    </div>
                    <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2">
                        <input 
                            type="text"
                            value={currentMessage}
                            onChange={(e) => setCurrentMessage(e.target.value)}
                            placeholder="Type your message..."
                            className="flex-grow border border-gray-300 p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 !bg-white !text-gray-900"
                        />
                        <Button type="submit" isLoading={isSending}>Send</Button>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};

export default EquipmentRental;
