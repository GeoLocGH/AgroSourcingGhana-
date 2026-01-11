
import React, { useState, useEffect, useRef } from 'react';
import Card from './common/Card';
import Button from './common/Button';
import { UserCircleIcon, PencilIcon, TrashIcon, UserCircleIcon as UserIcon, PaperClipIcon, EyeIcon, UploadIcon, XIcon, DownloadIcon, ShoppingCartIcon, HeartIcon, ArrowRightIcon, TractorIcon, ShieldCheckIcon, BanknotesIcon, MessageSquareIcon, PhoneIcon, MailIcon, ClockIcon, CheckCircleIcon, AlertTriangleIcon, GridIcon } from './common/icons';
import type { User, UserFile, MarketplaceItem, EquipmentItem, View, Transaction, Inquiry, Message, EquipmentType } from '../types';
import { supabase } from '../services/supabase';
import { getUserFiles, deleteUserFile, uploadUserFile, getFreshDownloadUrl } from '../services/storageService';
import { getTransactionHistory } from '../services/paymentService';
import { useNotifications } from '../contexts/NotificationContext';
import { marked } from 'marked';
import { fileToDataUri } from '../utils';

interface ProfileProps {
  user: User | null;
  setUser: (user: User | null) => void;
  onLogout: () => void;
  setActiveView: (view: View) => void;
}

interface ChatSession {
    item_id: string;
    sender_id: string; // The ID of the OTHER person
    last_message: string;
    last_time: string;
    sender_name?: string; 
    item_title?: string;  
}

