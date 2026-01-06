import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import type { AppNotification } from '../types';

interface NotificationContextType {
  notifications: AppNotification[];
  addNotification: (notification: Omit<AppNotification, 'id'>) => void;
  removeNotification: (id: number) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const removeNotification = useCallback((id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const addNotification = useCallback((notification: Omit<AppNotification, 'id'>) => {
    const newNotification = { id: Date.now(), ...notification };
    
    setNotifications(prev => {
      // Prevent duplicate notifications from being spammed
      const existing = prev.find(n => n.title === newNotification.title && n.message === newNotification.message);
      if (existing) {
        return prev;
      }
      return [...prev, newNotification];
    });
    
    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      removeNotification(newNotification.id);
    }, 8000);
  }, [removeNotification]);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};