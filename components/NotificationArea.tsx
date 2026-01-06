import React from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import Notification from './common/Notification';
import type { View } from '../types';

interface NotificationAreaProps {
    setActiveView: (view: View) => void;
}

const NotificationArea: React.FC<NotificationAreaProps> = ({ setActiveView }) => {
  const { notifications, removeNotification } = useNotifications();

  return (
    <div
      aria-live="assertive"
      className="fixed inset-0 flex items-end px-4 py-6 pointer-events-none sm:p-6 sm:items-start z-50"
    >
      <div className="w-full flex flex-col items-center space-y-4 sm:items-end">
        {notifications.map((notification) => (
          <Notification
            key={notification.id}
            notification={notification}
            onDismiss={() => removeNotification(notification.id)}
            setActiveView={setActiveView}
          />
        ))}
      </div>
    </div>
  );
};

export default NotificationArea;