
import React, { useState, useRef, useEffect } from 'react';
import { EquipmentType, EquipmentItem, Message, User, Inquiry } from '../types';
import Card from './common/Card';
import Button from './common/Button';
import { TractorIcon, SearchIcon, MessageSquareIcon, XIcon, PlusIcon, UploadIcon, PencilIcon, TrashIcon, Spinner } from './common/icons';
import { useNotifications } from '../contexts/NotificationContext';
import { fileToDataUri } from '../utils';
import { uploadUserFile } from '../services/storageService';
import { supabase } from '../services/supabase';

interface ChatContext {
    id: string;
    name: string;
    subject: string;
}

interface EquipmentRentalProps {
    user: User | null;
}

const EquipmentRental: React.FC<EquipmentRentalProps> = ({ user }) => {
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<EquipmentType | 'All'>('All');
  const { addNotification } = useNotifications();

  // Form State
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentItem, setCurrentItem] = useState<Partial<EquipmentItem>>({
      name: '',
      type: EquipmentType.Tractor,
      location: '',
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
  const [conversations, setConversations] = useState<Record<string, Message[]>>({});
  const [currentMessage, setCurrentMessage] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    const fetchItems = async () => {
        const { data, error } = await supabase
            .from('equipment')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error("Error fetching equipment:", error);
        } else {
            setItems(data as EquipmentItem[]);
        }
        setLoading(false);
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
  }, [conversations, chatContext]);

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

          addNotification({
            type: 'rental',
            title: 'Request Sent',
            message: `Inquiry for ${inquiryItem.name} sent successfully.`,
            view: 'RENTAL'
          });
          setIsInquiryVisible(false);
      } catch (error: any) {
          console.error("Inquiry failed:", error);
          addNotification({ type: 'rental', title: 'Error', message: 'Failed to send inquiry.', view: 'RENTAL' });
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleContact = (item: EquipmentItem) => {
      setChatContext({
          id: item.id,
          name: item.owner,
          subject: item.name
      });
      setIsChatVisible(true);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          try {
            const base64 = await fileToDataUri(file);
            setItemImagePreview(base64);
            setItemImageFile(file);
          } catch (error) {
              console.error("Failed to convert image", error);
          }
      }
  };

  const openAddForm = () => {
      if (!user) {
          addNotification({ type: 'auth', title: 'Login Required', message: 'Please login to list equipment.', view: 'RENTAL' });
          return;
      }
      setIsEditMode(false);
      setCurrentItem({ name: '', type: EquipmentType.Tractor, location: '', price_per_day: 0, description: '', owner: user?.name || '' });
      setItemImagePreview(null);
      setItemImageFile(null);
      setIsFormVisible(true);
  };

  const openEditForm = (item: EquipmentItem) => {
      setIsEditMode(true);
      setCurrentItem({ ...item });
      setItemImagePreview(item.image_url);
      setItemImageFile(null);
      setIsFormVisible(true);
  };

  const handleSubmitItem = async (e: React.FormEvent) => {
      e.preventDefault();
      if (currentItem.name && currentItem.price_per_day && currentItem.owner) {
          setIsSubmitting(true);
          
          let imageUrl = itemImagePreview || currentItem.image_url || 'https://placehold.co/600x400/eeeeee/cccccc?text=No+Image';

          try {
              if (user && user.uid && itemImageFile) {
                  const uploadedFile = await uploadUserFile(user.uid, itemImageFile, 'rental', '', `Rental: ${currentItem.name}`);
                  // Fix: Changed download_url to file_url
                  imageUrl = uploadedFile.file_url;
              }

              if (isEditMode && currentItem.id) {
                 const { error } = await supabase.from('equipment').update({
                     name: currentItem.name,
                     type: currentItem.type,
                     owner: currentItem.owner,
                     location: currentItem.location,
                     price_per_day: Number(currentItem.price_per_day),
                     description: currentItem.description,
                     image_url: imageUrl
                 }).eq('id', currentItem.id);

                 if (error) throw error;
                 addNotification({ type: 'rental', title: 'Equipment Updated', message: `${currentItem.name} updated.`, view: 'RENTAL' });
              } else {
                 // Insert new item with ownerId
                 if (!user?.uid) throw new Error("User ID missing");

                 const { error } = await supabase.from('equipment').insert([{
                    name: currentItem.name,
                    type: currentItem.type as EquipmentType,
                    owner: currentItem.owner, // Display name
                    owner_id: user.uid,        // Link to user profile (snake_case)
                    location: currentItem.location || 'Unknown',
                    price_per_day: Number(currentItem.price_per_day),
                    image_url: imageUrl,
                    available: true,
                    description: currentItem.description || '',
                    created_at: new Date().toISOString()
                }]);
                
                if (error) throw error;
                addNotification({ type: 'rental', title: 'Equipment Listed', message: 'Listed successfully.', view: 'RENTAL' });
              }
              setIsFormVisible(false);
          } catch (error) {
              console.error("Error submitting equipment:", error);
              addNotification({ type: 'rental', title: 'Error', message: 'Failed to save equipment.', view: 'RENTAL' });
          } finally {
              setIsSubmitting(false);
          }
      }
  };

  const handleDeleteItem = async () => {
      if (itemToDelete) {
          try {
              const { error } = await supabase.from('equipment').delete().eq('id', itemToDelete.id);
              if (error) throw error;
              setIsDeleteModalVisible(false);
              setItemToDelete(null);
              addNotification({ type: 'rental', title: 'Deleted', message: 'Listing removed.', view: 'RENTAL' });
          } catch (error) {
              console.error("Error deleting:", error);
              addNotification({ type: 'rental', title: 'Error', message: 'Failed to delete.', view: 'RENTAL' });
          }
      }
  };
  
  const canManageItem = (item: EquipmentItem) => {
      if (!user) return false;
      return user.type === 'admin' || item.owner_id === user.uid || item.owner === user.name;
  }

  return (
    <Card>
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
            <h2 className="text-2xl font-bold text-green-800 flex items-center gap-2">
            <TractorIcon className="w-8 h-8" />
            Equipment Rental & Sharing
            </h2>
        </div>
        <Button onClick={openAddForm} className="bg-green-600 hover:bg-green-700 whitespace-nowrap">
            <PlusIcon className="w-5 h-5 mr-2" /> List Equipment
        </Button>
      </div>

      <div className="mb-6 flex flex-col md:flex-row gap-4">
          <div className="relative flex-grow">
              <input 
                type="text" 
                placeholder="Search tractors, plows, etc..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <SearchIcon className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
          </div>
          <select 
            value={selectedType} 
            onChange={(e) => setSelectedType(e.target.value as EquipmentType | 'All')}
            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          >
              <option value="All">All Types</option>
              {Object.values(EquipmentType).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
      </div>
      
      {loading ? (
          <div className="flex justify-center py-12"><Spinner className="w-8 h-8 text-green-600" /></div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {filteredItems.map((item) => (
              <div key={item.id} className="bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden flex flex-col relative group hover:shadow-lg transition-shadow">
                {canManageItem(item) && (
                    <div className="absolute top-2 right-2 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditForm(item)} className="bg-white/90 p-2 rounded-full text-gray-600 hover:text-blue-600"><PencilIcon className="w-4 h-4" /></button>
                        <button onClick={() => { setItemToDelete(item); setIsDeleteModalVisible(true); }} className="bg-white/90 p-2 rounded-full text-gray-600 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                    </div>
                )}
                <div className="h-48 overflow-hidden bg-gray-100">
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                </div>
                <div className="p-4 flex flex-col flex-grow">
                   <div className="flex justify-between items-start mb-1">
                       <h3 className="text-lg font-bold text-gray-800 line-clamp-1">{item.name}</h3>
                       <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full whitespace-nowrap">{item.type}</span>
                   </div>
                   <p className="text-sm text-gray-500 mb-2">{item.location}</p>
                   <p className="text-xl font-bold text-green-700 mb-3">GHS {item.price_per_day} <span className="text-sm text-gray-500 font-normal">/ day</span></p>
                   
                   <div className="mt-auto pt-4 border-t border-gray-100 grid grid-cols-2 gap-2">
                        <Button onClick={() => handleContact(item)} className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs py-2"><MessageSquareIcon className="w-4 h-4 mr-1 inline" /> Contact</Button>
                        <Button onClick={() => handleOpenInquiry(item)} disabled={!item.available} className="text-xs py-2 bg-green-600 hover:bg-green-700">Rent Now</Button>
                   </div>
                </div>
              </div>
            ))}
          </div>
      )}

      {/* Inquiry Modal */}
      {isInquiryVisible && inquiryItem && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-lg">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-gray-800">Rent Inquiry</h3>
                      <button onClick={() => setIsInquiryVisible(false)} className="text-gray-500 hover:text-gray-800"><XIcon className="w-6 h-6" /></button>
                  </div>
                  
                  <div className="bg-gray-50 p-3 rounded-lg mb-4 flex gap-3 border border-gray-200">
                      <img src={inquiryItem.image_url} className="w-16 h-16 object-cover rounded" alt="Item" />
                      <div>
                          <p className="font-bold text-gray-900">{inquiryItem.name}</p>
                          <p className="text-sm text-green-700">GHS {inquiryItem.price_per_day} / day</p>
                      </div>
                  </div>

                  <form onSubmit={submitInquiry} className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Your Name</label>
                          <input required type="text" value={inquiryForm.name} onChange={e => setInquiryForm({...inquiryForm, name: e.target.value})} className="w-full border p-2 rounded mt-1" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700">Email</label>
                              <input required type="email" value={inquiryForm.email} onChange={e => setInquiryForm({...inquiryForm, email: e.target.value})} className="w-full border p-2 rounded mt-1" />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700">Phone</label>
                              <input required type="tel" value={inquiryForm.phone} onChange={e => setInquiryForm({...inquiryForm, phone: e.target.value})} className="w-full border p-2 rounded mt-1" />
                          </div>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Message</label>
                          <textarea required rows={3} value={inquiryForm.message} onChange={e => setInquiryForm({...inquiryForm, message: e.target.value})} className="w-full border p-2 rounded mt-1"></textarea>
                      </div>
                      <Button type="submit" isLoading={isSubmitting} className="w-full">Send Request</Button>
                  </form>
              </Card>
          </div>
      )}

      {/* Forms and Modals */}
      {isFormVisible && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                   <h3 className="text-xl font-bold mb-4">{isEditMode ? 'Edit' : 'Add'} Equipment</h3>
                   <form onSubmit={handleSubmitItem}>
                       {/* Inputs for name, type, price, owner, location, description */}
                       <input type="text" value={currentItem.name} onChange={e => setCurrentItem({...currentItem, name: e.target.value})} className="w-full mb-2 p-2 border rounded" placeholder="Name" required />
                       <input type="number" value={currentItem.price_per_day} onChange={e => setCurrentItem({...currentItem, price_per_day: Number(e.target.value)})} className="w-full mb-2 p-2 border rounded" placeholder="Price" required />
                       <input type="file" ref={fileInputRef} onChange={handleImageChange} className="mb-2" />
                       <Button type="submit" isLoading={isSubmitting}>Save</Button>
                       <Button onClick={() => setIsFormVisible(false)} className="bg-gray-200 text-gray-800 ml-2">Cancel</Button>
                   </form>
              </Card>
          </div>
      )}
    </Card>
  );
};

export default EquipmentRental;