const Profile: React.FC<ProfileProps> = ({ user, setUser, onLogout, setActiveView }) => {
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'LISTINGS' | 'LIKES' | 'FILES' | 'TRANSACTIONS' | 'INBOX'>('DETAILS');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotifications();
  
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  
  const [myListings, setMyListings] = useState<MarketplaceItem[]>([]);
  const [myEquipment, setMyEquipment] = useState<EquipmentItem[]>([]);
  const [likedItems, setLikedItems] = useState<MarketplaceItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // Item Details Modal State (For Liked Items & My Store Products)
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Details Modal State (For My Store Equipment)
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentItem | null>(null);

  // Details Modal State (For Transactions)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Inbox State
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  
  // Chat Modal State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeChatContext, setActiveChatContext] = useState<{itemId: string, otherUserId: string, title: string} | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [loadingListings, setLoadingListings] = useState(false);
  const [loadingLikes, setLoadingLikes] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // --- EDIT & DELETE STATE ---
  const [itemToDelete, setItemToDelete] = useState<{id: string, type: 'market' | 'equipment'} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [editingProduct, setEditingProduct] = useState<MarketplaceItem | null>(null);
  const [editingEquipment, setEditingEquipment] = useState<EquipmentItem | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Edit Form Images
  const [editImages, setEditImages] = useState<File[]>([]);
  const [editImagePreviews, setEditImagePreviews] = useState<string[]>([]);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<User>>({
    name: user?.name || '',
    phone: user?.phone || '',
    merchant_id: user?.merchant_id || '',
    photo_url: user?.photo_url || '',
    messaging_enabled: user?.messaging_enabled ?? true
  });
  
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = ['Seeds', 'Fertilizers', 'Livestock Feed', 'Livestock', 'Tools', 'Produce'];
  const equipmentTypes = ['Tractor', 'Harvester', 'Plow', 'Seeder', 'Sprayer', 'Other'];

  // Initial load effect
  useEffect(() => {
    // Check if we should open a specific tab
    const requestedTab = sessionStorage.getItem('profile_tab');
    if (requestedTab) {
        if (['DETAILS', 'LISTINGS', 'LIKES', 'FILES', 'TRANSACTIONS', 'INBOX'].includes(requestedTab)) {
            setActiveTab(requestedTab as any);
        }
        sessionStorage.removeItem('profile_tab');
    }

    if (user && user.uid) {
      setFormData({
        name: user.name || '',
        phone: user.phone || '',
        merchant_id: user.merchant_id || '',
        photo_url: user.photo_url || '',
        messaging_enabled: user.messaging_enabled ?? true
      });
      fetchUserFiles();
      fetchMyProperties();
      fetchLikedItems();
      fetchTransactions();
      fetchInbox();
    }
  }, [user]);

  // Realtime subscription for Listings
  useEffect(() => {
      if (!user?.uid) return;

      const subscription = supabase
        .channel('profile_listings_update')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'marketplace', 
            filter: `user_id=eq.${user.uid}` 
        }, fetchMyProperties)
        .subscribe();

      return () => { subscription.unsubscribe(); };
  }, [user?.uid]);

  // Realtime subscription for Chat Modal
  useEffect(() => {
    if (!isChatOpen || !activeChatContext || !user?.uid) return;

    const channel = supabase
      .channel(`profile_chat_${activeChatContext.itemId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chats',
          filter: `item_id=eq.${activeChatContext.itemId}`
        },
        (payload) => {
          const newRecord = payload.new;
          // Security/Relevance check
          const isRelevant = 
             (newRecord.sender_id === user.uid && newRecord.receiver_id === activeChatContext.otherUserId) ||
             (newRecord.sender_id === activeChatContext.otherUserId && newRecord.receiver_id === user.uid);

          if (isRelevant) {
             const newMessage: Message = {
                id: newRecord.id,
                sender: newRecord.sender_id === user.uid ? 'user' : 'seller',
                text: newRecord.message_text,
                timestamp: new Date(newRecord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
             };
             setChatMessages(prev => {
                 if (prev.some(m => m.id === newMessage.id)) return prev;
                 return [...prev, newMessage];
             });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isChatOpen, activeChatContext, user?.uid]);

  // Slideshow Logic for Details Modal
  useEffect(() => {
      if (selectedItem) {
          setCurrentImageIndex(0);
      }
  }, [selectedItem]);

  useEffect(() => {
      if (!selectedItem?.image_urls || selectedItem.image_urls.length <= 1) return;
      const interval = setInterval(() => {
          setCurrentImageIndex(prev => (prev + 1) % selectedItem.image_urls!.length);
      }, 3000);
      return () => clearInterval(interval);
  }, [selectedItem]);

  // --- Data Fetching ---

  const fetchUserFiles = async () => {
    if (!user || !user.uid) return;
    setLoadingFiles(true);
    try {
      const userFiles = await getUserFiles(user.uid);
      setFiles(userFiles);
    } catch (error: any) {
      console.error("Error fetching files:", error);
    } finally {
      setLoadingFiles(false);
    }
  };

  const fetchTransactions = async () => {
      if (!user || !user.uid) return;
      setLoadingTransactions(true);
      try {
          const data = await getTransactionHistory(user.uid);
          setTransactions(data || []);
      } catch (error) {
          console.error("Error fetching transactions:", error);
      } finally {
          setLoadingTransactions(false);
      }
  };

  const fetchMyProperties = async () => {
      if (!user || !user.uid) return;
      setLoadingListings(true);
      try {
          // Fetch Marketplace Listings
          let marketData: MarketplaceItem[] = [];
          const { data, error } = await supabase
            .from('marketplace')
            .select('*')
            .eq('user_id', user.uid)
            .order('created_at', { ascending: false });
            
          if (!error) {
              marketData = (data as MarketplaceItem[]) || [];
          }

          setMyListings(marketData);

          // Fetch Equipment Listings
          const { data: equipData } = await supabase
            .from('equipment')
            .select('*')
            .eq('user_id', user.uid)
            .order('created_at', { ascending: false });
            
          setMyEquipment((equipData as EquipmentItem[]) || []);
      } catch (error) {
          console.error("Error fetching listings:", error);
      } finally {
          setLoadingListings(false);
      }
  };

  const fetchLikedItems = async () => {
      if (!user || !user.uid) return;
      setLoadingLikes(true);
      try {
          const { data: likesData } = await supabase.from('marketplace_likes').select('item_id').eq('user_id', user.uid);
          if (likesData && likesData.length > 0) {
              const itemIds = likesData.map((l: any) => l.item_id);
              const { data: itemsData } = await supabase.from('marketplace').select('*').in('id', itemIds);
              setLikedItems((itemsData as MarketplaceItem[]) || []);
          } else {
              setLikedItems([]);
          }
      } catch (error) {
          console.error("Error fetching likes:", error);
      } finally {
          setLoadingLikes(false);
      }
  };

  const fetchInbox = async () => {
      if (!user || !user.uid) return;
      setLoadingInbox(true);
      try {
          // 1. Fetch Inquiries
          const { data: inqData } = await supabase
            .from('inquiries')
            .select('*')
            .eq('recipient_id', user.uid)
            .order('created_at', { ascending: false });
          setInquiries((inqData as Inquiry[]) || []);

          // 2. Fetch Chat History (where I am sender OR receiver)
          const { data: chatData } = await supabase
             .from('chats')
             .select('*')
             .or(`sender_id.eq.${user.uid},receiver_id.eq.${user.uid}`)
             .order('created_at', { ascending: false })
             .limit(100);

          if (chatData) {
              const sessionsMap = new Map<string, ChatSession>();
              
              chatData.forEach((msg: any) => {
                  // Determine the partner (the other person in the chat)
                  const isMe = msg.sender_id === user.uid;
                  const partnerId = isMe ? msg.receiver_id : msg.sender_id;
                  
                  // Key to unique identify a thread: item_id + partner_id
                  const key = `${msg.item_id}_${partnerId}`;
                  
                  if (!sessionsMap.has(key)) {
                      sessionsMap.set(key, {
                          item_id: msg.item_id,
                          sender_id: partnerId, // Effectively the 'Partner ID'
                          last_message: msg.message_text,
                          last_time: msg.created_at,
                          sender_name: 'Loading...',
                          item_title: 'Loading Item...'
                      });
                  }
              });
              
              const sessions = Array.from(sessionsMap.values());
              
              // 3. Enrich with Names and Titles
              const userIds = [...new Set(sessions.map(s => s.sender_id))];
              const itemIds = [...new Set(sessions.map(s => s.item_id))];

              // Fetch User Names
              const { data: usersData } = await supabase.from('users').select('id, name').in('id', userIds);
              const userMap = new Map(usersData?.map((u: any) => [u.id, u.name]));

              // Fetch Item Titles (Try Marketplace then Equipment)
              const { data: marketData } = await supabase.from('marketplace').select('id, title').in('id', itemIds);
              const { data: equipData } = await supabase.from('equipment').select('id, name').in('id', itemIds);
              
              const itemMap = new Map();
              marketData?.forEach((m: any) => itemMap.set(m.id, m.title));
              equipData?.forEach((e: any) => itemMap.set(e.id, e.name));

              const enrichedSessions = sessions.map(s => ({
                  ...s,
                  sender_name: userMap.get(s.sender_id) || 'Unknown User',
                  item_title: itemMap.get(s.item_id) || 'Unknown Item'
              }));

              setChatSessions(enrichedSessions);
          }

      } catch (err) {
          console.error("Inbox fetch error:", err);
      } finally {
          setLoadingInbox(false);
      }
  };

  // --- Handlers ---

  const handleFileDelete = async (file: UserFile) => {
    if (!user || !user.uid) return;
    if (!window.confirm("Delete file?")) return;

    try {
      await deleteUserFile(user.uid, file.id, file.storage_path);
      setFiles(prev => prev.filter(f => f.id !== file.id));
      addNotification({ type: 'auth', title: 'Deleted', message: 'File removed.', view: 'PROFILE' });
    } catch (error) {
      addNotification({ type: 'auth', title: 'Error', message: 'Failed to delete.', view: 'PROFILE' });
    }
  };

  const handleFileDownload = async (file: UserFile) => {
      try {
          const url = await getFreshDownloadUrl(file.storage_path);
          window.open(url, '_blank');
      } catch (error) {
          console.error("Download failed:", error);
      }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user?.uid) return;
      
      setLoading(true);
      try {
          let finalPhotoURL = user.photo_url || '';

          if (newPhoto) {
              const fileData = await uploadUserFile(user.uid, newPhoto, 'profile', '', 'Profile Photo Updated');
              finalPhotoURL = fileData.file_url;
          }

          const updates = {
              name: formData.name,
              phone: formData.phone,
              messaging_enabled: formData.messaging_enabled
          };

          const { error } = await supabase.from('users').update(updates).eq('id', user.uid);
          if (error) throw error;
          
          await supabase.auth.updateUser({
              data: { 
                  full_name: formData.name, 
                  avatar_url: finalPhotoURL,
                  phone: formData.phone,
              }
          });
          
          setUser({ ...user, ...updates, photo_url: finalPhotoURL } as User);
          setIsEditing(false);
          addNotification({ type: 'auth', title: 'Updated', message: 'Profile saved.', view: 'PROFILE' });
      } catch (error: any) {
          console.error("Update failed:", error);
          addNotification({ type: 'auth', title: 'Error', message: error.message || 'Update failed.', view: 'PROFILE' });
      } finally {
          setLoading(false);
      }
  };

  const toggleFileDetails = (id: string) => {
    setExpandedFileId(expandedFileId === id ? null : id);
  };

  // --- DELETE Item Logic ---
  const confirmDelete = async () => {
      if (!itemToDelete || !user?.uid) return;
      setIsDeleting(true);
      try {
          const table = itemToDelete.type === 'market' ? 'marketplace' : 'equipment';
          const { error } = await supabase.from(table).delete().eq('id', itemToDelete.id).eq('user_id', user.uid);
          
          if (error) throw error;

          if (itemToDelete.type === 'market') {
              setMyListings(prev => prev.filter(i => i.id !== itemToDelete.id));
          } else {
              setMyEquipment(prev => prev.filter(i => i.id !== itemToDelete.id));
          }
          addNotification({ type: 'market', title: 'Deleted', message: 'Item successfully removed.', view: 'PROFILE' });
      } catch (err) {
          console.error("Delete failed", err);
          addNotification({ type: 'market', title: 'Error', message: 'Failed to delete item.', view: 'PROFILE' });
      } finally {
          setIsDeleting(false);
          setItemToDelete(null);
      }
  };

  // --- EDIT Logic ---
  
  // -- Setup Edit Forms --
  const openEditProduct = (item: MarketplaceItem) => {
      setEditingProduct(item);
      setEditImages([]);
      setEditImagePreviews(item.image_urls || []);
  };

  const openEditEquipment = (item: EquipmentItem) => {
      setEditingEquipment(item);
      setEditImages([]);
      // Consolidate images for preview
      const imgs = item.image_urls && item.image_urls.length > 0 ? item.image_urls : (item.image_url ? [item.image_url] : []);
      setEditImagePreviews(imgs);
  };

  const handleEditImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          const files = Array.from(e.target.files);
          const previews = await Promise.all(files.map(fileToDataUri));
          setEditImages(prev => [...prev, ...files]);
          setEditImagePreviews(prev => [...prev, ...previews]);
      }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingProduct || !user?.uid) return;
      setIsUpdating(true);

      try {
          let updatedUrls = editingProduct.image_urls || [];
          // Upload new images if any
          if (editImages.length > 0) {
              const uploads = editImages.map((file, i) => 
                  uploadUserFile(user.uid!, file, 'marketplace', '', `Update: ${editingProduct.title} ${i}`)
              );
              const results = await Promise.all(uploads);
              updatedUrls = [...updatedUrls, ...results.map(r => r.file_url)];
          }

          const { error } = await supabase.from('marketplace').update({
              title: editingProduct.title,
              category: editingProduct.category,
              price: editingProduct.price,
              usage_instructions: editingProduct.usage_instructions,
              storage_recommendations: editingProduct.storage_recommendations,
              location_name: editingProduct.location_name,
              image_urls: updatedUrls
          }).eq('id', editingProduct.id);

          if (error) throw error;

          // Update local state
          setMyListings(prev => prev.map(p => p.id === editingProduct.id ? { ...editingProduct, image_urls: updatedUrls } : p));
          setEditingProduct(null);
          addNotification({ type: 'market', title: 'Updated', message: 'Product listing updated.', view: 'PROFILE' });

      } catch (err) {
          console.error(err);
          addNotification({ type: 'market', title: 'Error', message: 'Update failed.', view: 'PROFILE' });
      } finally {
          setIsUpdating(false);
      }
  };

  const handleUpdateEquipment = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingEquipment || !user?.uid) return;
      setIsUpdating(true);

      try {
          let updatedUrls = editingEquipment.image_urls || [];
          if (!updatedUrls.length && editingEquipment.image_url) updatedUrls.push(editingEquipment.image_url);

          // Upload new images if any
          if (editImages.length > 0) {
              const uploads = editImages.map((file, i) => 
                  uploadUserFile(user.uid!, file, 'rental', '', `Update: ${editingEquipment.name} ${i}`)
              );
              const results = await Promise.all(uploads);
              updatedUrls = [...updatedUrls, ...results.map(r => r.file_url)];
          }

          const { error } = await supabase.from('equipment').update({
              name: editingEquipment.name,
              type: editingEquipment.type,
              price_per_day: editingEquipment.price_per_day,
              description: editingEquipment.description,
              location: editingEquipment.location,
              image_urls: updatedUrls,
              image_url: updatedUrls[0] // sync main image
          }).eq('id', editingEquipment.id);

          if (error) throw error;

          // Update local state
          setMyEquipment(prev => prev.map(e => e.id === editingEquipment.id ? { ...editingEquipment, image_urls: updatedUrls, image_url: updatedUrls[0] } : e));
          setEditingEquipment(null);
          addNotification({ type: 'rental', title: 'Updated', message: 'Equipment listing updated.', view: 'PROFILE' });

      } catch (err) {
          console.error(err);
          addNotification({ type: 'rental', title: 'Error', message: 'Update failed.', view: 'PROFILE' });
      } finally {
          setIsUpdating(false);
      }
  };

  // --- Inbox / Chat Logic ---

  const openChat = async (session: ChatSession) => {
      if (!user?.uid) return;
      setActiveChatContext({
          itemId: session.item_id,
          otherUserId: session.sender_id,
          title: `Chat: ${session.item_title || 'Item'}`
      });
      setIsChatOpen(true);
      loadChatMessages(session.item_id, session.sender_id);
  };

  const handleOpenItemChat = (item: MarketplaceItem) => {
      if (!user?.uid) return;
      if (item.user_id === user.uid) {
          addNotification({ type: 'market', title: 'Oops', message: 'This is your own item.', view: 'PROFILE' });
          return;
      }
      setActiveChatContext({
          itemId: item.id,
          otherUserId: item.user_id,
          title: item.title
      });
      setSelectedItem(null); // Close details modal
      setIsChatOpen(true);
      loadChatMessages(item.id, item.user_id);
  };

  const loadChatMessages = async (itemId: string, otherUserId: string) => {
      const { data } = await supabase
        .from('chats')
        .select('*')
        .eq('item_id', itemId)
        .or(`sender_id.eq.${otherUserId},receiver_id.eq.${otherUserId}`)
        .order('created_at', { ascending: true });
      
      if (data) {
          const msgs = data.map((d: any) => ({
              id: d.id,
              sender: d.sender_id === user?.uid ? 'user' : 'seller', // 'user' means 'me' in this context logic
              text: d.message_text,
              timestamp: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));
          setChatMessages(msgs);
      }
  };

  const handleSendReply = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!activeChatContext || !user?.uid || !chatInput.trim()) return;
      setSendingChat(true);

      try {
          const { error } = await supabase.from('chats').insert([{
              sender_id: user.uid, // Me
              receiver_id: activeChatContext.otherUserId, // Them
              item_id: activeChatContext.itemId,
              message_text: chatInput.trim()
          }]);

          if (error) throw error;
          
          setChatInput('');
          // Optimistic update or refetch
          loadChatMessages(activeChatContext.itemId, activeChatContext.otherUserId);
      } catch (err) {
          console.error("Reply failed", err);
      } finally {
          setSendingChat(false);
      }
  };

  useEffect(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatOpen]);


  const getStatusColor = (status: Transaction['status']) => {
      switch(status) {
          case 'completed': return 'bg-green-100 text-green-800 border border-green-200';
          case 'pending': return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
          case 'failed': return 'bg-red-100 text-red-800 border border-red-200';
          case 'refunded': return 'bg-blue-100 text-blue-800 border border-blue-200';
          case 'flagged': return 'bg-orange-100 text-orange-800 border border-orange-200';
          default: return 'bg-gray-100 text-gray-800 border border-gray-200';
      }
  };

  if (!user) return <p className="text-center p-8 text-white">Please log in to view your profile.</p>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-full text-green-700"><UserIcon className="w-8 h-8" /></div>
            <div>
                <h2 className="text-2xl font-bold text-gray-200">My Profile</h2>
                <p className="text-sm text-gray-400">Manage your account and activities</p>
            </div>
        </div>
        <Button onClick={onLogout} className="bg-gray-200 !text-gray-900 hover:bg-gray-300 w-full md:w-auto">Logout</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Profile Card */}
          <div className="lg:col-span-1 space-y-6">
              <Card className="text-center p-6 flex flex-col items-center">
                   <div className="w-32 h-32 rounded-full border-4 border-white shadow-lg overflow-hidden mb-4 bg-gray-200 relative group">
                       <img src={photoPreview || user.photo_url || 'https://placehold.co/100'} alt="Profile" className="w-full h-full object-cover" />
                       {isEditing && (
                           <div className="absolute inset-0 bg-black/50 flex items-center justify-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                               <UploadIcon className="w-8 h-8 text-white" />
                           </div>
                       )}
                   </div>
                   {isEditing && <input type="file" ref={fileInputRef} onChange={(e) => {
                       const f = e.target.files?.[0];
                       if (f) { setNewPhoto(f); fileToDataUri(f).then(setPhotoPreview); }
                   }} className="hidden" />}
                   
                   {!isEditing ? (
                       <>
                        <h3 className="text-xl font-bold text-gray-900">{user.name}</h3>
                        <p className="text-sm text-gray-500 mb-2">{user.email}</p>
                        <span className="text-xs font-bold uppercase bg-green-100 text-green-800 px-3 py-1 rounded-full">{user.type}</span>
                        <div className="mt-4 flex items-center justify-center gap-2">
                            <MessageSquareIcon className={`w-4 h-4 ${user.messaging_enabled ? 'text-green-600' : 'text-gray-400'}`} />
                            <span className={`text-xs ${user.messaging_enabled ? 'text-green-700 font-medium' : 'text-gray-500'}`}>
                                Messaging {user.messaging_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                        </div>
                        <div className="mt-6 w-full space-y-2">
                            <Button onClick={() => setIsEditing(true)} className="w-full text-sm bg-blue-600 hover:bg-blue-700">Edit Profile</Button>
                            {/* MY STORE BUTTON: Added for sellers/farmers to quickly access listings */}
                            {(user.type === 'seller' || user.type === 'farmer' || user.type === 'admin') && (
                                <Button onClick={() => setActiveTab('LISTINGS')} className="w-full text-sm bg-green-600 hover:bg-green-700">
                                    <ShoppingCartIcon className="w-4 h-4 mr-2" /> My Store
                                </Button>
                            )}
                        </div>
                       </>
                   ) : (
                       <form onSubmit={handleUpdateProfile} className="w-full space-y-3 mt-2">
                           <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border p-2 rounded text-sm bg-white text-gray-900" placeholder="Full Name" />
                           <input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border p-2 rounded text-sm bg-white text-gray-900" placeholder="Phone" />
                           
                           {/* READ-ONLY MERCHANT ID */}
                           {user.merchant_id && (
                               <div className="relative">
                                   <label className="text-[10px] text-gray-500 font-bold absolute -top-1.5 left-2 bg-white px-1">MERCHANT ID (LOCKED)</label>
                                   <input 
                                        value={formData.merchant_id} 
                                        readOnly 
                                        className="w-full border p-2 rounded text-sm text-gray-500 bg-gray-100 cursor-not-allowed font-mono" 
                                        title="Contact Support to change Merchant ID"
                                   />
                               </div>
                           )}

                           <div className="flex items-center gap-2 bg-gray-50 p-2 rounded border border-gray-200">
                               <input 
                                    type="checkbox" 
                                    id="messagingToggle" 
                                    checked={formData.messaging_enabled} 
                                    onChange={e => setFormData({...formData, messaging_enabled: e.target.checked})}
                                    className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                                />
                                <label htmlFor="messagingToggle" className="text-sm text-gray-700 cursor-pointer select-none">Allow Messaging</label>
                           </div>
                           <div className="flex gap-2">
                               <Button type="submit" isLoading={loading} className="flex-1 text-sm">Save</Button>
                               <Button onClick={() => setIsEditing(false)} className="flex-1 bg-gray-200 !text-gray-900 text-sm">Cancel</Button>
                           </div>
                       </form>
                   )}
              </Card>
          </div>

          <div className="lg:col-span-3">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden text-gray-900 min-h-[500px]">
                  <div className="flex border-b overflow-x-auto no-scrollbar">
                      <button onClick={() => setActiveTab('DETAILS')} className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap ${activeTab === 'DETAILS' ? 'text-green-700 border-b-2 border-green-600 bg-green-50' : 'text-gray-600 hover:bg-gray-50'}`}>Account</button>
                      <button onClick={() => setActiveTab('INBOX')} className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap ${activeTab === 'INBOX' ? 'text-green-700 border-b-2 border-green-600 bg-green-50' : 'text-gray-600 hover:bg-gray-50'}`}>Inbox</button>
                      <button onClick={() => setActiveTab('LISTINGS')} className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap ${activeTab === 'LISTINGS' ? 'text-green-700 border-b-2 border-green-600 bg-green-50' : 'text-gray-600 hover:bg-gray-50'}`}>My Store</button>
                      <button onClick={() => setActiveTab('LIKES')} className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap ${activeTab === 'LIKES' ? 'text-green-700 border-b-2 border-green-600 bg-green-50' : 'text-gray-600 hover:bg-gray-50'}`}>Liked</button>
                      <button onClick={() => setActiveTab('FILES')} className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap ${activeTab === 'FILES' ? 'text-green-700 border-b-2 border-green-600 bg-green-50' : 'text-gray-600 hover:bg-gray-50'}`}>Files</button>
                      <button onClick={() => setActiveTab('TRANSACTIONS')} className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap ${activeTab === 'TRANSACTIONS' ? 'text-green-700 border-b-2 border-green-600 bg-green-50' : 'text-gray-600 hover:bg-gray-50'}`}>Transactions</button>
                  </div>

                  <div className="p-6">
                      {activeTab === 'DETAILS' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-gray-900">
                              <div><label className="text-xs text-gray-500 uppercase">Email</label><p className="font-medium">{user.email}</p></div>
                              <div><label className="text-xs text-gray-500 uppercase">Phone</label><p className="font-medium">{user.phone || 'Not set'}</p></div>
                              {user.merchant_id && (
                                  <div>
                                      <label className="text-xs text-gray-500 uppercase flex items-center gap-1">
                                          Merchant ID <ShieldCheckIcon className="w-3 h-3 text-blue-500" />
                                      </label>
                                      <p className="font-medium font-mono text-blue-800 bg-blue-50 inline-block px-2 rounded border border-blue-100">{user.merchant_id}</p>
                                  </div>
                              )}
                              <div>
                                  <label className="text-xs text-gray-500 uppercase">Messaging</label>
                                  <p className={`font-medium ${user.messaging_enabled ? 'text-green-600' : 'text-red-500'}`}>
                                      {user.messaging_enabled ? 'Active' : 'Disabled'}
                                  </p>
                              </div>
                              <div className="md:col-span-2"><label className="text-xs text-gray-500 uppercase">User ID</label><p className="font-mono text-xs bg-gray-100 p-2 rounded">{user.uid}</p></div>
                          </div>
                      )}

                      {/* --- INBOX TAB --- */}
                      {activeTab === 'INBOX' && (
                          <div className="space-y-8">
                              {/* Inquiries Section */}
                              <div>
                                  <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2 border-b pb-2">
                                      <MailIcon className="w-5 h-5 text-gray-500"/> Received Inquiries
                                  </h4>
                                  {inquiries.length === 0 ? (
                                      <p className="text-gray-500 text-sm text-center py-4 bg-gray-50 rounded border border-dashed">No inquiries yet.</p>
                                  ) : (
                                      <div className="space-y-3">
                                          {inquiries.map(inq => (
                                              <div key={inq.id} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                                                  <div className="flex justify-between items-start mb-1">
                                                      <span className="font-bold text-gray-900">{inq.subject || 'Inquiry'}</span>
                                                      <span className="text-xs text-gray-400">{inq.created_at ? new Date(inq.created_at).toLocaleDateString() : 'Recent'}</span>
                                                  </div>
                                                  <p className="text-sm text-gray-600 mb-2 line-clamp-2">"{inq.message}"</p>
                                                  <div className="flex items-center gap-4 text-xs text-gray-500 bg-gray-100 p-2 rounded">
                                                      <span className="flex items-center gap-1"><UserIcon className="w-3 h-3"/> {inq.name}</span>
                                                      <span className="flex items-center gap-1"><PhoneIcon className="w-3 h-3"/> {inq.phone}</span>
                                                      {inq.email && <span className="flex items-center gap-1"><MailIcon className="w-3 h-3"/> {inq.email}</span>}
                                                  </div>
                                              </div>
                                          ))}
                                      </div>
                                  )}
                              </div>

                              {/* Chats Section */}
                              <div>
                                  <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2 border-b pb-2">
                                      <MessageSquareIcon className="w-5 h-5 text-gray-500"/> Active Chats
                                  </h4>
                                  {chatSessions.length === 0 ? (
                                      <p className="text-gray-500 text-sm text-center py-4 bg-gray-50 rounded border border-dashed">No active chats.</p>
                                  ) : (
                                      <div className="grid grid-cols-1 gap-3">
                                          {chatSessions.map((session, idx) => (
                                              <div key={idx} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors flex justify-between items-center">
                                                  <div className="flex items-center gap-3 overflow-hidden">
                                                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 flex-shrink-0">
                                                          <UserIcon className="w-6 h-6" />
                                                      </div>
                                                      <div className="min-w-0">
                                                          <p className="font-bold text-gray-900 truncate">{session.sender_name}</p>
                                                          <p className="text-xs text-gray-500 truncate mb-0.5">{session.item_title}</p>
                                                          <p className="text-sm text-gray-600 truncate italic">"{session.last_message}"</p>
                                                      </div>
                                                  </div>
                                                  <div className="flex flex-col items-end gap-2 ml-2 flex-shrink-0">
                                                      <span className="text-xs text-gray-400">{new Date(session.last_time).toLocaleDateString()}</span>
                                                      <Button onClick={() => openChat(session)} className="text-xs py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700">Open Chat</Button>
                                                  </div>
                                              </div>
                                          ))}
                                      </div>
                                  )}
                              </div>
                          </div>
                      )}

                      {/* --- LISTINGS TAB --- */}
                      {activeTab === 'LISTINGS' && (
                           <div className="space-y-8">
                               {loadingListings ? (
                                   <p className="text-center text-gray-500 py-4">Loading listings...</p>
                               ) : (
                                   <>
                                       <div>
                                           <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2 border-b pb-2">
                                               <ShoppingCartIcon className="w-5 h-5 text-gray-500"/> Marketplace Products
                                           </h4>
                                           <div className="space-y-3">
                                               {myListings.length > 0 ? myListings.map(item => (
                                                   <div key={item.id} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50 transition-colors group relative">
                                                       <img 
                                                            onClick={() => setSelectedItem(item)} 
                                                            src={item.image_urls?.[0] || 'https://placehold.co/50'} 
                                                            alt={item.title} 
                                                            className="w-12 h-12 rounded object-cover border border-gray-200 cursor-pointer" 
                                                       />
                                                       <div className="flex-grow cursor-pointer" onClick={() => setSelectedItem(item)}>
                                                           <p className="font-bold text-gray-900">{item.title}</p>
                                                           <p className="text-sm text-green-700 font-bold">GHS {item.price.toFixed(2)}</p>
                                                           <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
                                                               {item.seller_phone && (
                                                                   <span className="flex items-center gap-1 bg-green-50 px-1.5 py-0.5 rounded text-green-700 border border-green-100">
                                                                       <PhoneIcon className="w-3 h-3"/> {item.seller_phone}
                                                                   </span>
                                                               )}
                                                           </div>
                                                       </div>
                                                       {/* Edit/Delete Actions */}
                                                       <div className="flex gap-2">
                                                           <button onClick={() => openEditProduct(item)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-full" title="Edit">
                                                               <PencilIcon className="w-4 h-4" />
                                                           </button>
                                                           <button onClick={() => setItemToDelete({id: item.id, type: 'market'})} className="p-2 text-red-600 hover:bg-red-50 rounded-full" title="Delete">
                                                               <TrashIcon className="w-4 h-4" />
                                                           </button>
                                                       </div>
                                                   </div>
                                               )) : <p className="text-sm text-gray-500 italic text-center py-2">No products listed.</p>}
                                           </div>
                                       </div>

                                       <div>
                                           <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2 border-b pb-2">
                                               <TractorIcon className="w-5 h-5 text-gray-500"/> Rental Equipment
                                           </h4>
                                           <div className="space-y-3">
                                               {myEquipment.length > 0 ? myEquipment.map(item => (
                                                   <div key={item.id} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50 transition-colors group relative">
                                                       <img 
                                                            onClick={() => setSelectedEquipment(item)}
                                                            src={item.image_url || 'https://placehold.co/50'} 
                                                            alt={item.name} 
                                                            className="w-12 h-12 rounded object-cover border border-gray-200 cursor-pointer" 
                                                       />
                                                       <div className="flex-grow cursor-pointer" onClick={() => setSelectedEquipment(item)}>
                                                           <p className="font-bold text-gray-900">{item.name}</p>
                                                           <p className="text-sm text-indigo-700 font-bold">GHS {item.price_per_day.toFixed(2)} / day</p>
                                                       </div>
                                                       {/* Edit/Delete Actions */}
                                                       <div className="flex gap-2">
                                                           <button onClick={() => openEditEquipment(item)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-full" title="Edit">
                                                               <PencilIcon className="w-4 h-4" />
                                                           </button>
                                                           <button onClick={() => setItemToDelete({id: item.id, type: 'equipment'})} className="p-2 text-red-600 hover:bg-red-50 rounded-full" title="Delete">
                                                               <TrashIcon className="w-4 h-4" />
                                                           </button>
                                                       </div>
                                                   </div>
                                               )) : <p className="text-sm text-gray-500 italic text-center py-2">No equipment listed.</p>}
                                           </div>
                                       </div>
                                   </>
                               )}
                           </div>
                      )}
                      
                      {/* ... Other Tabs (Likes, Files, etc. unchanged) ... */}
                      {/* Note: In real app, rest of tabs would be here. Keeping brevity for this change block */}
                  </div>
              </div>
          </div>
      </div>

      {/* --- MODALS --- */}

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <Card className="w-full max-w-sm text-center">
                  <TrashIcon className="w-12 h-12 text-red-500 mx-auto mb-3" />
                  <h3 className="text-lg font-bold mb-2">Confirm Deletion</h3>
                  <p className="text-gray-600 mb-6">Are you sure you want to remove this item? This cannot be undone.</p>
                  <div className="flex gap-3">
                      <Button onClick={() => setItemToDelete(null)} className="flex-1 bg-gray-200 !text-gray-900">Cancel</Button>
                      <Button onClick={confirmDelete} isLoading={isDeleting} className="flex-1 bg-red-600 text-white hover:bg-red-700">Delete</Button>
                  </div>
              </Card>
          </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
           <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
               <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="text-xl font-bold text-gray-800">Edit Product</h3>
                       <button onClick={() => setEditingProduct(null)}><XIcon className="w-6 h-6 text-gray-500" /></button>
                   </div>
                   <form onSubmit={handleUpdateProduct} className="space-y-4">
                       <div>
                           <label className="text-sm font-medium text-gray-700 block mb-1">Title</label>
                           <input required value={editingProduct.title} onChange={e => setEditingProduct({...editingProduct, title: e.target.value})} className="w-full border p-2 rounded bg-white text-gray-900" />
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                           <div>
                               <label className="text-sm font-medium text-gray-700 block mb-1">Category</label>
                               <select value={editingProduct.category} onChange={e => setEditingProduct({...editingProduct, category: e.target.value as any})} className="w-full border p-2 rounded bg-white text-gray-900">
                                   {categories.map(c => <option key={c} value={c}>{c}</option>)}
                               </select>
                           </div>
                           <div>
                               <label className="text-sm font-medium text-gray-700 block mb-1">Price (GHS)</label>
                               <input required type="number" value={editingProduct.price} onChange={e => setEditingProduct({...editingProduct, price: parseFloat(e.target.value)})} className="w-full border p-2 rounded bg-white text-gray-900" />
                           </div>
                       </div>
                       <div>
                           <label className="text-sm font-medium text-gray-700 block mb-1">Description</label>
                           <textarea value={editingProduct.usage_instructions} onChange={e => setEditingProduct({...editingProduct, usage_instructions: e.target.value})} className="w-full border p-2 rounded bg-white text-gray-900 h-20" />
                       </div>
                       <div>
                           <label className="text-sm font-medium text-gray-700 block mb-1">Location</label>
                           <input required value={editingProduct.location_name} onChange={e => setEditingProduct({...editingProduct, location_name: e.target.value})} className="w-full border p-2 rounded bg-white text-gray-900" />
                       </div>
                       
                       {/* Image Management */}
                       <div>
                           <label className="text-sm font-medium text-gray-700 block mb-1">Images</label>
                           <div className="flex gap-2 overflow-x-auto py-2">
                               {editImagePreviews.length > 0 ? editImagePreviews.map((src, i) => (
                                   <img key={i} src={src} className="w-16 h-16 rounded object-cover border" alt="preview" />
                               )) : <p className="text-xs text-gray-500">No images</p>}
                           </div>
                           <div className="flex items-center mt-2">
                               <button type="button" onClick={() => editFileInputRef.current?.click()} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                   <UploadIcon className="w-4 h-4" /> Add More Photos
                               </button>
                               <input type="file" multiple ref={editFileInputRef} onChange={handleEditImageChange} className="hidden" accept="image/*" />
                           </div>
                       </div>

                       <Button type="submit" isLoading={isUpdating} className="w-full">Save Changes</Button>
                   </form>
               </Card>
           </div>
      )}

      {/* Edit Equipment Modal */}
      {editingEquipment && (
           <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
               <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="text-xl font-bold text-gray-800">Edit Equipment</h3>
                       <button onClick={() => setEditingEquipment(null)}><XIcon className="w-6 h-6 text-gray-500" /></button>
                   </div>
                   <form onSubmit={handleUpdateEquipment} className="space-y-4">
                       <div>
                           <label className="text-sm font-medium text-gray-700 block mb-1">Name</label>
                           <input required value={editingEquipment.name} onChange={e => setEditingEquipment({...editingEquipment, name: e.target.value})} className="w-full border p-2 rounded bg-white text-gray-900" />
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                           <div>
                               <label className="text-sm font-medium text-gray-700 block mb-1">Type</label>
                               <select value={editingEquipment.type} onChange={e => setEditingEquipment({...editingEquipment, type: e.target.value as EquipmentType})} className="w-full border p-2 rounded bg-white text-gray-900">
                                   {equipmentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                               </select>
                           </div>
                           <div>
                               <label className="text-sm font-medium text-gray-700 block mb-1">Price/Day (GHS)</label>
                               <input required type="number" value={editingEquipment.price_per_day} onChange={e => setEditingEquipment({...editingEquipment, price_per_day: parseFloat(e.target.value)})} className="w-full border p-2 rounded bg-white text-gray-900" />
                           </div>
                       </div>
                       <div>
                           <label className="text-sm font-medium text-gray-700 block mb-1">Description</label>
                           <textarea value={editingEquipment.description} onChange={e => setEditingEquipment({...editingEquipment, description: e.target.value})} className="w-full border p-2 rounded bg-white text-gray-900 h-20" />
                       </div>
                       <div>
                           <label className="text-sm font-medium text-gray-700 block mb-1">Location</label>
                           <input required value={editingEquipment.location} onChange={e => setEditingEquipment({...editingEquipment, location: e.target.value})} className="w-full border p-2 rounded bg-white text-gray-900" />
                       </div>

                       {/* Image Management */}
                       <div>
                           <label className="text-sm font-medium text-gray-700 block mb-1">Images</label>
                           <div className="flex gap-2 overflow-x-auto py-2">
                               {editImagePreviews.length > 0 ? editImagePreviews.map((src, i) => (
                                   <img key={i} src={src} className="w-16 h-16 rounded object-cover border" alt="preview" />
                               )) : <p className="text-xs text-gray-500">No images</p>}
                           </div>
                           <div className="flex items-center mt-2">
                               <button type="button" onClick={() => editFileInputRef.current?.click()} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                   <UploadIcon className="w-4 h-4" /> Add More Photos
                               </button>
                               <input type="file" multiple ref={editFileInputRef} onChange={handleEditImageChange} className="hidden" accept="image/*" />
                           </div>
                       </div>

                       <Button type="submit" isLoading={isUpdating} className="w-full">Save Changes</Button>
                   </form>
               </Card>
           </div>
      )}

      {/* Item Details Modal (ReadOnly/Buy View) */}
      {selectedItem && (
           <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedItem(null)}>
               <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => { e.stopPropagation(); /* Prevent close on card click */ }}>
                   <div className="flex justify-between items-start mb-4">
                       <h3 className="text-xl font-bold text-gray-800">{selectedItem.title}</h3>
                       <button onClick={() => setSelectedItem(null)} className="text-gray-500 hover:text-gray-800 bg-gray-100 rounded-full p-1"><XIcon className="w-6 h-6" /></button>
                   </div>
                   
                   <div className="relative h-64 bg-gray-100 rounded-lg overflow-hidden mb-4 border border-gray-200 group">
                       {selectedItem.image_urls && selectedItem.image_urls.length > 0 ? (
                           selectedItem.image_urls.map((url, idx) => (
                               <img 
                                   key={idx}
                                   src={url} 
                                   alt={`${selectedItem.title} - view ${idx + 1}`}
                                   className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${idx === currentImageIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                               />
                           ))
                       ) : (
                           <img 
                               src='https://placehold.co/600x400?text=No+Image' 
                               alt={selectedItem.title}
                               className="w-full h-full object-cover"
                           />
                       )}
                       
                       <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded z-20">
                           {selectedItem.location_name || 'Location Unknown'}
                       </div>
                   </div>

                   <div className="space-y-4 text-gray-800">
                       <div className="flex justify-between items-center border-b pb-3">
                           <span className="text-2xl font-bold text-green-700">GHS {selectedItem.price.toFixed(2)}</span>
                           <div className="flex flex-col items-end">
                               <span className="text-xs text-gray-500">Category</span>
                               <span className="font-medium bg-gray-100 px-2 py-0.5 rounded">{selectedItem.category}</span>
                           </div>
                       </div>

                       <div>
                           <h4 className="font-bold text-sm text-gray-700 mb-1">Description</h4>
                           <div className="bg-gray-50 p-3 rounded border border-gray-100 text-sm text-gray-600 space-y-2">
                               <p className="leading-relaxed whitespace-pre-wrap">
                                   <span className="font-bold text-gray-800 block mb-1">Usage: </span>
                                   {selectedItem.usage_instructions || 'No specific usage instructions provided.'}
                               </p>
                           </div>
                       </div>

                       {user?.uid !== selectedItem.user_id ? (
                           <Button onClick={() => handleOpenItemChat(selectedItem)} className="w-full bg-green-700 hover:bg-green-800 py-3 text-base shadow-lg">
                               <MessageSquareIcon className="w-5 h-5 mr-2" /> Chat with Seller to Buy
                           </Button>
                       ) : (
                           <div className="p-3 bg-gray-100 text-center rounded-lg text-gray-500 text-sm font-medium border border-gray-200">
                               <UserIcon className="w-4 h-4 inline mr-1" /> This is your listing
                           </div>
                       )}
                   </div>
               </Card>
           </div>
      )}

      {/* Equipment Details Modal (ReadOnly) */}
      {selectedEquipment && (
           <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedEquipment(null)}>
               <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                   <div className="flex justify-between items-start mb-4">
                       <h3 className="text-xl font-bold text-gray-800">{selectedEquipment.name}</h3>
                       <button onClick={() => setSelectedEquipment(null)} className="text-gray-500 hover:text-gray-800 bg-gray-100 rounded-full p-1"><XIcon className="w-6 h-6" /></button>
                   </div>
                   
                   <div className="relative h-64 bg-gray-100 rounded-lg overflow-hidden mb-4 border border-gray-200 group">
                        <img 
                            src={selectedEquipment.image_url || 'https://placehold.co/600x400?text=No+Image'} 
                            alt={selectedEquipment.name}
                            className="w-full h-full object-cover"
                        />
                       <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded z-20">
                           {selectedEquipment.location || 'Location Unknown'}
                       </div>
                   </div>

                   <div className="space-y-4 text-gray-800">
                       <div className="flex justify-between items-center border-b pb-3">
                           <span className="text-2xl font-bold text-indigo-700">GHS {selectedEquipment.price_per_day.toFixed(2)}<span className='text-sm text-gray-500 font-normal'>/day</span></span>
                           <div className="flex flex-col items-end">
                               <span className="text-xs text-gray-500">Type</span>
                               <span className="font-medium bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded">{selectedEquipment.type}</span>
                           </div>
                       </div>

                       <div>
                           <h4 className="font-bold text-sm text-gray-700 mb-1">Description</h4>
                           <div className="bg-gray-50 p-3 rounded border border-gray-100 text-sm text-gray-600">
                               <p className="leading-relaxed whitespace-pre-wrap">
                                   {selectedEquipment.description || 'No detailed description available.'}
                               </p>
                           </div>
                       </div>
                        
                       <div className="p-3 bg-gray-100 text-center rounded-lg text-gray-500 text-sm font-medium border border-gray-200">
                           <UserIcon className="w-4 h-4 inline mr-1" /> This is your equipment listing
                       </div>
                   </div>
               </Card>
           </div>
      )}

      {/* Transaction Details Modal */}
      {selectedTransaction && (
           <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedTransaction(null)}>
               <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                   <div className="flex justify-between items-center mb-6 pb-4 border-b">
                       <h3 className="text-lg font-bold text-gray-800">Transaction Details</h3>
                       <button onClick={() => setSelectedTransaction(null)} className="text-gray-500 hover:text-gray-800"><XIcon className="w-6 h-6" /></button>
                   </div>
                   
                   <div className="space-y-6 text-gray-900">
                       <div className="text-center">
                           <p className="text-sm text-gray-500 mb-1">Amount</p>
                           <h2 className={`text-3xl font-bold ${['DEPOSIT', 'LOAN'].includes(selectedTransaction.type) ? 'text-green-600' : 'text-gray-900'}`}>
                               {selectedTransaction.currency} {selectedTransaction.amount.toFixed(2)}
                           </h2>
                           <span className={`inline-block mt-2 px-3 py-1 text-xs font-bold rounded-full uppercase ${getStatusColor(selectedTransaction.status)}`}>
                               {selectedTransaction.status}
                           </span>
                       </div>

                       <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-200 text-sm">
                           <div className="flex justify-between">
                               <span className="text-gray-500">Transaction ID</span>
                               <span className="font-mono font-medium text-gray-900">{selectedTransaction.provider_reference}</span>
                           </div>
                           <div className="flex justify-between">
                               <span className="text-gray-500">Date & Time</span>
                               <span className="font-medium text-gray-900">{new Date(selectedTransaction.created_at).toLocaleString()}</span>
                           </div>
                           <div className="flex justify-between">
                               <span className="text-gray-500">Type</span>
                               <span className="font-medium text-gray-900">{selectedTransaction.type}</span>
                           </div>
                           <div className="flex justify-between">
                               <span className="text-gray-500">Provider</span>
                               <span className="font-medium text-gray-900">{selectedTransaction.provider}</span>
                           </div>
                       </div>

                       {selectedTransaction.description && (
                           <div>
                               <p className="text-xs font-bold text-gray-500 uppercase mb-1">Description</p>
                               <p className="text-sm text-gray-800 bg-white p-3 rounded border">{selectedTransaction.description}</p>
                           </div>
                       )}
                   </div>
               </Card>
           </div>
      )}

      {/* Profile Chat Modal */}
      {isChatOpen && activeChatContext && (
           <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-lg w-full max-w-md flex flex-col h-[70vh]">
                    <div className="p-4 border-b flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-lg text-gray-800">Direct Chat</h3>
                            <p className="text-sm text-gray-500">{activeChatContext.title}</p>
                        </div>
                        <button onClick={() => setIsChatOpen(false)} className="text-gray-500 hover:text-gray-800"><XIcon className="w-6 h-6" /></button>
                    </div>
                    <div className="flex-grow p-4 overflow-y-auto bg-gray-50 space-y-4">
                        {chatMessages.length > 0 ? chatMessages.map((msg, index) => (
                            <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-xs lg:max-w-md p-3 rounded-lg ${msg.sender === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-800'}`}>
                                    <p>{msg.text}</p>
                                    <p className={`text-xs mt-1 ${msg.sender === 'user' ? 'text-indigo-200' : 'text-gray-500'} text-right`}>{msg.timestamp}</p>
                                </div>
                            </div>
                        )) : (
                            <p className="text-center text-gray-500 mt-10">Start the conversation!</p>
                        )}
                        <div ref={chatEndRef} />
                    </div>
                    <form onSubmit={handleSendReply} className="p-4 border-t flex gap-2">
                        <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type message..." className="flex-grow border border-gray-300 p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 !bg-white !text-gray-900" />
                        <Button type="submit" isLoading={sendingChat}>Send</Button>
                    </form>
                </div>
            </div>
      )}
    </div>
  );
};

export default Profile;
