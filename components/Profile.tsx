
import React, { useState, useEffect, useRef } from 'react';
import Card from './common/Card';
import Button from './common/Button';
import { UserCircleIcon, PencilIcon, TrashIcon, UserCircleIcon as UserIcon, PaperClipIcon, EyeIcon, UploadIcon, XIcon, DownloadIcon, ShoppingCartIcon, HeartIcon, ArrowRightIcon, TractorIcon, ShieldCheckIcon, BanknotesIcon, MessageSquareIcon, PhoneIcon, MailIcon, ClockIcon, CheckCircleIcon, AlertTriangleIcon, GridIcon, CheckIcon, DoubleCheckIcon, CameraIcon, StarIcon } from './common/icons';
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
  
  const [myListings, setMyListings] = useState<(MarketplaceItem & { image_url?: string })[]>([]);
  const [myEquipment, setMyEquipment] = useState<EquipmentItem[]>([]);
  const [likedItems, setLikedItems] = useState<(MarketplaceItem & { image_url?: string })[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // Rating State
  const [myStats, setMyStats] = useState<{ avg: number, count: number } | null>(null);
  
  // Item Details Modal State (For Liked Items & My Store Products)
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Edit Item State
  const [editingItem, setEditingItem] = useState<MarketplaceItem | EquipmentItem | null>(null);
  const [editType, setEditType] = useState<'market' | 'equipment' | null>(null);
  const [editFormData, setEditFormData] = useState({
      title: '',
      price: 0,
      description: '',
  });
  const [isUpdatingItem, setIsUpdatingItem] = useState(false);

  // Inbox State
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  
  // Chat Modal State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeChatContext, setActiveChatContext] = useState<{itemId: string, otherUserId: string, title: string} | null>(null);
  const [chatMessages, setChatMessages] = useState<(Message & { is_read?: boolean })[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [loadingListings, setLoadingListings] = useState(false);
  const [loadingLikes, setLoadingLikes] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Edit Profile Form
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

  // Initial load effect
  useEffect(() => {
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
      fetchMyRating();
    }
  }, [user]);

  // Realtime subscription for Chat Modal
  useEffect(() => {
    if (!isChatOpen || !activeChatContext || !user?.uid) return;

    const channel = supabase
      .channel(`profile_chat_${activeChatContext.itemId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats', filter: `item_id=eq.${activeChatContext.itemId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
              const newRecord = payload.new;
              const isRelevant = 
                 (newRecord.sender_id === user.uid && newRecord.receiver_id === activeChatContext.otherUserId) ||
                 (newRecord.sender_id === activeChatContext.otherUserId && newRecord.receiver_id === user.uid);

              if (isRelevant) {
                 if (newRecord.sender_id === activeChatContext.otherUserId) {
                     supabase.from('chats').update({ is_read: true }).eq('id', newRecord.id);
                 }
                 setChatMessages(prev => {
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
              const updatedRecord = payload.new;
              setChatMessages(prev => prev.map(msg => msg.id === updatedRecord.id ? { ...msg, is_read: updatedRecord.is_read } : msg));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isChatOpen, activeChatContext, user?.uid]);

  // Realtime subscription for INBOX list
  useEffect(() => {
      if (!user?.uid || activeTab !== 'INBOX') return;

      const channel = supabase
        .channel('profile_inbox_list')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'chats', filter: `receiver_id=eq.${user.uid}` },
            () => {
                fetchInbox(); // Re-fetch inbox list on new message
            }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
  }, [user?.uid, activeTab]);

  // Slideshow Logic
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

  const fetchMyRating = async () => {
      if (!user?.uid) return;
      try {
          const { data, error } = await supabase.from('user_reviews').select('rating').eq('target_user_id', user.uid);
          if (!error && data && data.length > 0) {
              const total = data.reduce((acc, curr) => acc + curr.rating, 0);
              setMyStats({ avg: total / data.length, count: data.length });
          }
      } catch (e) { console.error("Rating fetch failed", e); }
  };

  const fetchUserFiles = async () => {
    if (!user || !user.uid) return;
    setLoadingFiles(true);
    try {
      const userFiles = await getUserFiles(user.uid);
      setFiles(userFiles);
    } catch (error) { console.error(error); } 
    finally { setLoadingFiles(false); }
  };

  const fetchTransactions = async () => {
      if (!user || !user.uid) return;
      setLoadingTransactions(true);
      try {
          const data = await getTransactionHistory(user.uid);
          setTransactions(data || []);
      } catch (error) { console.error(error); } 
      finally { setLoadingTransactions(false); }
  };

  const fetchMyProperties = async () => {
      if (!user || !user.uid) return;
      setLoadingListings(true);
      try {
          const { data: marketData } = await supabase.from('marketplace').select('*').eq('user_id', user.uid).order('created_at', { ascending: false });
          setMyListings((marketData as any[]) || []);

          const { data: equipData } = await supabase.from('equipment').select('*').eq('user_id', user.uid).order('created_at', { ascending: false });
          setMyEquipment((equipData as EquipmentItem[]) || []);
      } catch (error) { console.error(error); } 
      finally { setLoadingListings(false); }
  };

  const fetchLikedItems = async () => {
      if (!user || !user.uid) return;
      setLoadingLikes(true);
      try {
          const { data: likesData } = await supabase.from('marketplace_likes').select('item_id').eq('user_id', user.uid);
          if (likesData && likesData.length > 0) {
              const itemIds = likesData.map((l: any) => l.item_id);
              const { data: itemsData } = await supabase.from('marketplace').select('*').in('id', itemIds);
              setLikedItems((itemsData as any[]) || []);
          } else {
              setLikedItems([]);
          }
      } catch (error) { console.error(error); } 
      finally { setLoadingLikes(false); }
  };

  const fetchInbox = async () => {
      if (!user || !user.uid) return;
      setLoadingInbox(true);
      try {
          const { data: inqData } = await supabase.from('inquiries').select('*').eq('recipient_id', user.uid).order('created_at', { ascending: false });
          setInquiries((inqData as Inquiry[]) || []);

          const { data: chatData } = await supabase.from('chats').select('*').or(`sender_id.eq.${user.uid},receiver_id.eq.${user.uid}`).order('created_at', { ascending: false }).limit(100);

          if (chatData) {
              const sessionsMap = new Map<string, ChatSession>();
              chatData.forEach((msg: any) => {
                  const isMe = msg.sender_id === user.uid;
                  const partnerId = isMe ? msg.receiver_id : msg.sender_id;
                  const key = `${msg.item_id}_${partnerId}`;
                  if (!sessionsMap.has(key)) {
                      sessionsMap.set(key, {
                          item_id: msg.item_id,
                          sender_id: partnerId,
                          last_message: msg.message_text,
                          last_time: msg.created_at,
                          sender_name: 'Loading...',
                          item_title: 'Loading Item...'
                      });
                  }
              });
              
              const sessions = Array.from(sessionsMap.values());
              const userIds = [...new Set(sessions.map(s => s.sender_id))];
              const itemIds = [...new Set(sessions.map(s => s.item_id))];

              const { data: usersData } = await supabase.from('users').select('id, name').in('id', userIds);
              const userMap = new Map(usersData?.map((u: any) => [u.id, u.name]));

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
      } catch (err) { console.error(err); } 
      finally { setLoadingInbox(false); }
  };

  // --- Handlers ---

  const handleUpdateProfile = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
          let photoUrl = user?.photo_url;
          
          if (newPhoto && user?.uid) {
              const fileData = await uploadUserFile(user.uid, newPhoto, 'profile', '', 'Profile Photo Update');
              photoUrl = fileData.file_url;
          }

          const updates = {
              name: formData.name,
              phone: formData.phone,
              photo_url: photoUrl,
          };

          const { error } = await supabase.from('users').update(updates).eq('id', user?.uid);
          if (error) throw error;

          setUser({ ...user!, ...updates });
          setIsEditing(false);
          addNotification({ type: 'auth', title: 'Success', message: 'Profile updated.', view: 'PROFILE' });
      } catch (error: any) {
          console.error(error);
          addNotification({ type: 'auth', title: 'Error', message: 'Failed to update profile.', view: 'PROFILE' });
      } finally {
          setLoading(false);
      }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setNewPhoto(file);
          fileToDataUri(file).then(setPhotoPreview);
      }
  };

  const openChat = async (session: ChatSession) => {
      if (!user?.uid) return;
      setActiveChatContext({ itemId: session.item_id, otherUserId: session.sender_id, title: `Chat: ${session.item_title || 'Item'}` });
      setIsChatOpen(true);
      loadChatMessages(session.item_id, session.sender_id);
  };

  const handleOpenItemChat = (item: MarketplaceItem) => {
      if (!user?.uid) return;
      if (item.user_id === user.uid) {
          addNotification({ type: 'market', title: 'Oops', message: 'This is your own item.', view: 'PROFILE' });
          return;
      }
      setActiveChatContext({ itemId: item.id, otherUserId: item.user_id, title: item.title });
      setSelectedItem(null); 
      setIsChatOpen(true);
      loadChatMessages(item.id, item.user_id);
  };

  const loadChatMessages = async (itemId: string, otherUserId: string) => {
      await supabase.from('chats').update({ is_read: true }).eq('item_id', itemId).eq('receiver_id', user?.uid);
      const { data } = await supabase.from('chats').select('*').eq('item_id', itemId).or(`sender_id.eq.${otherUserId},receiver_id.eq.${otherUserId}`).order('created_at', { ascending: true });
      if (data) {
          setChatMessages(data.map((d: any) => ({
              id: d.id,
              sender: d.sender_id === user?.uid ? 'user' : 'seller',
              text: d.message_text,
              timestamp: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              is_read: d.is_read
          })));
      }
  };

  const handleSendReply = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!activeChatContext || !user?.uid || !chatInput.trim()) return;
      setSendingChat(true);
      try {
          const { error } = await supabase.from('chats').insert([{
              sender_id: user.uid,
              receiver_id: activeChatContext.otherUserId,
              item_id: activeChatContext.itemId,
              message_text: chatInput.trim(),
              is_read: false
          }]);
          if (error) throw error;
          setChatInput('');
      } catch (err) { console.error("Reply failed", err); } 
      finally { setSendingChat(false); }
  };

  const handleFileDelete = async (file: UserFile) => {
      if (!window.confirm("Are you sure you want to delete this file?")) return;
      if (!user?.uid) return;
      try {
          await deleteUserFile(user.uid, file.id, file.storage_path);
          setFiles(prev => prev.filter(f => f.id !== file.id));
          addNotification({ type: 'pest', title: 'File Deleted', message: 'File removed successfully.', view: 'PROFILE' });
      } catch (error) {
          console.error("Delete failed", error);
          addNotification({ type: 'pest', title: 'Error', message: 'Could not delete file.', view: 'PROFILE' });
      }
  };

  const handleFileDownload = async (file: UserFile) => {
      try {
          const url = await getFreshDownloadUrl(file.storage_path);
          window.open(url, '_blank');
      } catch (error) {
          console.error("Download failed", error);
      }
  };

  const handleDeleteItem = async (itemId: string, type: 'market' | 'equipment') => {
      if (!window.confirm("Are you sure you want to delete this listing?")) return;
      try {
          const table = type === 'market' ? 'marketplace' : 'equipment';
          await supabase.from(table).delete().eq('id', itemId);
          if (type === 'market') setMyListings(prev => prev.filter(i => i.id !== itemId));
          else setMyEquipment(prev => prev.filter(i => i.id !== itemId));
          addNotification({ type: 'market', title: 'Deleted', message: 'Item removed successfully.', view: 'PROFILE' });
      } catch (e) { console.error(e); }
  };

  const openEditModal = (item: MarketplaceItem | EquipmentItem, type: 'market' | 'equipment') => {
      setEditingItem(item);
      setEditType(type);
      if (type === 'market') {
          const mItem = item as MarketplaceItem;
          setEditFormData({
              title: mItem.title,
              price: mItem.price,
              description: mItem.usage_instructions || '',
          });
      } else {
          const eItem = item as EquipmentItem;
          setEditFormData({
              title: eItem.name,
              price: eItem.price_per_day,
              description: eItem.description || '',
          });
      }
  };

  const handleUpdateItemSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingItem || !editType) return;
      setIsUpdatingItem(true);

      try {
          if (editType === 'market') {
              const updates = {
                  title: editFormData.title,
                  price: parseFloat(editFormData.price.toString()),
                  usage_instructions: editFormData.description,
              };
              const { error } = await supabase.from('marketplace').update(updates).eq('id', editingItem.id);
              if (error) throw error;
              
              // Update local state
              setMyListings(prev => prev.map(i => i.id === editingItem.id ? { ...i, ...updates } : i));

          } else {
              const updates = {
                  name: editFormData.title,
                  price_per_day: parseFloat(editFormData.price.toString()),
                  description: editFormData.description,
              };
              const { error } = await supabase.from('equipment').update(updates).eq('id', editingItem.id);
              if (error) throw error;

              // Update local state
              setMyEquipment(prev => prev.map(i => i.id === editingItem.id ? { ...i, ...updates } : i));
          }
          addNotification({ type: 'auth', title: 'Success', message: 'Item updated successfully.', view: 'PROFILE' });
          setEditingItem(null);
      } catch (error) {
          console.error(error);
          addNotification({ type: 'auth', title: 'Error', message: 'Failed to update item.', view: 'PROFILE' });
      } finally {
          setIsUpdatingItem(false);
      }
  };

  const getStatusColor = (status: string) => {
      switch (status) {
          case 'completed': return 'bg-green-100 text-green-800';
          case 'pending': return 'bg-yellow-100 text-yellow-800';
          case 'failed': return 'bg-red-100 text-red-800';
          case 'flagged': return 'bg-orange-100 text-orange-800';
          case 'refunded': return 'bg-purple-100 text-purple-800';
          default: return 'bg-gray-100 text-gray-800';
      }
  };

  if (!user) return <p className="text-center p-8 text-white">Please log in to view your profile.</p>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
       {/* Header */}
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
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
              <Card className="text-center p-6 flex flex-col items-center">
                   <div className="w-32 h-32 rounded-full border-4 border-white shadow-lg overflow-hidden mb-4 bg-gray-200 relative group">
                       <img src={photoPreview || user.photo_url || 'https://placehold.co/100'} alt="Profile" className="w-full h-full object-cover" />
                       {isEditing && (
                           <div className="absolute inset-0 bg-black/50 flex items-center justify-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                               <CameraIcon className="w-8 h-8 text-white" />
                               <input type="file" ref={fileInputRef} onChange={handlePhotoSelect} className="hidden" accept="image/*" />
                           </div>
                       )}
                   </div>
                   {!isEditing ? (
                       <>
                        <h3 className="text-xl font-bold text-gray-900">{user.name}</h3>
                        <p className="text-sm text-gray-500 mb-2">{user.email}</p>
                        
                        {/* Rating Display */}
                        {myStats && (
                            <div className="flex items-center justify-center gap-1 bg-yellow-50 px-3 py-1 rounded-full mb-3 border border-yellow-200">
                                <StarIcon className="w-4 h-4 text-yellow-500" />
                                <span className="font-bold text-yellow-800">{myStats.avg.toFixed(1)}</span>
                                <span className="text-xs text-yellow-600">({myStats.count} reviews)</span>
                            </div>
                        )}

                        {user.merchant_id && (
                            <div className="mb-2 bg-gray-100 px-3 py-1 rounded border border-gray-200">
                                <span className="text-[10px] uppercase text-gray-500 font-bold block">Merchant ID</span>
                                <span className="text-xs font-mono text-gray-800">{user.merchant_id}</span>
                            </div>
                        )}
                        <span className="text-xs font-bold uppercase bg-green-100 text-green-800 px-3 py-1 rounded-full mb-4">{user.type}</span>
                        <Button onClick={() => setIsEditing(true)} className="w-full text-xs py-2 bg-gray-100 !text-gray-800 hover:bg-gray-200 border border-gray-200 mt-2">
                            <PencilIcon className="w-4 h-4 mr-2" /> Edit Profile
                        </Button>
                       </>
                   ) : (
                       <form onSubmit={handleUpdateProfile} className="w-full space-y-3">
                           <input 
                                value={formData.name} 
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                className="w-full p-2 border rounded text-sm text-gray-900 bg-gray-50" 
                                placeholder="Full Name" 
                           />
                           <input 
                                value={formData.phone} 
                                onChange={e => setFormData({...formData, phone: e.target.value})}
                                className="w-full p-2 border rounded text-sm text-gray-900 bg-gray-50" 
                                placeholder="Phone Number" 
                           />
                           <div className="flex gap-2">
                               <Button type="submit" isLoading={loading} className="flex-1 text-xs py-2">Save</Button>
                               <Button type="button" onClick={() => { setIsEditing(false); setPhotoPreview(null); }} className="flex-1 text-xs py-2 bg-gray-200 !text-gray-800 hover:bg-gray-300">Cancel</Button>
                           </div>
                       </form>
                   )}
              </Card>
          </div>

          <div className="lg:col-span-3">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden text-gray-900 min-h-[500px]">
                  <div className="flex border-b overflow-x-auto no-scrollbar">
                      {['DETAILS', 'INBOX', 'LISTINGS', 'LIKES', 'FILES', 'TRANSACTIONS'].map((tab) => (
                          <button 
                            key={tab}
                            onClick={() => setActiveTab(tab as any)} 
                            className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap capitalize ${activeTab === tab ? 'text-green-700 border-b-2 border-green-600 bg-green-50' : 'text-gray-600 hover:bg-gray-50'}`}
                          >
                              {tab === 'LISTINGS' ? 'My Store' : tab.toLowerCase()}
                          </button>
                      ))}
                  </div>

                  <div className="p-6">
                      {activeTab === 'DETAILS' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-gray-900">
                              <div><label className="text-xs text-gray-500 uppercase">Email</label><p className="font-medium">{user.email}</p></div>
                              <div><label className="text-xs text-gray-500 uppercase">Phone</label><p className="font-medium">{user.phone || 'Not set'}</p></div>
                              <div><label className="text-xs text-gray-500 uppercase">Account Type</label><p className="font-medium capitalize">{user.type}</p></div>
                              <div><label className="text-xs text-gray-500 uppercase">Merchant ID</label><p className="font-medium font-mono">{user.merchant_id || 'N/A'}</p></div>
                          </div>
                      )}

                      {activeTab === 'INBOX' && (
                          <div className="space-y-8">
                              <div>
                                  <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2 border-b pb-2"><MailIcon className="w-5 h-5 text-gray-500"/> Inquiries</h4>
                                  {inquiries.length === 0 ? <p className="text-gray-500 text-sm italic">No inquiries.</p> : inquiries.map(inq => (
                                      <div key={inq.id} className="p-4 border rounded-lg hover:bg-gray-50 mb-2">
                                          <div className="flex justify-between"><span className="font-bold">{inq.subject}</span><span className="text-xs text-gray-400">{new Date(inq.created_at!).toLocaleDateString()}</span></div>
                                          <p className="text-sm text-gray-600 truncate">{inq.message}</p>
                                      </div>
                                  ))}
                              </div>
                              <div>
                                  <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2 border-b pb-2"><MessageSquareIcon className="w-5 h-5 text-gray-500"/> Chats</h4>
                                  {chatSessions.length === 0 ? <p className="text-gray-500 text-sm italic">No active chats.</p> : chatSessions.map((s, idx) => (
                                      <div key={idx} className="p-4 border rounded-lg hover:bg-gray-50 mb-2 flex justify-between items-center cursor-pointer" onClick={() => openChat(s)}>
                                          <div><p className="font-bold">{s.sender_name}</p><p className="text-xs text-gray-500">{s.item_title}</p></div>
                                          <Button className="text-xs py-1 px-3">Chat</Button>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}

                      {activeTab === 'LISTINGS' && (
                           <div className="space-y-8">
                               <div>
                                   <h4 className="font-bold text-gray-800 mb-3 border-b pb-2">My Products</h4>
                                   {loadingListings ? <p>Loading...</p> : myListings.length === 0 ? <p className="text-sm text-gray-500 italic">No products listed.</p> : (
                                       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                           {myListings.map(item => (
                                               <div key={item.id} className="border rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer group" onClick={() => setSelectedItem(item)}>
                                                   <div className="h-32 bg-gray-100 relative">
                                                       <img src={item.image_urls?.[0] || item.image_url || 'https://placehold.co/300x200'} className="w-full h-full object-cover" alt={item.title} />
                                                   </div>
                                                   <div className="p-3">
                                                       <h5 className="font-bold text-sm text-gray-900 truncate">{item.title}</h5>
                                                       <div className="flex justify-between items-center mt-1">
                                                            <p className="text-green-700 font-bold text-sm">GHS {item.price}</p>
                                                       </div>
                                                       <div className="flex gap-2 mt-2">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); openEditModal(item, 'market'); }}
                                                                className="flex-1 text-xs py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded flex items-center justify-center"
                                                            >
                                                                <PencilIcon className="w-3 h-3 mr-1" /> Edit
                                                            </button>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id, 'market'); }} 
                                                                className="flex-1 text-xs py-1 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded flex items-center justify-center"
                                                            >
                                                                <TrashIcon className="w-3 h-3 mr-1" /> Delete
                                                            </button>
                                                       </div>
                                                   </div>
                                               </div>
                                           ))}
                                       </div>
                                   )}
                               </div>
                               <div>
                                   <h4 className="font-bold text-gray-800 mb-3 border-b pb-2">My Equipment</h4>
                                   {myEquipment.length === 0 ? <p className="text-sm text-gray-500 italic">No equipment listed.</p> : (
                                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                           {myEquipment.map(item => (
                                               <div key={item.id} className="border rounded-lg p-3 flex gap-3 bg-white shadow-sm cursor-pointer hover:shadow-md" onClick={() => {}}>
                                                   <img src={item.image_urls?.[0] || item.image_url || 'https://placehold.co/100'} className="w-20 h-20 object-cover rounded" alt={item.name} />
                                                   <div className="flex-grow min-w-0">
                                                       <h5 className="font-bold text-sm truncate">{item.name}</h5>
                                                       <p className="text-indigo-600 font-bold text-sm">GHS {item.price_per_day}/day</p>
                                                       <div className="flex gap-2 mt-2">
                                                            <button onClick={(e) => { e.stopPropagation(); openEditModal(item, 'equipment'); }} className="flex-1 text-xs py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded flex items-center justify-center">
                                                                <PencilIcon className="w-3 h-3 mr-1" /> Edit
                                                            </button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id, 'equipment'); }} className="flex-1 text-xs py-1 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded flex items-center justify-center">
                                                                <TrashIcon className="w-3 h-3 mr-1" /> Delete
                                                            </button>
                                                       </div>
                                                   </div>
                                               </div>
                                           ))}
                                       </div>
                                   )}
                               </div>
                           </div>
                      )}

                      {activeTab === 'LIKES' && (
                          <div className="space-y-4">
                              <h4 className="font-bold text-gray-800 mb-3 border-b pb-2">Saved Items</h4>
                              {loadingLikes ? <p>Loading...</p> : likedItems.length === 0 ? <p className="text-sm text-gray-500 italic">No liked items.</p> : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                      {likedItems.map(item => (
                                          <div key={item.id} className="border rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedItem(item)}>
                                              <div className="h-32 bg-gray-100 relative">
                                                  <img src={item.image_urls?.[0] || item.image_url || 'https://placehold.co/300x200'} className="w-full h-full object-cover" alt={item.title} />
                                              </div>
                                              <div className="p-3">
                                                  <h5 className="font-bold text-sm text-gray-900 truncate">{item.title}</h5>
                                                  <p className="text-green-700 font-bold text-sm">GHS {item.price}</p>
                                                  <p className="text-xs text-gray-500 mt-1 truncate">By {item.seller_name}</p>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      )}

                      {activeTab === 'FILES' && (
                          <div className="space-y-4">
                              <h4 className="font-bold text-gray-800 mb-3 border-b pb-2">My Files & Reports</h4>
                              {loadingFiles ? <p>Loading...</p> : files.length === 0 ? <p className="text-sm text-gray-500 italic">No files found.</p> : (
                                  <div className="space-y-2">
                                      {files.map(file => (
                                          <div key={file.id} className="flex items-center justify-between p-3 border rounded bg-white hover:bg-gray-50">
                                              <div className="flex items-center gap-3 overflow-hidden">
                                                  <div className="bg-gray-100 p-2 rounded text-gray-600"><PaperClipIcon className="w-5 h-5"/></div>
                                                  <div className="min-w-0">
                                                      <p className="text-sm font-medium truncate text-gray-900">{file.file_name}</p>
                                                      <p className="text-xs text-gray-500">{new Date(file.created_at).toLocaleDateString()} • {file.context}</p>
                                                  </div>
                                              </div>
                                              <div className="flex gap-2">
                                                  <button onClick={() => handleFileDownload(file)} className="text-blue-600 hover:text-blue-800"><DownloadIcon className="w-5 h-5"/></button>
                                                  <button onClick={() => handleFileDelete(file)} className="text-red-500 hover:text-red-700"><TrashIcon className="w-5 h-5"/></button>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      )}

                      {activeTab === 'TRANSACTIONS' && (
                          <div className="space-y-4">
                              <h4 className="font-bold text-gray-800 mb-3 border-b pb-2">Wallet History</h4>
                              {loadingTransactions ? <p>Loading...</p> : transactions.length === 0 ? <p className="text-sm text-gray-500 italic">No transactions.</p> : (
                                  <div className="overflow-x-auto">
                                      <table className="min-w-full text-sm text-left">
                                          <thead className="bg-gray-50 text-gray-500">
                                              <tr>
                                                  <th className="px-4 py-2">Date</th>
                                                  <th className="px-4 py-2">Type</th>
                                                  <th className="px-4 py-2">Amount</th>
                                                  <th className="px-4 py-2">Status</th>
                                              </tr>
                                          </thead>
                                          <tbody className="divide-y">
                                              {transactions.map(tx => (
                                                  <tr key={tx.id}>
                                                      <td className="px-4 py-2 text-gray-600">{new Date(tx.created_at).toLocaleDateString()}</td>
                                                      <td className="px-4 py-2 font-medium text-gray-800">{tx.type}</td>
                                                      <td className={`px-4 py-2 font-bold ${['DEPOSIT', 'LOAN'].includes(tx.type) ? 'text-green-600' : 'text-red-600'}`}>
                                                          {['DEPOSIT', 'LOAN'].includes(tx.type) ? '+' : '-'} {tx.amount.toFixed(2)}
                                                      </td>
                                                      <td className="px-4 py-2">
                                                          <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(tx.status)}`}>{tx.status}</span>
                                                      </td>
                                                  </tr>
                                              ))}
                                          </tbody>
                                      </table>
                                  </div>
                              )}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      </div>

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
            <Card className="w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-800">Edit {editType === 'market' ? 'Product' : 'Equipment'}</h3>
                    <button onClick={() => setEditingItem(null)} className="text-gray-500 hover:text-gray-800"><XIcon className="w-6 h-6" /></button>
                </div>
                <form onSubmit={handleUpdateItemSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Title / Name</label>
                        <input 
                            value={editFormData.title} 
                            onChange={e => setEditFormData({...editFormData, title: e.target.value})} 
                            className="w-full p-2 border border-gray-300 rounded text-gray-900 bg-gray-50"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Price {editType === 'equipment' ? '(GHS per day)' : '(GHS)'}</label>
                        <input 
                            type="number"
                            value={editFormData.price} 
                            onChange={e => setEditFormData({...editFormData, price: parseFloat(e.target.value)})} 
                            className="w-full p-2 border border-gray-300 rounded text-gray-900 bg-gray-50"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description / Instructions</label>
                        <textarea 
                            value={editFormData.description} 
                            onChange={e => setEditFormData({...editFormData, description: e.target.value})} 
                            className="w-full p-2 border border-gray-300 rounded text-gray-900 h-24 bg-gray-50"
                        />
                    </div>
                    <div className="flex gap-2 pt-2">
                        <Button type="button" onClick={() => setEditingItem(null)} className="flex-1 bg-gray-200 !text-gray-900 hover:bg-gray-300">Cancel</Button>
                        <Button type="submit" isLoading={isUpdatingItem} className="flex-1">Save Changes</Button>
                    </div>
                </form>
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
                                    <div className="flex justify-end items-center gap-1 mt-1">
                                        <p className={`text-xs ${msg.sender === 'user' ? 'text-indigo-200' : 'text-gray-500'}`}>{msg.timestamp}</p>
                                        {msg.sender === 'user' && (msg.is_read ? <DoubleCheckIcon className="w-3 h-3 text-blue-300" /> : <DoubleCheckIcon className="w-3 h-3 text-gray-400" />)}
                                    </div>
                                </div>
                            </div>
                        )) : <p className="text-center text-gray-500 mt-10">Start the conversation!</p>}
                        <div ref={chatEndRef} />
                    </div>
                    <form onSubmit={handleSendReply} className="p-4 border-t flex gap-2">
                        <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type message..." className="flex-grow border border-gray-300 p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 !bg-gray-50 !text-gray-900" />
                        <Button type="submit" isLoading={sendingChat}>Send</Button>
                    </form>
                </div>
            </div>
      )}

      {/* Details View Modal (Reused for Liked Items) */}
      {selectedItem && (
           <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedItem(null)}>
               <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                   <div className="flex justify-between items-start mb-4">
                       <h3 className="text-xl font-bold text-gray-800">{selectedItem.title}</h3>
                       <button onClick={() => setSelectedItem(null)} className="text-gray-500 hover:text-gray-800 bg-gray-100 rounded-full p-1"><XIcon className="w-6 h-6" /></button>
                   </div>
                   <div className="relative h-64 bg-gray-100 rounded-lg overflow-hidden mb-4 border border-gray-200 group">
                       {selectedItem.image_urls && selectedItem.image_urls.length > 0 ? (
                           selectedItem.image_urls.map((url, idx) => (
                               <img key={idx} src={url} alt={`${selectedItem.title} ${idx}`} className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${idx === currentImageIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`} />
                           ))
                       ) : (
                           <img src={selectedItem.image_url || 'https://placehold.co/600x400?text=No+Image'} alt={selectedItem.title} className="w-full h-full object-cover" />
                       )}
                   </div>
                   <div className="space-y-4 text-gray-800">
                       <div className="flex justify-between items-center border-b pb-3">
                           <span className="text-2xl font-bold text-green-700">GHS {selectedItem.price.toFixed(2)}</span>
                           <span className="font-medium bg-gray-100 px-2 py-0.5 rounded text-xs text-gray-500">{selectedItem.category}</span>
                       </div>
                       <div>
                           <h4 className="font-bold text-sm text-gray-700 mb-1">Description</h4>
                           <p className="bg-gray-50 p-3 rounded border border-gray-100 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{selectedItem.usage_instructions || 'No details provided.'}</p>
                       </div>
                       <div className="flex items-center justify-between text-sm text-gray-500 bg-gray-50 p-2 rounded">
                           <span className="flex items-center gap-1"><UserIcon className="w-4 h-4"/> Seller: {selectedItem.seller_name}</span>
                       </div>
                       {user?.uid !== selectedItem.user_id ? (
                           <Button onClick={() => handleOpenItemChat(selectedItem)} className="w-full bg-green-700 hover:bg-green-800 py-3 text-base shadow-lg">
                               <MessageSquareIcon className="w-5 h-5 mr-2" /> Chat to Buy
                           </Button>
                       ) : (
                           <p className="text-center text-gray-500 text-sm italic bg-gray-100 p-2 rounded">Your Listing</p>
                       )}
                   </div>
               </Card>
           </div>
       )}
    </div>
  );
};

export default Profile;
