
import { supabase } from './supabase';
import type { UserFile } from '../types';

/**
 * Uploads a file to Supabase Storage and syncs metadata to the database
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

    const { error: uploadError } = await supabase.storage
      .from('user_uploads')
      .upload(storagePath, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('user_uploads')
      .getPublicUrl(storagePath);

    const fileData = {
      user_id: userId,
      file_url: publicUrl,
      storage_path: storagePath,
      file_name: file.name,
      file_type: file.type,
      context,
      ai_summary: aiSummary || null,
      notes: notes || null,
      created_at: new Date().toISOString()
    };

    if (userId && context !== 'admin-logo') {
        // Try to insert into DB, but do not fail the whole upload if RLS blocks it
        try {
            const { data, error: dbError } = await supabase
                .from('user_files')
                .insert([fileData])
                .select()
                .single();

            if (dbError) {
                console.warn("File uploaded but DB tracking failed (RLS or Schema):", dbError.message);
                // Return constructed object if DB fails
                return { id: `temp-${timestamp}`, ...fileData } as UserFile;
            }
            return data as UserFile;
        } catch (dbErr) {
             console.warn("File uploaded but DB insert threw exception:", dbErr);
             return { id: `temp-${timestamp}`, ...fileData } as UserFile;
        }
    }

    return { id: 'admin-upload', ...fileData } as UserFile;

  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
};

export const deleteUserFile = async (userId: string, fileId: string, storagePath: string): Promise<void> => {
  try {
    await supabase.storage.from('user_uploads').remove([storagePath]);
    if (userId && fileId && !fileId.startsWith('temp-')) {
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
    const { data: { publicUrl } } = supabase.storage
      .from('user_uploads')
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
