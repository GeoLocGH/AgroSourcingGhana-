
import React, { useState, useEffect, useRef } from 'react';
import Card from './common/Card';
import Button from './common/Button';
import { UserCircleIcon, PencilIcon, TrashIcon, UserCircleIcon as UserIcon, PaperClipIcon, EyeIcon, UploadIcon, XIcon, DownloadIcon, ShoppingCartIcon, HeartIcon, ArrowRightIcon, TractorIcon, ShieldCheckIcon, BanknotesIcon, MessageSquareIcon, PhoneIcon, MailIcon, ClockIcon } from './common/icons';
import type { User, UserFile, MarketplaceItem, EquipmentItem, View, Transaction, Inquiry, Message } from '../types';
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
    sender_id: string;
    last_message: string;
    last_time: string;
    sender_name?: string; // Derived if possible
    item_title?: string;  // Derived if possible
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
  
  // Inbox State
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  
  // Chat Modal State (Duplicate logic for simplicity in Profile context)
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeChatContext, setActiveChatContext] = useState<{itemId: string, otherUserId: string, title: string} | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [loadingListings, setLoadingListings] = useState(false);
  const [loadingLikes, setLoadingLikes] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

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

  useEffect(() => {
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
          const { data: marketData } = await supabase.from('marketplace').select('*').eq('user_id', user.uid);
          setMyListings((marketData as MarketplaceItem[]) || []);

          const { data: equipData } = await supabase.from('equipment').select('*').eq('user_id', user.uid);
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
          // 1. Fetch Inquiries (Emails)
          const { data: inqData } = await supabase
            .from('inquiries')
            .select('*')
            .eq('recipient_id', user.uid)
            .order('created_at', { ascending: false });
          setInquiries((inqData as Inquiry[]) || []);

          // 2. Fetch Chat Sessions (Group by item_id + sender_id)
          // Since we can't easily do complex GROUP BY with latest message in standard Supabase client without views/functions,
          // we'll fetch recent chats where receiver is user, and client-side group.
          const { data: chatData } = await supabase
             .from('chats')
             .select('*')
             .eq('receiver_id', user.uid)
             .order('created_at', { ascending: false })
             .limit(50); // Fetch last 50 messages to form recent sessions

          if (chatData) {
              const sessionsMap = new Map<string, ChatSession>();
              
              chatData.forEach((msg: any) => {
                  const key = `${msg.item_id}_${msg.sender_id}`;
                  if (!sessionsMap.has(key)) {
                      sessionsMap.set(key, {
                          item_id: msg.item_id,
                          sender_id: msg.sender_id,
                          last_message: msg.message_text,
                          last_time: msg.created_at
                      });
                  }
              });
              setChatSessions(Array.from(sessionsMap.values()));
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

  // --- Inbox / Chat Logic ---

  const openChat = async (session: ChatSession) => {
      if (!user?.uid) return;
      setActiveChatContext({
          itemId: session.item_id,
          otherUserId: session.sender_id,
          title: `Chat about Item #${session.item_id}`
      });
      setIsChatOpen(true);
      loadChatMessages(session.item_id, session.sender_id);
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
                      <button onClick={() => setActiveTab('LISTINGS')} className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap ${activeTab === 'LISTINGS' ? 'text-green-700 border-b-2 border-green-600 bg-green-50' : 'text-gray-600 hover:bg-gray-50'}`}>My Listings</button>
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

                      {activeTab === 'INBOX' && (
                          <div className="space-y-6">
                              <div>
                                  <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                      <MessageSquareIcon className="w-5 h-5 text-indigo-600" /> Recent Chats
                                  </h3>
                                  {loadingInbox ? <p className="text-sm text-gray-500">Loading chats...</p> : 
                                    chatSessions.length === 0 ? <p className="text-sm text-gray-500 italic">No active conversations.</p> :
                                    <div className="space-y-2">
                                        {chatSessions.map((chat, idx) => (
                                            <div key={idx} className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer" onClick={() => openChat(chat)}>
                                                <div>
                                                    <p className="font-bold text-sm text-gray-900">Item #{chat.item_id.substring(0, 8)}...</p>
                                                    <p className="text-sm text-gray-600 truncate max-w-xs">{chat.last_message}</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-xs text-gray-400">{new Date(chat.last_time).toLocaleDateString()}</span>
                                                    <Button className="ml-2 text-xs py-1 px-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-none shadow-none">Reply</Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                  }
                              </div>

                              <div>
                                  <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 border-t pt-6">
                                      <MailIcon className="w-5 h-5 text-orange-600" /> Received Inquiries
                                  </h3>
                                  {loadingInbox ? <p className="text-sm text-gray-500">Loading inquiries...</p> : 
                                    inquiries.length === 0 ? <p className="text-sm text-gray-500 italic">No inquiries received yet.</p> :
                                    <div className="space-y-3">
                                        {inquiries.map((inq, idx) => (
                                            <div key={idx} className="bg-orange-50 border border-orange-100 rounded-lg p-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-bold text-orange-900 text-sm">{inq.subject || 'No Subject'}</h4>
                                                    <span className="text-xs text-orange-400">{inq.created_at ? new Date(inq.created_at).toLocaleDateString() : ''}</span>
                                                </div>
                                                <p className="text-sm text-gray-800 mb-2">{inq.message}</p>
                                                <div className="text-xs text-gray-500 flex flex-wrap gap-3">
                                                    <span>From: <span className="font-medium text-gray-900">{inq.name}</span></span>
                                                    <span>Phone: <span className="font-medium text-gray-900">{inq.phone}</span></span>
                                                    <span>Email: <span className="font-medium text-gray-900">{inq.email}</span></span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                  }
                              </div>
                          </div>
                      )}

                      {activeTab === 'TRANSACTIONS' && (
                          <div className="space-y-4">
                              <h3 className="text-lg font-bold text-gray-800">Payment History (MoMo & Digital Wallet)</h3>
                              {loadingTransactions ? <p className="text-center py-4">Loading transactions...</p> : (
                                  <div className="overflow-x-auto">
                                      <table className="min-w-full divide-y divide-gray-200">
                                          <thead className="bg-gray-50">
                                              <tr>
                                                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</th>
                                                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ref</th>
                                                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                              </tr>
                                          </thead>
                                          <tbody className="bg-white divide-y divide-gray-200">
                                              {transactions.map(tx => (
                                                  <tr key={tx.id} className="hover:bg-gray-50">
                                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                          {new Date(tx.created_at).toLocaleDateString()}
                                                      </td>
                                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                          <div className="flex items-center gap-2">
                                                              <BanknotesIcon className="w-4 h-4 text-gray-400" />
                                                              {tx.provider}
                                                          </div>
                                                      </td>
                                                      <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-500">
                                                          {tx.provider_reference}
                                                      </td>
                                                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                                          {tx.currency || 'GHS'} {tx.amount.toFixed(2)}
                                                      </td>
                                                      <td className="px-6 py-4 whitespace-nowrap">
                                                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full uppercase tracking-wider ${getStatusColor(tx.status)}`}>
                                                              {tx.status}
                                                          </span>
                                                      </td>
                                                  </tr>
                                              ))}
                                          </tbody>
                                      </table>
                                      {transactions.length === 0 && <p className="text-center text-gray-400 py-8">No transaction history found.</p>}
                                  </div>
                              )}
                          </div>
                      )}

                      {activeTab === 'FILES' && (
                          <div className="space-y-4">
                              {loadingFiles ? <p className="text-center py-4">Loading...</p> : files.map(f => (
                                  <div key={f.id} className="border rounded-lg overflow-hidden">
                                      <div className="flex items-center justify-between p-3 bg-white hover:bg-gray-50">
                                          <div className="flex items-center gap-3 cursor-pointer flex-grow" onClick={() => toggleFileDetails(f.id)}>
                                              <div className="p-2 bg-gray-100 rounded text-gray-500"><PaperClipIcon className="w-5 h-5" /></div>
                                              <div>
                                                  <p className="text-sm font-medium text-gray-900 truncate">{f.file_name}</p>
                                                  <p className="text-xs text-gray-500 capitalize">{f.context.replace('-', ' ')} • {new Date(f.createdAt).toLocaleDateString()}</p>
                                              </div>
                                          </div>
                                          <div className="flex gap-2">
                                            <button onClick={() => handleFileDownload(f)} className="p-2 text-gray-400 hover:text-blue-600"><DownloadIcon className="w-4 h-4" /></button>
                                            <button onClick={() => handleFileDelete(f)} className="p-2 text-gray-400 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                                          </div>
                                      </div>
                                      {expandedFileId === f.id && (
                                          <div className="p-4 bg-gray-50 border-t text-sm space-y-3 text-gray-900">
                                              {f.ai_summary && (
                                                  <div className="space-y-1">
                                                      <h5 className="font-bold flex items-center gap-1 text-green-700"><ShieldCheckIcon className="w-4 h-4" /> AI Analysis</h5>
                                                      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: marked.parse(f.ai_summary) }} />
                                                  </div>
                                              )}
                                              {f.notes && (
                                                  <div><h5 className="font-bold text-gray-700">Notes</h5><p className="bg-white p-2 rounded border">{f.notes}</p></div>
                                              )}
                                          </div>
                                      )}
                                  </div>
                              ))}
                              {files.length === 0 && !loadingFiles && <p className="text-center text-gray-400 py-8">No files uploaded yet.</p>}
                          </div>
                      )}
                      
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
                                                   <div key={item.id} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                                                       <img src={item.image_urls?.[0] || 'https://placehold.co/50'} alt={item.title} className="w-12 h-12 rounded object-cover border border-gray-200" />
                                                       <div className="flex-grow">
                                                           <p className="font-bold text-gray-900">{item.title}</p>
                                                           <p className="text-sm text-green-700 font-bold">GHS {item.price.toFixed(2)}</p>
                                                           <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
                                                               {item.seller_phone && (
                                                                   <span className="flex items-center gap-1 bg-green-50 px-1.5 py-0.5 rounded text-green-700 border border-green-100">
                                                                       <PhoneIcon className="w-3 h-3"/> {item.seller_phone}
                                                                   </span>
                                                               )}
                                                               {item.seller_email && (
                                                                   <span className="flex items-center gap-1 bg-blue-50 px-1.5 py-0.5 rounded text-blue-700 border border-blue-100">
                                                                       <MailIcon className="w-3 h-3"/> {item.seller_email}
                                                                   </span>
                                                               )}
                                                           </div>
                                                       </div>
                                                       <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full whitespace-nowrap">{item.category}</span>
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
                                                   <div key={item.id} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                                                       <img src={item.image_url || 'https://placehold.co/50'} alt={item.name} className="w-12 h-12 rounded object-cover border border-gray-200" />
                                                       <div className="flex-grow">
                                                           <p className="font-bold text-gray-900">{item.name}</p>
                                                           <p className="text-sm text-indigo-700 font-bold">GHS {item.price_per_day.toFixed(2)} / day</p>
                                                       </div>
                                                       <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">{item.type}</span>
                                                   </div>
                                               )) : <p className="text-sm text-gray-500 italic text-center py-2">No equipment listed.</p>}
                                           </div>
                                       </div>
                                   </>
                               )}
                           </div>
                      )}
                      
                      {activeTab === 'LIKES' && (
                          <div className="space-y-3">
                              {loadingLikes ? <p className="text-center text-gray-500 py-4">Loading favorites...</p> : likedItems.length > 0 ? (
                                  likedItems.map(item => (
                                      <div key={item.id} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50">
                                          <img src={item.image_urls?.[0] || 'https://placehold.co/50'} alt={item.title} className="w-12 h-12 rounded object-cover border" />
                                          <div className="flex-grow">
                                              <p className="font-bold text-gray-900">{item.title}</p>
                                              <p className="text-sm text-green-700">GHS {item.price.toFixed(2)}</p>
                                          </div>
                                          <HeartIcon className="w-5 h-5 text-red-500" filled={true} />
                                      </div>
                                  ))
                              ) : (
                                  <p className="text-center text-gray-500 py-8">No items liked yet.</p>
                              )}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      </div>

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
