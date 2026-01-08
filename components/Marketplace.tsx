
import React, { useState, useRef, useEffect } from 'react';
import type { MarketplaceItem, Message, SellerOrder, User, View } from '../types';
import Card from './common/Card';
import Button from './common/Button';
import { useNotifications } from '../contexts/NotificationContext';
import { useGeolocation } from '../hooks/useGeolocation';
import { fileToDataUri } from '../utils';
import { uploadUserFile } from '../services/storageService';
import { supabase } from '../services/supabase';
import { 
    MailIcon, 
    ChevronDownIcon, 
    PhoneIcon, 
    GridIcon, 
    SproutIcon, 
    FertilizerBagIcon,
    FarmToolIcon,
    HarvestIcon,
    UploadIcon,
    XIcon,
    PencilIcon,
    MessageSquareIcon,
    TrashIcon,
    SearchIcon,
    PlusIcon,
    ShoppingCartIcon,
    Spinner,
    UserCircleIcon,
    ShieldCheckIcon,
    ArrowLeftIcon,
    ArrowRightIcon,
    HeartIcon,
    TagIcon,
    CreditCardIcon
} from './common/icons';

// Declare Leaflet global
declare const L: any;

type Category = MarketplaceItem['category'] | 'All';

const categories: { name: Category, icon: React.ReactElement }[] = [
    { name: 'All', icon: <GridIcon className="w-5 h-5" /> },
    { name: 'Seeds', icon: <SproutIcon className="w-5 h-5" /> },
    { name: 'Fertilizers', icon: <FertilizerBagIcon className="w-5 h-5" /> },
    { name: 'Tools', icon: <FarmToolIcon className="w-5 h-5" /> },
    { name: 'Produce', icon: <HarvestIcon className="w-5 h-5" /> },
];

interface ChatContext {
    id: string; // Conversation ID (Item ID)
    name: string; // The person being chatted with
    subject: string; // The item or order subject
    participants?: string[]; // User IDs involved
    receiverId?: string; // Explicit receiver ID for reliability
}

interface MarketplaceProps {
    user: User | null;
    setActiveView?: (view: View) => void;
    onRequireLogin: () => void;
}

