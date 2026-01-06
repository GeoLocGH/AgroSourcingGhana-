

import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { ForumPost, ForumReply, User } from '../types';
import Card from './common/Card';
import Button from './common/Button';
import { ArrowLeftIcon, PlusIcon, PaperClipIcon, TrashIcon, XIcon, UploadIcon } from './common/icons';
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
    let uploadedUrls: string[] = [];

    try {
        if (user && user.uid && newPostFiles.length > 0) {
            const uploadPromises = newPostFiles.map((file, index) => 
                uploadUserFile(user.uid!, file, 'forum', '', `Post: ${newPostTitle} (${index + 1})`)
            );
            const results = await Promise.all(uploadPromises);
            uploadedUrls = results.map(f => f.download_url);
        }

        const newPostData = {
            // Let Supabase generate ID usually, but if using number ID on frontend, maybe use timestamp
            // id: Date.now(), // Supabase identity column handles this
            author: user?.name || 'Guest Farmer', 
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
    } catch (error) {
        console.error("Error creating post:", error);
        setError("Failed to create post.");
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleAddReply = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newReplyContent.trim() || !selectedPostId || !selectedPost) return;
      
      setIsSubmitting(true);
      let uploadedUrls: string[] = [];

      try {
          if (user && user.uid && newReplyFiles.length > 0) {
             const uploadPromises = newReplyFiles.map((file, index) => 
                uploadUserFile(user.uid!, file, 'forum', '', `Reply to Post #${selectedPostId}`)
             );
             const results = await Promise.all(uploadPromises);
             uploadedUrls = results.map(f => f.download_url);
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
      } catch (error) {
          console.error("Error adding reply:", error);
          setError("Failed to add reply.");
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
          // Simplification for migration: only handle preview generation here
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
                    {posts.map(post => (
                        <div key={post.id} className="relative">
                            <Card onClick={() => { setSelectedPostId(post.id); setView('POST'); }} className="cursor-pointer">
                                <h3 className="font-bold">{post.title}</h3>
                                <p className="text-sm text-gray-500">By {post.author}</p>
                            </Card>
                             {/* Delete button logic */}
                        </div>
                    ))}
                </div>
            </div>
        )}
        
        {view === 'POST' && selectedPost && (
            <div>
                 <Button onClick={() => setView('LIST')} className="mb-4 bg-gray-200 text-gray-800">Back</Button>
                 <h2 className="text-2xl font-bold">{selectedPost.title}</h2>
                 <p>{selectedPost.content}</p>
                 {/* Images */}
                 
                 {/* Replies */}
                 <div className="mt-6">
                    <h3>Replies</h3>
                    {selectedPost.replies.map(r => (
                        <Card key={r.id} className="bg-gray-50 mb-2">
                            <p className="text-sm font-bold">{r.author}</p>
                            <p>{r.content}</p>
                        </Card>
                    ))}
                 </div>
                 
                 {/* Add Reply Form */}
                 <form onSubmit={handleAddReply} className="mt-4">
                     <textarea value={newReplyContent} onChange={e => setNewReplyContent(e.target.value)} className="w-full border rounded p-2" placeholder="Write a reply..." />
                     <input type="file" onChange={e => handleImageChange(e, 'reply')} />
                     <Button type="submit" isLoading={isSubmitting}>Reply</Button>
                 </form>
            </div>
        )}

        {view === 'CREATE' && (
            <form onSubmit={handleCreatePost}>
                <h2 className="text-xl font-bold mb-4">Create Post</h2>
                <input value={newPostTitle} onChange={e => setNewPostTitle(e.target.value)} className="w-full border p-2 mb-2" placeholder="Title" />
                <textarea value={newPostContent} onChange={e => setNewPostContent(e.target.value)} className="w-full border p-2 mb-2" placeholder="Content" />
                <input type="file" multiple onChange={e => handleImageChange(e, 'post')} />
                <div className="flex gap-2 mt-4">
                    <Button type="submit" isLoading={isSubmitting}>Submit</Button>
                    <Button onClick={() => setView('LIST')} className="bg-gray-200 text-gray-800">Cancel</Button>
                </div>
            </form>
        )}
    </Card>
  );
};

export default CommunityForum;
