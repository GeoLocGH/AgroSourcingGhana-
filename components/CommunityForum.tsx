
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { ForumPost, ForumReply, User } from '../types';
import Card from './common/Card';
import Button from './common/Button';
import { ArrowLeftIcon, PlusIcon, PaperClipIcon, TrashIcon, XIcon, UploadIcon, MessageSquareIcon, UserCircleIcon } from './common/icons';
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
  
  // Image Magnification State
  const [magnifiedImage, setMagnifiedImage] = useState<string | null>(null);

  // Form states
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostFiles, setNewPostFiles] = useState<File[]>([]);
  const [newPostPreviews, setNewPostPreviews] = useState<string[]>([]);
  
  const [newReplyContent, setNewReplyContent] = useState('');
  const [newReplyFiles, setNewReplyFiles] = useState<File[]>([]);
  const [newReplyPreviews, setNewReplyPreviews] = useState<string[]>([]);
  
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
            author: user?.name || 'Guest Farmer', 
            user_id: user?.uid || null,
            created_at: new Date().toISOString(),
            title: newPostTitle,
            content: newPostContent,
            images: uploadedUrls,
            image_url: uploadedUrls.length > 0 ? uploadedUrls[0] : null, // Backward compatibility
            replies: [],
        };
        
        const { error } = await supabase.from('forum_posts').insert([newPostData]);
        if (error) throw error;
        
        setView('LIST');
        setNewPostTitle(''); setNewPostContent(''); setNewPostFiles([]); setNewPostPreviews([]);
    } catch (err: any) {
        console.error("Error creating post:", err);
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

  const isOwner = (post: ForumPost) => {
      return user?.uid && (post.user_id === user.uid || post.author === user.name);
  };

  return (
    <Card>
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
                                        <div className="flex items-center gap-2">
                                            {isOwner(post) && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDeletePost(post.id); }}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50"
                                                    title="Delete Post"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            )}
                                            <div className="flex items-center gap-1 text-gray-400">
                                                <MessageSquareIcon className="w-4 h-4" />
                                                <span className="text-xs">{post.replies?.length || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )}

        {/* VIEW POST / REPLIES */}
        {view === 'POST' && selectedPost && (
            <div>
               <Button onClick={() => setView('LIST')} className="mb-4 bg-gray-100 !text-gray-800 hover:bg-gray-200 border-none flex items-center gap-2">
                   <ArrowLeftIcon className="w-4 h-4" /> Back to Forum
               </Button>
               
               <div className="space-y-6">
                   <Card className="bg-white border-l-4 border-green-600">
                       <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedPost.title}</h2>
                       <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
                           <UserCircleIcon className="w-5 h-5" />
                           <span>{selectedPost.author}</span>
                           <span>•</span>
                           <span>{new Date(selectedPost.created_at).toLocaleString()}</span>
                       </div>
                       
                       <p className="text-gray-800 whitespace-pre-wrap leading-relaxed mb-4">{selectedPost.content}</p>
                       
                       {/* Post Images */}
                       {selectedPost.images && selectedPost.images.length > 0 && (
                           <div className="flex gap-2 overflow-x-auto pb-2">
                               {selectedPost.images.map((img, idx) => (
                                   <img 
                                      key={idx} 
                                      src={img} 
                                      alt="Post attachment" 
                                      className="h-40 w-auto rounded-lg border border-gray-200 cursor-pointer" 
                                      onClick={() => setMagnifiedImage(img)}
                                   />
                               ))}
                           </div>
                       )}
                       {/* Legacy single image support */}
                       {!selectedPost.images && selectedPost.image_url && (
                           <img 
                              src={selectedPost.image_url} 
                              alt="Post attachment" 
                              className="h-40 w-auto rounded-lg border border-gray-200 cursor-pointer" 
                              onClick={() => setMagnifiedImage(selectedPost.image_url!)}
                           />
                       )}
                   </Card>

                   <div className="pl-4 border-l-2 border-gray-200 space-y-4">
                       <h3 className="font-bold text-gray-700">Replies</h3>
                       {selectedPost.replies.length === 0 ? <p className="text-gray-400 italic">No replies yet.</p> : selectedPost.replies.map((reply, idx) => (
                           <div key={idx} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                               <div className="flex justify-between items-start mb-2">
                                   <span className="font-bold text-sm text-gray-800">{reply.author}</span>
                                   <span className="text-xs text-gray-400">{new Date(reply.created_at).toLocaleString()}</span>
                               </div>
                               <p className="text-gray-700 text-sm whitespace-pre-wrap">{reply.content}</p>
                               {reply.images && reply.images.length > 0 && (
                                   <div className="flex gap-2 mt-2">
                                       {reply.images.map((img, i) => (
                                           <img key={i} src={img} className="h-20 w-auto rounded cursor-pointer" onClick={() => setMagnifiedImage(img)} />
                                       ))}
                                   </div>
                               )}
                           </div>
                       ))}
                   </div>

                   {/* Add Reply Form */}
                   <form onSubmit={handleAddReply} className="mt-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                       <label className="block text-sm font-bold text-gray-700 mb-2">Add a Reply</label>
                       <textarea
                           value={newReplyContent}
                           onChange={e => setNewReplyContent(e.target.value)}
                           className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-gray-900 bg-gray-50 mb-3"
                           rows={3}
                           placeholder="Type your reply here..."
                           required
                       />
                       <div className="flex justify-between items-center">
                           <div className="flex items-center gap-2">
                               <button type="button" onClick={() => replyFileInputRef.current?.click()} className="text-gray-500 hover:text-green-600 p-2 rounded-full hover:bg-gray-100">
                                   <PaperClipIcon className="w-5 h-5" />
                               </button>
                               <input type="file" ref={replyFileInputRef} className="hidden" multiple onChange={(e) => handleImageChange(e, 'reply')} accept="image/*" />
                               <span className="text-xs text-gray-400">{newReplyFiles.length} file(s) attached</span>
                           </div>
                           <Button type="submit" isLoading={isSubmitting} disabled={!user}>
                               {user ? 'Post Reply' : 'Login to Reply'}
                           </Button>
                       </div>
                   </form>
               </div>
            </div>
        )}

        {/* CREATE POST FORM */}
        {view === 'CREATE' && (
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Create Discussion</h2>
                    <Button onClick={() => setView('LIST')} className="bg-gray-100 !text-gray-800 hover:bg-gray-200 border-none"><XIcon className="w-5 h-5"/></Button>
                </div>
                
                {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg mb-4">{error}</div>}

                <form onSubmit={handleCreatePost} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                        <input
                            value={newPostTitle}
                            onChange={e => setNewPostTitle(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-gray-900 bg-gray-50"
                            placeholder="What's on your mind?"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                        <textarea
                            value={newPostContent}
                            onChange={e => setNewPostContent(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-gray-900 bg-gray-50 h-40"
                            placeholder="Describe your question or topic..."
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Attachments (Images)</label>
                        <div className="flex items-center gap-4">
                             <button type="button" onClick={() => postFileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded bg-white hover:bg-gray-50 text-gray-700 text-sm">
                                 <UploadIcon className="w-4 h-4" /> Select Images
                             </button>
                             <input type="file" ref={postFileInputRef} className="hidden" multiple onChange={(e) => handleImageChange(e, 'post')} accept="image/*" />
                        </div>
                        {newPostPreviews.length > 0 && (
                            <div className="flex gap-2 mt-3 overflow-x-auto">
                                {newPostPreviews.map((src, i) => (
                                    <div key={i} className="relative">
                                        <img src={src} className="h-16 w-16 object-cover rounded border" />
                                        <button type="button" className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5" onClick={() => {
                                            setNewPostFiles(files => files.filter((_, idx) => idx !== i));
                                            setNewPostPreviews(urls => urls.filter((_, idx) => idx !== i));
                                        }}><XIcon className="w-3 h-3"/></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <Button type="submit" isLoading={isSubmitting} disabled={!user} className="w-full">
                        {user ? 'Publish Post' : 'Login to Post'}
                    </Button>
                </form>
            </div>
        )}

        {/* Image Magnifier Modal */}
        {magnifiedImage && (
            <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-pointer" onClick={() => setMagnifiedImage(null)}>
                <img src={magnifiedImage} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
                <button className="absolute top-4 right-4 text-white hover:text-gray-300"><XIcon className="w-8 h-8" /></button>
            </div>
        )}
    </Card>
  );
};

export default CommunityForum;
