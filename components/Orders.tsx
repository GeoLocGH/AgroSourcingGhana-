
import React from 'react';
import Card from './common/Card';
import { ClipboardListIcon, ClockIcon, TruckIcon, CheckCircleIcon } from './common/icons';
import type { Order } from '../types';

const Orders: React.FC = () => {
  // Orders logic to be implemented with real backend data
  const orders: Order[] = [];

  const getStatusIcon = (status: Order['status']) => {
    switch (status) {
      case 'Processing': return <ClockIcon className="w-5 h-5 text-yellow-600" />;
      case 'Shipped': return <TruckIcon className="w-5 h-5 text-blue-600" />;
      case 'Delivered': return <CheckCircleIcon className="w-5 h-5 text-green-600" />;
      default: return <ClockIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'Processing': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Shipped': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Delivered': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
       <div className="flex items-center gap-3 mb-2">
        <div className="p-3 bg-green-100 rounded-full text-green-700">
          <ClipboardListIcon className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">My Orders</h2>
          <p className="text-gray-600">Track your purchases and delivery status.</p>
        </div>
      </div>

      <div className="space-y-4">
        {orders.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-500">No orders found.</p>
            </div>
        ) : (
            orders.map((order) => (
            <Card key={order.id} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold text-lg text-gray-900">{order.id}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1 ${getStatusColor(order.status)}`}>
                            {getStatusIcon(order.status)}
                            {order.status}
                        </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-2">Placed on {order.date}</p>
                    <div className="flex flex-wrap gap-2">
                        {order.items.map((item, idx) => (
                            <span key={idx} className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded border border-gray-200">
                                {item}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="text-right min-w-[100px]">
                    <p className="text-sm text-gray-500">Total Amount</p>
                    <p className="text-xl font-bold text-green-700">GHS {order.total.toFixed(2)}</p>
                    <button className="mt-2 text-sm text-green-600 hover:underline font-medium">View Receipt</button>
                </div>
            </Card>
            ))
        )}
      </div>
    </div>
  );
};

export default Orders;
