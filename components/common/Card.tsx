import React, { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => {
  const interactiveClasses = onClick ? 'cursor-pointer hover:shadow-xl hover:border-orange-400 transition-all duration-300' : '';
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl shadow-md border-2 border-orange-700 p-4 sm:p-6 ${interactiveClasses} ${className}`}
    >
      {children}
    </div>
  );
};

export default Card;