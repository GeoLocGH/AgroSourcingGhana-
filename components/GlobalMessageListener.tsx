
import React, { useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useNotifications } from '../contexts/NotificationContext';
import type { User, View } from '../types';

interface Props {
  user: User | null;
  setActiveView: (view: View) => void;
}

const GlobalMessageListener: React.FC<Props> = ({ user, setActiveView }) => {
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (!user?.uid) return;

    // Listen for NEW messages where the current user is the RECEIVER
    const channel = supabase
      .channel('global_chats_listener')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chats',
          filter: `receiver_id=eq.${user.uid}`
        },
        (payload) => {
           const newMessage = payload.new;
           
           // Play notification sound
           try {
             // Use a simple beep sound hosted on a reliable CDN or data URI if preferred
             const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3'); 
             audio.volume = 0.5;
             audio.play().catch(e => console.warn('Audio blocked by browser policy', e));
           } catch (e) {}

           // Target the Profile Inbox now
           const targetView: View = 'PROFILE'; 

           addNotification({
             type: 'market',
             title: 'New Message',
             message: newMessage.message_text || 'You received a new message',
             view: targetView
           });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.uid, addNotification]);

  return null; // Invisible component
};

export default GlobalMessageListener;
