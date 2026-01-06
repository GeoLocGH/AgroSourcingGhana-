

import { supabase } from './supabase';
import type { UserFile } from '../types';

/**
 * Uploads a file to Supabase Storage and syncs metadata to the database
 * Bucket: 'uploads'
 */
export const uploadUserFile = async (
  userId: string,
  file: File,
  context: UserFile['context'],
  aiSummary?: string,
  notes?: string
): Promise<UserFile> => {
  try {
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    
    let storagePath = '';
    
    if (context === 'admin-logo') {
        storagePath = `admin/${timestamp}_${safeFileName}`;
    } else {
        let subfolder = 'misc';
        switch (context) {
            case 'profile': subfolder = 'profile'; break;
            case 'pest-diagnosis': subfolder = 'diagnosis'; break;
            case 'marketplace': subfolder = 'market'; break;
            case 'rental': subfolder = 'rental'; break;
            case 'forum': subfolder = 'forum'; break;
        }
        storagePath = `${userId}/${subfolder}/${timestamp}_${safeFileName}`;
    }

    // 1. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(storagePath, file);

    if (uploadError) {
        if (uploadError.message.includes('Bucket not found') || (uploadError as any).error === 'Bucket not found') {
            throw new Error("Storage bucket 'uploads' not found. Please create a public bucket named 'uploads' in your Supabase dashboard.");
        }
        throw uploadError;
    }

    // 2. Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('uploads')
      .getPublicUrl(storagePath);

    // 3. Create Metadata Object
    const fileData: Omit<UserFile, 'id'> = {
      user_id: userId,
      download_url: publicUrl,
      storage_path: storagePath,
      file_name: file.name,
      file_type: file.type,
      context,
      ai_summary: aiSummary || '',
      notes: notes || '',
      created_at: new Date().toISOString()
    };

    // 4. Save to 'user_files' table
    if (userId && context !== 'admin-logo') {
        const { data, error: dbError } = await supabase
            .from('user_files')
            .insert([fileData])
            .select()
            .single();

        if (dbError) throw dbError;
        return data as UserFile;
    }

    return { id: 'admin-upload', ...fileData };

  } catch (error) {
    console.error("Error uploading file and syncing:", error);
    throw error;
  }
};

export const deleteUserFile = async (userId: string, fileId: string, storagePath: string): Promise<void> => {
  try {
    // 1. Delete from Storage
    const { error: storageError } = await supabase.storage
        .from('uploads')
        .remove([storagePath]);
    
    if (storageError) console.warn("Storage delete warning:", storageError);

    // 2. Delete from Database
    if (userId && fileId) {
        const { error: dbError } = await supabase
            .from('user_files')
            .delete()
            .eq('id', fileId);
        
        if (dbError) throw dbError;
    }

  } catch (error) {
    console.error("Error deleting file:", error);
    throw error;
  }
};

export const getFreshDownloadUrl = async (storagePath: string): Promise<string> => {
    // For public buckets, the public URL doesn't expire.
    const { data: { publicUrl } } = supabase.storage
      .from('uploads')
      .getPublicUrl(storagePath);
    return publicUrl;
};

export const getUserFiles = async (userId: string): Promise<UserFile[]> => {
  try {
    const { data, error } = await supabase
        .from('user_files')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as UserFile[]) || [];
  } catch (error) {
    console.error("Error fetching user files:", error);
    return [];
  }
};