const Marketplace: React.FC<MarketplaceProps> = ({ user, setActiveView, onRequireLogin }) => {
    const [marketplaceItems, setMarketplaceItems] = useState<MarketplaceItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(true);

    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<Category>('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState('Newest');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newItem, setNewItem] = useState<Omit<MarketplaceItem, 'id' | 'image_urls' | 'created_at' | 'likes' | 'userHasLiked' | 'owner_id' | 'seller_name'>>({ 
        title: '', 
        category: 'Seeds', 
        price: 0,
        usage_instructions: '',
        storage_recommendations: '',
        location_lat: undefined,
        location_lng: undefined,
        location_name: ''
    });
    
    const [newItemImagePreviews, setNewItemImagePreviews] = useState<string[]>([]);
    const [newItemFiles, setNewItemFiles] = useState<File[]>([]);
    const [currentImageIndex, setCurrentImageIndex] = useState(0); 
    const [error, setError] = useState('');
    
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [itemToEdit, setItemToEdit] = useState<MarketplaceItem | null>(null);

    const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<MarketplaceItem | null>(null);

    const [isChatVisible, setIsChatVisible] = useState(false);
    const [chatContext, setChatContext] = useState<ChatContext | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentMessage, setCurrentMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    const [isSellerProfileOpen, setIsSellerProfileOpen] = useState(false);
    const [viewingSeller, setViewingSeller] = useState<Partial<User> | null>(null);
    const [isLoadingSeller, setIsLoadingSeller] = useState(false);

    const [viewMode, setViewMode] = useState<'BUYER' | 'SELLER'>('BUYER');
    const [displayFormat, setDisplayFormat] = useState<'GRID' | 'MAP'>('GRID');
    const [sellerOrders, setSellerOrders] = useState<SellerOrder[]>([]);

    const { addNotification } = useNotifications();
    const { location } = useGeolocation();

    const filterRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editFileInputRef = useRef<HTMLInputElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);

    useEffect(() => {
        setLoadingItems(true);

        const fetchItems = async () => {
            // Fetch Items - ordered by created_at (snake_case)
            const { data: itemsData, error: itemsError } = await supabase
                .from('marketplace')
                .select('*')
                .order('created_at', { ascending: false });

            if (itemsError) {
                console.error("Error fetching items:", JSON.stringify(itemsError, null, 2));
                setLoadingItems(false);
                return;
            }

            let finalItems = itemsData as MarketplaceItem[];

            // If we have items and user is logged in, fetch like status/counts
            if (finalItems.length > 0) {
                 // 1. Get Like Counts for all items
                 const { data: likesCountData } = await supabase
                    .from('marketplace_likes')
                    .select('item_id');
                 
                 // 2. Get User's likes if logged in
                 let userLikedItemIds = new Set<string>();
                 if (user?.uid) {
                     const { data: userLikes } = await supabase
                        .from('marketplace_likes')
                        .select('item_id')
                        .eq('user_id', user.uid);
                     
                     if (userLikes) {
                         userLikes.forEach((l: any) => userLikedItemIds.add(l.item_id));
                     }
                 }

                 // Map data back to items
                 finalItems = finalItems.map(item => {
                     const count = likesCountData ? likesCountData.filter((l: any) => l.item_id === item.id).length : 0;
                     return {
                         ...item,
                         likes: count,
                         userHasLiked: userLikedItemIds.has(item.id)
                     };
                 });
            }

            setMarketplaceItems(finalItems);
            setLoadingItems(false);
        };
        
        // Subscribe to changes
        const subscription = supabase
            .channel('public:marketplace')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace' }, fetchItems)
            .subscribe();

        fetchItems();

        return () => { subscription.unsubscribe(); };
    }, [user]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        setCurrentImageIndex(0);
    }, [expandedItemId]);
    
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isChatVisible]);

    // Chat Listener
    useEffect(() => {
        if (!chatContext?.id || !isChatVisible || !user?.uid) return;

        // 1. Initial Load of History
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

        // 2. Real-time Subscription
        const channel = supabase
            .channel(`realtime_chats:${chatContext.id}`)
            .on(
                'postgres_changes', 
                { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'chats', 
                    // We filter by item_id to get both sent and received messages for this specific conversation
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

                    // 3. Add the new message to state
                    setMessages((prev) => [...prev, newMessage]);

                    // 4. Play a notification sound if the message is from someone else
                    if (newRecord.sender_id !== user.uid) {
                        try {
                            new Audio('/notification.mp3').play().catch(() => {});
                        } catch (e) {
                            console.log("Audio notification failed", e);
                        }
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [chatContext, isChatVisible, user?.uid]);

    // Map Initialization
    useEffect(() => {
        if (displayFormat === 'MAP' && typeof L !== 'undefined') {
            // Clean up previous map instance if exists
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }

            // Default center (Ghana)
            const defaultCenter = [7.9465, -1.0232];
            const center = location ? [location.latitude, location.longitude] : defaultCenter;
            
            const map = L.map('marketplace-map').setView(center, location ? 10 : 7);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);

            // Add markers
            const filtered = getFilteredItems();
            
            const bounds = L.latLngBounds([]);
            let hasMarkers = false;

            filtered.forEach(item => {
                if (item.location_lat && item.location_lng) {
                    hasMarkers = true;
                    const marker = L.marker([item.location_lat, item.location_lng])
                        .addTo(map)
                        .bindPopup(`
                            <div class="p-1">
                                <h3 class="font-bold text-sm">${item.title}</h3>
                                <p class="text-xs text-gray-600">${item.seller_name}</p>
                                <p class="text-sm font-bold text-green-700">GHS ${item.price.toFixed(2)}</p>
                            </div>
                        `);
                    bounds.extend([item.location_lat, item.location_lng]);
                }
            });

            if (hasMarkers) {
                map.fitBounds(bounds, { padding: [50, 50] });
            }

            mapRef.current = map;
        }
    }, [displayFormat, marketplaceItems, selectedCategory, searchTerm]);

    const handleToggleDetails = (id: string) => {
        setExpandedItemId(prevId => (prevId === id ? null : id));
    };
    
    const handleCategoryChange = (category: Category) => {
        setSelectedCategory(category);
        setIsFilterOpen(false);
    };
    
    const clearNewItemForm = () => {
        setNewItem({ 
            title: '', 
            category: 'Seeds', 
            price: 0, 
            usage_instructions: '', 
            storage_recommendations: '',
            location_lat: undefined,
            location_lng: undefined,
            location_name: ''
        });
        setNewItemImagePreviews([]);
        setNewItemFiles([]);
        setError('');
    };

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
        const files = e.target.files;
        if (files) {
            const newFiles = Array.from(files);
            let validationError = '';
            
            const validFiles = (newFiles as File[]).filter(file => {
                 if (file.size > 4 * 1024 * 1024) {
                    validationError = 'One or more images are over the 4MB size limit.';
                    return false;
                }
                if (!file.type.startsWith('image/')) {
                    validationError = 'One or more files are not valid image types.';
                    return false;
                }
                return true;
            });

            if(validationError) {
                setError(validationError);
            } else {
                 setError('');
            }
            
            const newPreviews = await Promise.all(validFiles.map(file => fileToDataUri(file)));

            if (isEdit && itemToEdit) {
                 setItemToEdit(prev => ({
                    ...prev!,
                    image_urls: [...(prev?.image_urls || []), ...newPreviews],
                 }));
            } else {
                setNewItemImagePreviews(prev => [...prev, ...newPreviews]);
                setNewItemFiles(prev => [...prev, ...validFiles]);
            }
        }
    };
    
    const handleRemovePreviewImage = (indexToRemove: number, isEdit = false) => {
        if(isEdit && itemToEdit) {
             setItemToEdit(prev => ({
                ...prev!,
                image_urls: prev!.image_urls!.filter((_, index) => index !== indexToRemove)
             }));
        } else {
            setNewItemImagePreviews(prev => prev.filter((_, index) => index !== indexToRemove));
            setNewItemFiles(prev => prev.filter((_, index) => index !== indexToRemove));
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>, isEdit = false) => {
        const { name, value } = e.target;
        let processedValue: any = value;
        
        // Parse numbers for price and coordinates
        if (name === 'price' || name === 'location_lat' || name === 'location_lng') {
             processedValue = value === '' ? undefined : parseFloat(value);
        }

        if (isEdit && itemToEdit) {
            setItemToEdit(prev => ({ ...prev!, [name]: processedValue }));
        } else {
            setNewItem(prev => ({ ...prev, [name]: processedValue }));
        }
    };

    const handleUseMyLocation = (e: React.MouseEvent) => {
        e.preventDefault();
        if (location) {
            setNewItem(prev => ({
                ...prev,
                location_lat: location.latitude,
                location_lng: location.longitude,
                location_name: prev.location_name || 'Current Location'
            }));
        } else {
            alert("Could not detect location. Please ensure location services are enabled, or enter coordinates manually.");
        }
    };

    const handleAddItemClick = () => {
        if (!user) {
            onRequireLogin();
            return;
        }
        setIsFormVisible(true);
    }

    const handleMyStoreClick = () => {
        if (!user) {
            onRequireLogin();
            return;
        }
        setViewMode('SELLER');
    }

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newItem.title || newItem.price <= 0) {
            setError('Please fill in all fields correctly.');
            return;
        }

        if (!user || !user.uid) {
            onRequireLogin();
            return;
        }

        setIsSubmitting(true);
        let imageUrls: string[] = [];

        try {
            if (newItemFiles.length > 0) {
                const uploadPromises = newItemFiles.map((file, index) => 
                    uploadUserFile(user.uid!, file, 'marketplace', '', `Product: ${newItem.title} (${index+1})`)
                );
                const uploadedFiles = await Promise.all(uploadPromises);
                imageUrls = uploadedFiles.map(f => f.file_url);
            } else {
                imageUrls = newItemImagePreviews.length > 0 
                    ? newItemImagePreviews 
                    : ['https://placehold.co/600x400/eeeeee/cccccc?text=No+Image'];
            }

            // Dual input logic check:
            // newItem.location_lat/lng holds the value from either "Auto-Detect" OR "Manual Entry".
            // If the user manually types, it overrides; if they click auto-detect, it fills.
            const finalLat = newItem.location_lat;
            const finalLng = newItem.location_lng;
            
            // Fallback for Location Name to "Accra (Agbogbloshie)" if missing but coords exist
            const finalLocationName = newItem.location_name || (finalLat && finalLng ? "Accra (Agbogbloshie)" : "");

            const newItemData = {
                title: newItem.title,
                price: newItem.price,
                category: newItem.category,
                usage_instructions: newItem.usage_instructions,
                storage_recommendations: newItem.storage_recommendations,
                location_lat: finalLat,
                location_lng: finalLng,
                location_name: finalLocationName,
                image_urls: imageUrls,
                owner_id: user.uid,
                seller_name: user.name || 'Anonymous',
                seller_email: user.email,
                seller_phone: user.phone || '',
                merchant_id: user.merchant_id || null, // Auto-included if user has it
                created_at: new Date().toISOString() // Standardized to created_at
            };

            const { error: dbError } = await supabase.from('marketplace').insert([newItemData]);

            if (dbError) throw dbError;

            setIsFormVisible(false);
            clearNewItemForm();
            
            const successMsg = finalLat && finalLng ? "Listing successfully tagged to the map!" : `${newItem.title} added successfully.`;
            addNotification({ title: 'Item Listed', message: successMsg, type: 'market' });
        } catch (error: any) {
            console.error("Submission Error:", JSON.stringify(error, null, 2));
            setError(`Failed to list item. Error: ${error.message || 'Unknown'}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleOpenEditModal = (item: MarketplaceItem) => {
        setItemToEdit({ ...item }); 
        setIsEditModalVisible(true);
    };
    
    const handleCloseEditModal = () => {
        setIsEditModalVisible(false);
        setItemToEdit(null);
        setError('');
    };
    
    const handleUpdateItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!itemToEdit) return;

        try {
            const { id, likes, userHasLiked, created_at, ...dataToUpdate } = itemToEdit;
            
            const { error } = await supabase
                .from('marketplace')
                .update(dataToUpdate)
                .eq('id', itemToEdit.id);

            if (error) throw error;
            
            handleCloseEditModal();
            addNotification({ title: 'Item Updated', message: `${itemToEdit.title} updated successfully.`, type: 'market' });
        } catch (error) {
            console.error("Error updating item:", error);
            setError("Failed to update item.");
        }
    };

    const handleOpenDeleteModal = (item: MarketplaceItem) => {
        setItemToDelete(item);
        setIsDeleteModalVisible(true);
    };

    const handleCloseDeleteModal = () => {
        setIsDeleteModalVisible(false);
        setItemToDelete(null);
    };

    const handleDeleteItem = async () => {
        if (!itemToDelete) return;
        
        try {
            const { error } = await supabase
                .from('marketplace')
                .delete()
                .eq('id', itemToDelete.id);
            
            if (error) throw error;

            handleCloseDeleteModal();
            addNotification({ title: 'Item Deleted', message: `${itemToDelete.title} has been removed.`, type: 'market' });
        } catch (error) {
            console.error("Error deleting item:", error);
            addNotification({ title: 'Error', message: 'Failed to delete item.', type: 'market' });
        }
    };

    const handleOpenProductChat = (item: MarketplaceItem) => {
        if (!user || !user.uid) {
            onRequireLogin();
            return;
        }

        // Check if seller has disabled messaging
        if (item.messaging_enabled === false) {
             addNotification({ type: 'market', title: 'Seller Unavailable', message: 'This seller has not enabled messaging yet.', view: 'MARKETPLACE' });
             return;
        }

        if (!item.owner_id) {
             addNotification({ type: 'market', title: 'Seller Unavailable', message: 'This seller has not enabled messaging yet.', view: 'MARKETPLACE' });
             return;
        }

        if (item.owner_id === user.uid) {
             addNotification({ type: 'market', title: 'Cannot Chat', message: 'You cannot message yourself.', view: 'MARKETPLACE' });
             return;
        }

        const chatId = String(item.id); 

        setChatContext({
            id: chatId,
            name: item.seller_name,
            subject: item.title,
            participants: [user.uid, item.owner_id],
            receiverId: item.owner_id // Store explicitly for robustness
        });
        setIsChatVisible(true);
    };

    const handleBuyItem = (item: MarketplaceItem) => {
        if (!user) {
            onRequireLogin();
            return;
        }

        if (item.owner_id === user.uid) {
            addNotification({ type: 'market', title: 'Error', message: 'You cannot buy your own item.', view: 'MARKETPLACE' });
            return;
        }

        if (!item.merchant_id) {
            addNotification({ type: 'market', title: 'Unavailable', message: 'This seller has not set up payments yet.', view: 'MARKETPLACE' });
            return;
        }

        // Simulate secure routing logic
        const paymentData = {
            amount: item.price,
            recipient: item.merchant_id,
            item: item.title
        };

        // In a real app, this would route to DigitalWallet with paymentData pre-filled
        // For simulation:
        addNotification({ 
            type: 'wallet', 
            title: 'Payment Initiated', 
            message: `Securely routing GHS ${item.price} to Merchant ${item.merchant_id}... Check Wallet for confirmation.`, 
            view: 'WALLET' 
        });
    };

    const handleOpenOrderChat = (order: SellerOrder) => {
        addNotification({ type: 'market', title: 'Feature Pending', message: 'Messaging from order history coming soon.', view: 'MARKETPLACE' });
    }

    const handleSellerClick = async (e: React.MouseEvent, item: MarketplaceItem) => {
        e.stopPropagation();
        setIsLoadingSeller(true);
        setIsSellerProfileOpen(true);
        
        let sellerInfo: Partial<User> = {
            name: item.seller_name,
            email: item.seller_email,
            phone: item.seller_phone,
            type: 'seller'
        };

        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('name', item.seller_name)
                .single();

            if (data) {
                sellerInfo = { ...sellerInfo, ...data };
            }
        } catch (err) {
            console.error("Error fetching seller profile:", err);
        } finally {
            setViewingSeller(sellerInfo);
            setIsLoadingSeller(false);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentMessage.trim() || !chatContext) return;

        setIsSending(true);

        // 1. Get the current logged-in user securely
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();

        if (authError || !currentUser) {
            addNotification({ type: 'market', title: 'Authentication Error', message: 'Please log in again.', view: 'MARKETPLACE' });
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
            setError("Error: Item ID is missing.");
            setIsSending(false);
            return;
        }
        if (!receiverId) {
            console.error("Missing Receiver ID.");
            setError("Cannot determine receiver. The item owner ID might be missing.");
            setIsSending(false);
            return;
        }

        try {
            const { error } = await supabase
                .from('chats')
                .insert([{
                    sender_id: currentUser.id,
                    receiver_id: receiverId,
                    item_id: String(chatContext.id), // Ensure string format matching DB text type
                    message_text: currentMessage.trim()
                }]);

            if (error) throw error;

            setCurrentMessage('');
        } catch (err: any) {
            console.error("Chat Error:", err.message);
            setError("Failed to send message. Please try again.");
        } finally {
            setIsSending(false);
        }
    };

    const handleToggleLike = async (item: MarketplaceItem, e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (!user || !user.uid) {
            onRequireLogin();
            return;
        }

        const isCurrentlyLiked = item.userHasLiked;
        const newLikeStatus = !isCurrentlyLiked;
        const newCount = (item.likes || 0) + (newLikeStatus ? 1 : -1);

        setMarketplaceItems(prevItems => prevItems.map(i => 
            i.id === item.id 
                ? { ...i, userHasLiked: newLikeStatus, likes: newCount } 
                : i
        ));

        try {
            if (newLikeStatus) {
                const { error } = await supabase
                    .from('marketplace_likes')
                    .insert({ item_id: item.id, user_id: user.uid });
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('marketplace_likes')
                    .delete()
                    .eq('item_id', item.id)
                    .eq('user_id', user.uid);
                if (error) throw error;
            }
        } catch (error) {
            console.error("Error toggling like:", JSON.stringify(error));
            setMarketplaceItems(prevItems => prevItems.map(i => 
                i.id === item.id 
                    ? { ...i, userHasLiked: isCurrentlyLiked, likes: item.likes } 
                    : i
            ));
            addNotification({ type: 'market', title: 'Error', message: 'Could not update like status.', view: 'MARKETPLACE' });
        }
    };

    const getFilteredItems = () => {
        return marketplaceItems.filter(item => {
            if (selectedCategory !== 'All' && item.category !== selectedCategory) {
                return false;
            }
            if (searchTerm) {
                const lowerSearch = searchTerm.toLowerCase();
                const nameMatch = item.title.toLowerCase().includes(lowerSearch);
                const sellerMatch = item.seller_name.toLowerCase().includes(lowerSearch);
                if (!nameMatch && !sellerMatch) {
                    return false;
                }
            }
            return true;
        });
    };

    const sortedItems = [...getFilteredItems()].sort((a, b) => {
        switch (sortOption) {
            case 'Price: Low to High':
                return a.price - b.price;
            case 'Price: High to Low':
                return b.price - a.price;
            case 'Name: A-Z':
                return a.title.localeCompare(b.title);
            case 'Newest':
            default:
                if (a.created_at && b.created_at) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                return 0; 
        }
    });

    const nextImage = (itemIds: string, totalImages: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if(totalImages <= 1) return;
        setCurrentImageIndex((prev) => (prev + 1) % totalImages);
    };

    const prevImage = (itemIds: string, totalImages: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if(totalImages <= 1) return;
        setCurrentImageIndex((prev) => (prev - 1 + totalImages) % totalImages);
    };

    const getDisplayImage = (item: MarketplaceItem) => {
        if (expandedItemId === item.id && item.image_urls && item.image_urls.length > 0) {
            return item.image_urls[currentImageIndex];
        }
        return item.image_urls?.[0];
    }

    const canManageItem = (item: MarketplaceItem) => {
        if (!user) return false;
        return user.type === 'admin' || item.owner_id === user.uid || (item.seller_name === user.name && !item.owner_id);
    }

    const myKeyListings = marketplaceItems.filter(item => item.owner_id === user?.uid || item.seller_name === (user?.name || 'Agro Ghana Ltd.'));

    return (
        <>
             {isSellerProfileOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-md animate-fade-in">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-bold text-gray-800">Seller Profile</h3>
                            <button onClick={() => setIsSellerProfileOpen(false)} className="text-gray-500 hover:text-gray-800">
                                <XIcon className="w-6 h-6" />
                            </button>
                        </div>
                        {isLoadingSeller ? (
                            <div className="flex justify-center py-8">
                                <Spinner />
                            </div>
                        ) : viewingSeller ? (
                            <div className="flex flex-col items-center text-center">
                                <div className="w-24 h-24 rounded-full border-4 border-gray-100 overflow-hidden mb-3 shadow-sm">
                                    {viewingSeller.photo_url ? (
                                        <img src={viewingSeller.photo_url} alt={viewingSeller.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400">
                                            <UserCircleIcon className="w-16 h-16" />
                                        </div>
                                    )}
                                </div>
                                <h4 className="text-lg font-bold text-gray-900 flex items-center gap-1">
                                    {viewingSeller.name}
                                    {viewingSeller.merchant_id && (
                                        <span title="Verified Merchant">
                                            <ShieldCheckIcon className="w-4 h-4 text-blue-500" />
                                        </span>
                                    )}
                                </h4>
                                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-medium uppercase mb-4">
                                    {viewingSeller.type || 'Seller'}
                                </span>
                                <div className="w-full space-y-3 text-left bg-gray-50 p-4 rounded-lg border border-gray-100">
                                    <div className="flex items-center gap-3">
                                        <MailIcon className="w-5 h-5 text-gray-400" />
                                        <span className="text-sm text-gray-700 break-all">{viewingSeller.email || 'No email provided'}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <PhoneIcon className="w-5 h-5 text-gray-400" />
                                        <span className="text-sm text-gray-700">{viewingSeller.phone || 'No phone provided'}</span>
                                    </div>
                                    {viewingSeller.merchant_id && (
                                        <div className="flex items-center gap-3">
                                            <TagIcon className="w-5 h-5 text-gray-400" />
                                            <span className="text-sm text-gray-700">Merchant ID: {viewingSeller.merchant_id}</span>
                                        </div>
                                    )}
                                </div>
                                <Button onClick={() => setIsSellerProfileOpen(false)} className="w-full mt-6">Close</Button>
                            </div>
                        ) : (
                            <p className="text-center text-gray-500">Could not load seller info.</p>
                        )}
                    </Card>
                </div>
             )}

             {isFormVisible && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-gray-800">Add New Listing</h3>
                            <button onClick={() => setIsFormVisible(false)} className="text-gray-500 hover:text-gray-800">
                                <XIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <form onSubmit={handleAddItem}>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input type="text" name="title" placeholder="Item Name" value={newItem.title} onChange={(e) => handleInputChange(e)} required className="mt-1 block w-full px-3 py-3 text-base font-medium text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                                <select name="category" value={newItem.category} onChange={(e) => handleInputChange(e)} className="mt-1 block w-full pl-3 pr-10 py-3 text-base font-medium text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                                    {categories.filter(c => c.name !== 'All').map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                                <input type="number" name="price" placeholder="Price (GHS)" value={newItem.price} onChange={(e) => handleInputChange(e)} required className="mt-1 block w-full px-3 py-3 text-base font-medium text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                                
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Item Location</label>
                                    
                                    <div className="flex flex-col gap-3">
                                        <div className="flex gap-2">
                                             <button 
                                                type="button" 
                                                onClick={handleUseMyLocation}
                                                className="w-full md:w-auto px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 border border-blue-200 font-medium text-sm flex items-center justify-center whitespace-nowrap mb-1"
                                            >
                                                <GridIcon className="w-4 h-4 mr-2" />
                                                Auto-Detect Location
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <input 
                                                    type="number" 
                                                    step="any"
                                                    name="location_lat" 
                                                    placeholder="Latitude (e.g. 5.6037)" 
                                                    value={newItem.location_lat ?? ''} 
                                                    onChange={(e) => handleInputChange(e)} 
                                                    className="w-full px-3 py-3 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                                />
                                            </div>
                                            <div>
                                                <input 
                                                    type="number" 
                                                    step="any"
                                                    name="location_lng" 
                                                    placeholder="Longitude (e.g. -0.1870)" 
                                                    value={newItem.location_lng ?? ''} 
                                                    onChange={(e) => handleInputChange(e)} 
                                                    className="w-full px-3 py-3 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                                />
                                            </div>
                                        </div>
                                        <input 
                                            type="text" 
                                            name="location_name" 
                                            placeholder="Location Name (e.g. Makola Market, Accra)" 
                                            value={newItem.location_name || ''} 
                                            onChange={(e) => handleInputChange(e)} 
                                            className="w-full px-3 py-3 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                        />
                                        <p className="text-xs text-gray-500">
                                            Coordinates are automatically filled if you allow location access, or you can enter them manually.
                                        </p>
                                    </div>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Usage Instructions (Optional)</label>
                                    <textarea name="usage_instructions" value={newItem.usage_instructions || ''} onChange={(e) => handleInputChange(e)} rows={2} className="w-full px-3 py-3 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Storage Recommendations (Optional)</label>
                                    <textarea name="storage_recommendations" value={newItem.storage_recommendations || ''} onChange={(e) => handleInputChange(e)} rows={2} className="w-full px-3 py-3 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Product Images</label>
                                    <input type="file" ref={fileInputRef} onChange={(e) => handleImageChange(e)} accept="image/*" multiple className="hidden" />
                                    <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                                        <UploadIcon className="w-5 h-5 mr-2 text-gray-500" />
                                        Add Images
                                    </button>
                                    {newItemImagePreviews.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {newItemImagePreviews.map((preview, index) => (
                                                <div key={index} className="relative">
                                                    <img src={preview} alt={`Preview ${index + 1}`} className="h-16 w-16 object-cover rounded-md" />
                                                    <button type="button" onClick={() => handleRemovePreviewImage(index)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5">
                                                        <XIcon className="w-3 h-3"/>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                            <Button type="submit" className="mt-4 w-full" isLoading={isSubmitting}>
                                {isSubmitting ? 'Uploading...' : 'Add Item'}
                            </Button>
                        </form>
                    </Card>
                </div>
            )}
            
            {/* Edit and Delete Modals ommitted for brevity, structure remains same */}
            {isEditModalVisible && itemToEdit && (
                 <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-gray-800">Edit Item</h3>
                            <button onClick={handleCloseEditModal} className="text-gray-500 hover:text-gray-800">
                                <XIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateItem}>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Item Name</label>
                                    <input type="text" name="title" value={itemToEdit.title} onChange={(e) => handleInputChange(e, true)} required className="mt-1 block w-full px-3 py-3 text-base font-medium text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Price (GHS)</label>
                                    <input type="number" name="price" value={itemToEdit.price} onChange={(e) => handleInputChange(e, true)} required className="mt-1 block w-full px-3 py-3 text-base font-medium text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <Button onClick={handleCloseEditModal} className="bg-gray-200 hover:bg-gray-300 !text-gray-900">Cancel</Button>
                                <Button type="submit">Save Changes</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {isDeleteModalVisible && itemToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-md">
                        <div className="flex flex-col items-center text-center p-4">
                            <div className="bg-red-100 p-3 rounded-full mb-4">
                                <TrashIcon className="w-8 h-8 text-red-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Confirm Deletion</h3>
                            <p className="text-gray-600 mb-6">
                                Are you sure you want to delete <span className="font-semibold text-gray-800">{itemToDelete.title}</span>? This action cannot be undone.
                            </p>
                            <div className="flex w-full gap-3">
                                <Button onClick={handleCloseDeleteModal} className="w-full bg-gray-200 hover:bg-gray-300 !text-gray-900">Cancel</Button>
                                <Button onClick={handleDeleteItem} className="w-full bg-red-600 hover:bg-red-700 text-white">Delete Item</Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {isChatVisible && chatContext && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-md flex flex-col h-[70vh]">
                        <div className="p-4 border-b flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-lg text-gray-800">Chat with {chatContext.name}</h3>
                                <p className="text-sm text-gray-500">Regarding: {chatContext.subject}</p>
                            </div>
                            <button onClick={() => setIsChatVisible(false)} className="text-gray-500 hover:text-gray-800">
                                <XIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="flex-grow p-4 overflow-y-auto bg-gray-50 space-y-4">
                            {messages.length > 0 ? messages.map((msg, index) => (
                                <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-xs lg:max-w-md p-3 rounded-lg ${msg.sender === 'user' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-800'}`}>
                                        <p>{msg.text}</p>
                                        <p className={`text-xs mt-1 ${msg.sender === 'user' ? 'text-green-100' : 'text-gray-500'} text-right`}>{msg.timestamp}</p>
                                    </div>
                                </div>
                            )) : (
                                <p className="text-center text-gray-500 mt-10">Start a conversation about this item!</p>
                            )}
                                <div ref={chatEndRef} />
                        </div>
                        <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2">
                            <input 
                                type="text"
                                value={currentMessage}
                                onChange={(e) => setCurrentMessage(e.target.value)}
                                placeholder="Type your message..."
                                className="flex-grow mt-1 block w-full px-3 py-3 text-base font-medium text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <Button type="submit" className="px-4" isLoading={isSending}>Send</Button>
                        </form>
                    </div>
                </div>
            )}
            
            {viewMode === 'SELLER' ? (
                 <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-gray-800">My Listings</h2>
                         <div className="flex gap-2">
                             <Button onClick={() => setViewMode('BUYER')} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Switch to Buy</Button>
                             <Button onClick={handleAddItemClick}><PlusIcon className="w-5 h-5 mr-2"/> Add Item</Button>
                         </div>
                    </div>
                     <Card>
                         <div className="space-y-3 max-h-96 overflow-y-auto">
                                {loadingItems ? (
                                    <p className="text-sm text-gray-500 text-center py-4">Loading listings...</p>
                                ) : myKeyListings.length > 0 ? (
                                    myKeyListings.map(item => (
                                        <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                                            <div className="flex items-center gap-3">
                                                <img src={item.image_urls?.[0] || 'https://placehold.co/50'} alt={item.title} className="w-10 h-10 rounded object-cover" />
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                                                    <p className="text-xs text-gray-500">GHS {item.price.toFixed(2)}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleOpenEditModal(item)} className="text-gray-400 hover:text-blue-600">
                                                    <PencilIcon className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleOpenDeleteModal(item)} className="text-gray-400 hover:text-red-600">
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-gray-500 text-center py-4">No listings found.</p>
                                )}
                        </div>
                     </Card>
                 </div>
            ) : (
                <div className="space-y-6">
                     <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div>
                            <h2 className="text-2xl font-bold text-green-800 flex items-center gap-2">
                                <ShoppingCartIcon className="w-8 h-8" />
                                Marketplace
                            </h2>
                            <p className="text-gray-600">Buy and sell agricultural products.</p>
                        </div>
                        <div className="flex gap-2">
                             {/* Check user type but default show if not logged in so they click and get prompt */}
                             {(!user || user.type !== 'buyer') && (
                                <Button onClick={handleMyStoreClick} className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap">
                                    My Store
                                </Button>
                             )}
                             <Button onClick={handleAddItemClick} className="bg-green-600 hover:bg-green-700 whitespace-nowrap">
                                <PlusIcon className="w-5 h-5 mr-2" /> Sell Item
                             </Button>
                        </div>
                     </div>

                     <div className="flex flex-col md:flex-row gap-4">
                         {/* Search bar code same as before */}
                         <div className="relative flex-grow">
                             <input 
                                type="text" 
                                placeholder="Search seeds, tools, fertilizers..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                             />
                             <div className="absolute left-3 top-3.5 text-gray-400">
                                 <SearchIcon className="w-5 h-5" />
                             </div>
                         </div>
                         <div className="flex gap-2">
                             <div className="relative" ref={filterRef}>
                                 <button 
                                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                                    className="px-4 py-3 border border-gray-300 rounded-lg bg-white flex items-center gap-2 hover:bg-gray-50 text-gray-700 font-medium"
                                 >
                                     <GridIcon className="w-5 h-5" />
                                     {selectedCategory === 'All' ? 'Categories' : selectedCategory}
                                     <ChevronDownIcon className="w-4 h-4 ml-1" />
                                 </button>
                                 {isFilterOpen && (
                                     <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-20 py-1">
                                         {categories.map(cat => (
                                             <button 
                                                key={cat.name}
                                                onClick={() => handleCategoryChange(cat.name)}
                                                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2 ${selectedCategory === cat.name ? 'text-green-600 font-bold' : 'text-gray-700'}`}
                                             >
                                                 {cat.icon}
                                                 {cat.name}
                                             </button>
                                         ))}
                                     </div>
                                 )}
                             </div>
                             <select 
                                value={sortOption}
                                onChange={(e) => setSortOption(e.target.value)}
                                className="px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-700 font-medium outline-none focus:ring-2 focus:ring-green-500"
                             >
                                 <option>Newest</option>
                                 <option>Price: Low to High</option>
                                 <option>Price: High to Low</option>
                                 <option>Name: A-Z</option>
                             </select>
                             <div className="flex rounded-lg border border-gray-300 bg-white overflow-hidden">
                                 <button 
                                    onClick={() => setDisplayFormat('GRID')}
                                    className={`px-3 py-2 ${displayFormat === 'GRID' ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-50'}`}
                                    title="Grid View"
                                 >
                                     <GridIcon className="w-5 h-5" />
                                 </button>
                                 <button 
                                    onClick={() => setDisplayFormat('MAP')}
                                    className={`px-3 py-2 ${displayFormat === 'MAP' ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-50'}`}
                                    title="Map View"
                                 >
                                     {/* Map Icon - reusing TagIcon for now or similar */}
                                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                     </svg>
                                 </button>
                             </div>
                         </div>
                     </div>

                     <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                         {categories.map(cat => (
                             <button
                                key={cat.name}
                                onClick={() => setSelectedCategory(cat.name)}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === cat.name ? 'bg-green-600 text-white shadow-md' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                             >
                                 {cat.name}
                             </button>
                         ))}
                     </div>
                     
                     {/* Map View */}
                     <div className={`transition-all duration-300 ${displayFormat === 'MAP' ? 'block' : 'hidden'}`}>
                         <div id="marketplace-map" style={{ height: '500px', width: '100%', borderRadius: '0.75rem', zIndex: 0 }} className="border border-gray-300 shadow-sm"></div>
                     </div>

                     {/* Grid View */}
                     <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 transition-all duration-300 ${displayFormat === 'GRID' ? 'block' : 'hidden'}`}>
                                {loadingItems ? (
                                    <div className="col-span-full flex justify-center py-20">
                                        <Spinner className="w-10 h-10 text-green-600" />
                                    </div>
                                ) : sortedItems.length === 0 ? (
                                    <div className="col-span-full text-center py-20 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                                        <ShoppingCartIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                        <p className="text-gray-500 font-medium">No items found matching your criteria.</p>
                                        <button onClick={() => { setSearchTerm(''); setSelectedCategory('All'); }} className="mt-2 text-green-600 hover:underline">Clear Filters</button>
                                    </div>
                                ) : (
                                    sortedItems.map(item => (
                                    <Card key={item.id} className="flex flex-col h-full overflow-hidden hover:shadow-lg transition-shadow">
                                         {/* Card content structure same as before */}
                                         <div className="relative h-48 -mx-6 -mt-6 mb-4 bg-gray-100 group">
                                            {canManageItem(item) && (
                                                <div className="absolute top-2 left-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={(e) => { e.stopPropagation(); handleOpenEditModal(item); }} className="bg-white/90 p-1.5 rounded-full text-gray-600 hover:text-blue-600 shadow-sm"><PencilIcon className="w-4 h-4" /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleOpenDeleteModal(item); }} className="bg-white/90 p-1.5 rounded-full text-gray-600 hover:text-red-600 shadow-sm"><TrashIcon className="w-4 h-4" /></button>
                                                </div>
                                            )}
                                            
                                            <button 
                                                onClick={(e) => handleToggleLike(item, e)}
                                                className={`absolute top-2 right-2 z-10 bg-white/90 p-1.5 rounded-full shadow-md transition-colors ${item.userHasLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}
                                                title={item.userHasLiked ? "Unlike" : "Like"}
                                            >
                                                <HeartIcon className="w-5 h-5" filled={item.userHasLiked} />
                                            </button>

                                            {(item.image_urls?.length || 0) > 1 && expandedItemId === item.id && (
                                                <>
                                                    <button onClick={(e) => prevImage(item.id, item.image_urls!.length, e)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-1 rounded-full z-10"><ArrowLeftIcon className="w-4 h-4" /></button>
                                                    <button onClick={(e) => nextImage(item.id, item.image_urls!.length, e)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-1 rounded-full z-10"><ArrowRightIcon className="w-4 h-4" /></button>
                                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                                                        {item.image_urls!.map((_, idx) => (
                                                            <div key={idx} className={`w-1.5 h-1.5 rounded-full ${idx === currentImageIndex ? 'bg-white' : 'bg-white/50'}`}></div>
                                                        ))}
                                                    </div>
                                                </>
                                            )}

                                            <img 
                                                src={getDisplayImage(item) || 'https://placehold.co/600x400'} 
                                                alt={item.title} 
                                                className="w-full h-full object-cover cursor-pointer"
                                                onClick={() => handleToggleDetails(item.id)}
                                            />
                                         </div>
                                         <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="font-bold text-lg text-gray-900 line-clamp-1">{item.title}</h3>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm text-blue-600 hover:underline cursor-pointer font-medium" onClick={(e) => handleSellerClick(e, item)}>{item.seller_name}</p>
                                                    
                                                    {/* Verified Merchant Badge */}
                                                    {item.merchant_id && (
                                                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold border border-blue-200" title={`Verified Merchant ID: ${item.merchant_id}`}>
                                                            <ShieldCheckIcon className="w-3 h-3" />
                                                            VERIFIED
                                                        </span>
                                                    )}

                                                    {(item.likes || 0) > 0 && (
                                                        <span className="text-xs text-red-500 font-medium flex items-center gap-0.5">
                                                            <HeartIcon className="w-3 h-3" filled={true} /> {item.likes}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="font-bold text-lg text-green-700 whitespace-nowrap">GHS {item.price.toFixed(2)}</p>
                                        </div>
                                         {expandedItemId === item.id && (
                                            <div className="mt-2 mb-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-md animate-fade-in">
                                                <p className="mb-2"><strong>Usage:</strong> {item.usage_instructions || 'No instructions'}</p>
                                                <p className="mb-2"><strong>Storage:</strong> {item.storage_recommendations || 'No recommendations'}</p>
                                                {(item.seller_phone || item.seller_email) && (
                                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                                        <p className="text-xs font-bold text-gray-500 uppercase mb-2">Seller Contact Info</p>
                                                        <div className="flex flex-col sm:flex-row gap-3">
                                                            {item.seller_phone && (
                                                                <div className="flex items-center gap-2">
                                                                    <PhoneIcon className="w-4 h-4 text-green-600" />
                                                                    <span className="font-medium text-gray-800">{item.seller_phone}</span>
                                                                </div>
                                                            )}
                                                            {item.seller_email && (
                                                                <div className="flex items-center gap-2">
                                                                    <MailIcon className="w-4 h-4 text-blue-600" />
                                                                    <span className="font-medium text-gray-800">{item.seller_email}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div className="mt-auto pt-4 flex gap-2">
                                            <Button onClick={() => handleToggleDetails(item.id)} className="flex-1 bg-gray-200 hover:bg-gray-300 !text-gray-900 text-xs py-2">
                                                {expandedItemId === item.id ? 'Less Info' : 'Details'}
                                            </Button>
                                            
                                            {/* Buy Now Button - Routes payment automatically if merchant exists */}
                                            {item.merchant_id ? (
                                                <Button onClick={() => handleBuyItem(item)} className="flex-1 bg-green-700 hover:bg-green-800 text-xs py-2 shadow-sm font-bold">
                                                    <CreditCardIcon className="w-4 h-4 mr-1 inline" /> Buy Now
                                                </Button>
                                            ) : (
                                                <Button onClick={() => handleOpenProductChat(item)} className="flex-1 bg-orange-600 hover:bg-orange-700 text-xs py-2">
                                                    <MessageSquareIcon className="w-4 h-4 mr-1 inline" /> Contact
                                                </Button>
                                            )}
                                        </div>
                                    </Card>
                                    ))
                                )}
                      </div>
                </div>
            )}
        </>
    );
};

export default Marketplace;
