import React from 'react';
import type { AppNotification, View } from '../../types';
import { AlertTriangleIcon, BugIcon, ShoppingCartIcon, TagIcon, XIcon } from './icons';

interface NotificationProps {
  notification: AppNotification;
  onDismiss: () => void;
  setActiveView: (view: View) => void;
}

const Notification: React.FC<NotificationProps> = ({ notification, onDismiss, setActiveView }) => {
  const { type, title, message, view } = notification;

  const getIcon = () => {
    switch (type) {
      case 'weather':
        return <AlertTriangleIcon className="h-6 w-6 text-yellow-500" />;
      case 'price':
        return <TagIcon className="h-6 w-6 text-green-500" />;
      case 'market':
        return <ShoppingCartIcon className="h-6 w-6 text-purple-500" />;
      case 'pest':
        return <BugIcon className="h-6 w-6 text-red-500" />;
      default:
        return <AlertTriangleIcon className="h-6 w-6 text-gray-500" />;
    }
  };
  
  const handleClick = () => {
    if (view) {
        setActiveView(view);
        onDismiss();
    }
  }

  return (
    <div
      className={`max-w-sm w-full bg-white shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden ${view ? 'cursor-pointer hover:bg-gray-50' : ''}`}
      onClick={handleClick}
      role="alert"
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">{getIcon()}</div>
          <div className="ml-3 w-0 flex-1 pt-0.5">
            <p className="text-sm font-medium text-gray-900">{title}</p>
            <p className="mt-1 text-sm text-gray-500">{message}</p>
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              onClick={(e) => {
                  e.stopPropagation(); // Prevent card click when closing
                  onDismiss();
              }}
              className="bg-white rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <span className="sr-only">Close</span>
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notification;