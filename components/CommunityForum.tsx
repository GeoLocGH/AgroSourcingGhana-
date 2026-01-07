
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { ForumPost, ForumReply, User } from '../types';
import Card from './common/Card';
import Button from './common/Button';
import { ArrowLeftIcon, PlusIcon, PaperClipIcon, TrashIcon, XIcon, UploadIcon, MessageSquareIcon } from './common/icons';
import { fileToDataUri } from '../utils';
import { uploadUserFile } from '../services/storageService';
import { supabase } from '../services/supabase';

interface CommunityForumProps {
    user: User | null;
}

const CommunityForum: React.FC<CommunityForumProps> = ({ user }) => {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [view, setView] = useState<'LIST' | 'POST' | 'CREATE'>('LIST');
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostFiles, setNewPostFiles] = useState<File[]>([]);
  const [newPostPreviews, setNewPostPreviews] = useState<string[]>([]);
  
  const [newReplyContent, setNewReplyContent] = useState('');
  const [newReplyFiles, setNewReplyFiles] = useState<File[]>([]);
  const [newReplyPreviews, setNewReplyPreviews] = useState<string[]>([]);
  
  const [isDragging, setIsDragging] = useState(false);
  const postFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  // Fetch posts from Supabase
  useEffect(() => {
    const fetchPosts = async () => {
        const { data, error } = await supabase
            .from('forum_posts')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (data) {
             // Map backend data to frontend types (replies might be JSONB)
             const mappedPosts = data.map((p: any) => ({
                 ...p,
                 // Ensure replies is array
                 replies: p.replies || [] 
             }));
             setPosts(mappedPosts);
        }
    };

    fetchPosts();

    const sub = supabase.channel('forum').on('postgres_changes', { event: '*', schema: 'public', table: 'forum_posts' }, fetchPosts).subscribe();
    return () => { sub.unsubscribe(); };
  }, []);

  const selectedPost = useMemo(() => {
    if (view !== 'POST' || !selectedPostId) return null;
    return posts.find(p => p.id === selectedPostId);
  }, [view, selectedPostId, posts]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostTitle.trim() || !newPostContent.trim()) return;
    
    setIsSubmitting(true);
    setError('');
    let uploadedUrls: string[] = [];

    try {
        if (user && user.uid && newPostFiles.length > 0) {
            const uploadPromises = newPostFiles.map((file, index) => 
                uploadUserFile(user.uid!, file, 'forum', '', `Post: ${newPostTitle} (${index + 1})`)
            );
            const results = await Promise.all(uploadPromises);
            uploadedUrls = results.map(f => f.file_url);
        }

        const newPostData = {
            // Let Supabase generate ID usually, but if using number ID on frontend, maybe use timestamp
            // id: Date.now(), // Supabase identity column handles this
            author: user?.name || 'Guest Farmer', 
            // Important: Add user_id if available to satisfy typical RLS policies
            user_id: user?.uid || null,
            created_at: new Date().toISOString(), // Use ISO string for DB
            title: newPostTitle,
            content: newPostContent,
            image_url: uploadedUrls.length > 0 ? uploadedUrls[0] : null,
            images: uploadedUrls,
            replies: [],
        };
        
        const { error } = await supabase.from('forum_posts').insert([newPostData]);
        if (error) throw error;
        
        // setPosts handled by realtime subscription or optimistic update could be added here
        setView('LIST');
        setNewPostTitle(''); setNewPostContent(''); setNewPostFiles([]); setNewPostPreviews([]);
    } catch (err: any) {
        console.error("Error creating post:", err);
        // Extract message from Supabase error object or standard Error object
        const msg = err.message || err.details || JSON.stringify(err);
        setError(`Failed to create post: ${msg}`);
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleAddReply = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newReplyContent.trim() || !selectedPostId || !selectedPost) return;
      
      setIsSubmitting(true);
      setError('');
      let uploadedUrls: string[] = [];

      try {
          if (user && user.uid && newReplyFiles.length > 0) {
             const uploadPromises = newReplyFiles.map((file, index) => 
                uploadUserFile(user.uid!, file, 'forum', '', `Reply to Post #${selectedPostId}`)
             );
             const results = await Promise.all(uploadPromises);
             uploadedUrls = results.map(f => f.file_url);
          }

          const newReply: ForumReply = {
              id: Date.now(),
              author: user?.name || 'Guest Farmer',
              created_at: new Date().toISOString(),
              content: newReplyContent,
              image_url: uploadedUrls.length > 0 ? uploadedUrls[0] : undefined,
              images: uploadedUrls
          };

          const updatedReplies = [...selectedPost.replies, newReply];
          
          const { error } = await supabase
            .from('forum_posts')
            .update({ replies: updatedReplies })
            .eq('id', selectedPostId);

          if (error) throw error;

          setNewReplyContent(''); setNewReplyFiles([]); setNewReplyPreviews([]);
      } catch (err: any) {
          console.error("Error adding reply:", err);
          const msg = err.message || err.details || JSON.stringify(err);
          setError(`Failed to add reply: ${msg}`);
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleDeletePost = async (postId: number) => {
      if (!window.confirm("Delete post?")) return;
      try {
          await supabase.from('forum_posts').delete().eq('id', postId);
          if (selectedPostId === postId) setView('LIST');
      } catch(e) { console.error(e); }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'post' | 'reply') => {
      if (e.target.files && e.target.files.length > 0) {
          const files: File[] = Array.from(e.target.files);
          const previews = await Promise.all(files.map(f => fileToDataUri(f)));
          if (type === 'post') {
              setNewPostFiles([...newPostFiles, ...files]);
              setNewPostPreviews([...newPostPreviews, ...previews]);
          } else {
              setNewReplyFiles([...newReplyFiles, ...files]);
              setNewReplyPreviews([...newReplyPreviews, ...previews]);
          }
      }
  };

  return (
    <Card>
        {/* UI Structure mirrors previous component. View Switching logic */}
        {view === 'LIST' && (
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-green-700">Community Forum</h2>
                    <Button onClick={() => setView('CREATE')}>New Post</Button>
                </div>
                <div className="space-y-4">
                    {posts.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">No discussions yet. Be the first to post!</p>
                    ) : (
                        posts.map(post => (
                            <div key={post.id} className="relative">
                                <Card onClick={() => { setSelectedPostId(post.id); setView('POST'); }} className="cursor-pointer hover:bg-gray-50 transition-colors">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-bold text-lg text-gray-800">{post.title}</h3>
                                            <p className="text-sm text-gray-500 mt-1">By <span className="font-medium text-green-700">{post.author}</span> • {new Date(post.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <div className="flex items-center gap-1 text-gray-400">
                                            <MessageSquareIcon className="w-4 h-4" />
                                            <span className="text-xs">{post.replies?.length || 0}</span>
                                        </div>
                                    </div>
                                    {post.image_url && (
                                        <div className="mt-3 h-32 w-full bg-gray-100 rounded-md overflow-hidden">
                                            <img src={post.image_url} alt="Post Attachment" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                </Card>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )}
        
        {view === 'POST' && selectedPost && (
            <div>
                 <Button onClick={() => setView('LIST')} className="mb-4 bg-gray-200 text-gray-800 hover:bg-gray-300">
                    <ArrowLeftIcon className="w-4 h-4 mr-2 inline" /> Back
                 </Button>
                 
                 <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedPost.title}</h2>
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 border-b pb-4">
                        <span className="font-medium text-green-700">{selectedPost.author}</span>
                        <span>•</span>
                        <span>{new Date(selectedPost.created_at).toLocaleString()}</span>
                    </div>
                    
                    <p className="text-gray-800 whitespace-pre-wrap leading-relaxed mb-4">{selectedPost.content}</p>
                    
                    {selectedPost.images && selectedPost.images.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
                            {selectedPost.images.map((img, idx) => (
                                <img key={idx} src={img} alt={`Attachment ${idx}`} className="rounded-lg border border-gray-200 w-full h-48 object-cover" />
                            ))}
                        </div>
                    )}
                 </div>
                 
                 {/* Replies */}
                 <div className="mt-8 bg-gray-50 p-4 rounded-xl">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <MessageSquareIcon className="w-5 h-5" />
                        Replies ({selectedPost.replies.length})
                    </h3>
                    
                    <div className="space-y-4 mb-6">
                        {selectedPost.replies.length === 0 ? (
                            <p className="text-gray-500 italic">No replies yet.</p>
                        ) : (
                            selectedPost.replies.map((r, idx) => (
                                <div key={idx} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                                    <div className="flex justify-between mb-2">
                                        <span className="font-bold text-sm text-gray-900">{r.author}</span>
                                        <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <p className="text-gray-700 text-sm">{r.content}</p>
                                    {r.images && r.images.length > 0 && (
                                        <div className="flex gap-2 mt-2">
                                            {r.images.map((img, i) => (
                                                <img key={i} src={img} className="w-16 h-16 rounded object-cover border" alt="Reply attachment" />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                 
                    {/* Add Reply Form */}
                    <form onSubmit={handleAddReply} className="border-t pt-4">
                        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
                        <textarea 
                            value={newReplyContent} 
                            onChange={e => setNewReplyContent(e.target.value)} 
                            className="w-full border p-3 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-green-500 outline-none mb-2" 
                            placeholder="Write a helpful reply..." 
                            rows={3}
                        />
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={() => replyFileInputRef.current?.click()} className="text-gray-500 hover:text-green-600 p-2 rounded-full hover:bg-gray-100">
                                    <PaperClipIcon className="w-5 h-5" />
                                </button>
                                <input type="file" multiple ref={replyFileInputRef} onChange={e => handleImageChange(e, 'reply')} className="hidden" />
                                {newReplyPreviews.length > 0 && <span className="text-xs text-green-600">{newReplyPreviews.length} image(s) attached</span>}
                            </div>
                            <Button type="submit" isLoading={isSubmitting} disabled={!newReplyContent.trim()}>Post Reply</Button>
                        </div>
                    </form>
                 </div>
            </div>
        )}

        {view === 'CREATE' && (
            <form onSubmit={handleCreatePost}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800">Start a Discussion</h2>
                    <button type="button" onClick={() => setView('LIST')} className="text-gray-400 hover:text-gray-600">
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>
                
                {error && (
                    <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                        <input 
                            value={newPostTitle} 
                            onChange={e => setNewPostTitle(e.target.value)} 
                            className="w-full border p-3 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-green-500 outline-none" 
                            placeholder="What's your question or topic?" 
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                        <textarea 
                            value={newPostContent} 
                            onChange={e => setNewPostContent(e.target.value)} 
                            className="w-full border p-3 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-green-500 outline-none min-h-[150px]" 
                            placeholder="Describe your issue, share knowledge, or ask the community..." 
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Attachments</label>
                        <div className="flex items-center gap-4">
                            <button 
                                type="button" 
                                onClick={() => postFileInputRef.current?.click()} 
                                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-gray-700 font-medium"
                            >
                                <UploadIcon className="w-5 h-5" />
                                Add Photos
                            </button>
                            <input type="file" multiple ref={postFileInputRef} onChange={e => handleImageChange(e, 'post')} className="hidden" accept="image/*" />
                        </div>
                        
                        {newPostPreviews.length > 0 && (
                            <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
                                {newPostPreviews.map((preview, idx) => (
                                    <div key={idx} className="relative flex-shrink-0 w-20 h-20">
                                        <img src={preview} alt="Preview" className="w-full h-full object-cover rounded-md border" />
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                setNewPostPreviews(prev => prev.filter((_, i) => i !== idx));
                                                setNewPostFiles(prev => prev.filter((_, i) => i !== idx));
                                            }}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-sm"
                                        >
                                            <XIcon className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button type="submit" isLoading={isSubmitting} className="flex-1">Post to Forum</Button>
                        <Button onClick={() => setView('LIST')} className="flex-1 bg-gray-200 text-gray-800 hover:bg-gray-300">Cancel</Button>
                    </div>
                </div>
            </form>
        )}
    </Card>
  );
};

export default CommunityForum;
