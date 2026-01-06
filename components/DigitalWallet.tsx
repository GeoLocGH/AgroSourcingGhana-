import React, { useState } from 'react';
import Card from './common/Card';
import Button from './common/Button';
import { WalletIcon, BanknotesIcon, LightningIcon, ShieldCheckIcon, ShoppingCartIcon, QrCodeIcon, CameraIcon, ArrowDownIcon, ArrowUpIcon } from './common/icons';
import { useNotifications } from '../contexts/NotificationContext';
import type { User } from '../types';

const networks = [
  "MTN Mobile Money",
  "Vodafone Cash",
  "AirtelTigo Money",
  "G-Money",
  "Zeepay"
];

const banks = [
    "GCB Bank",
    "Ecobank Ghana",
    "Fidelity Bank",
    "Stanbic Bank",
    "Zenith Bank",
    "Absa Bank"
];

interface LinkedAccount {
  id: string;
  type: 'BANK' | 'MOMO';
  provider: string;
  accountNumber: string; // or Phone Number
  accountName: string;
}

interface DigitalWalletProps {
    user: User | null;
}

const DigitalWallet: React.FC<DigitalWalletProps> = ({ user }) => {
  const { addNotification } = useNotifications();
  const [balance, setBalance] = useState(2450.00);
  const [activeTab, setActiveTab] = useState<'SEND' | 'LOAN' | 'BILLS' | 'INSURE' | 'MERCHANT' | 'HISTORY' | 'QR' | 'DEPOSIT' | 'WITHDRAW' | 'LINK_ACCOUNT'>('HISTORY');
  const [qrMode, setQrMode] = useState<'MY_CODE' | 'SCAN'>('MY_CODE');

  // Mock Linked Accounts
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([
      { id: '1', type: 'MOMO', provider: 'MTN Mobile Money', accountNumber: '0244123456', accountName: 'Kofi Farmer' }
  ]);

  // Mock Form States
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientNetwork, setRecipientNetwork] = useState(networks[0]);
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [billType, setBillType] = useState('Electricity (ECG) - Prepaid');
  const [loanAmount, setLoanAmount] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [merchantNetwork, setMerchantNetwork] = useState(networks[0]);

  // P2P Transaction State
  const [transferStep, setTransferStep] = useState<'INPUT' | 'CONFIRM'>('INPUT');
  const [simulatedRecipientName, setSimulatedRecipientName] = useState('');
  const [pin, setPin] = useState('');
  const [transactionFees, setTransactionFees] = useState({ fee: 0, elevy: 0, total: 0 });
  
  // Transaction QR State
  const [showTransactionQr, setShowTransactionQr] = useState(false);
  
  // Deposit/Withdraw State
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [otp, setOtp] = useState('');
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [withdrawStep, setWithdrawStep] = useState<'INPUT' | 'CONFIRM'>('INPUT');
  
  // Link Account State
  const [newAccountType, setNewAccountType] = useState<'BANK' | 'MOMO'>('MOMO');
  const [newProvider, setNewProvider] = useState(networks[0]);
  const [newAccountNumber, setNewAccountNumber] = useState('');

  const validatePhone = (phone: string) => {
      const phoneRegex = /^0\d{9}$/;
      return phoneRegex.test(phone);
  };

  const initiateTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    
    if (!validatePhone(recipientPhone)) {
        addNotification({ type: 'wallet', title: 'Invalid Number', message: 'Please enter a valid 10-digit valid phone number (e.g., 024...).', view: 'WALLET' });
        return;
    }

    if (val > 0 && val <= balance) {
        // 1. Name Resolution
        setSimulatedRecipientName(recipientPhone === '0244000000' ? 'Unknown User' : 'Kwame Mensah');
        
        // 2. Calculate Fees
        const fee = val * 0.01; // 1% Network Fee
        const elevy = val * 0.01; // 1% E-Levy
        const total = val + fee + elevy;

        if (total > balance) {
             addNotification({ type: 'wallet', title: 'Insufficient Funds', message: 'Balance not enough to cover amount + fees.', view: 'WALLET' });
             return;
        }

        setTransactionFees({ fee, elevy, total });
        setTransferStep('CONFIRM');
    } else {
       addNotification({
        type: 'wallet',
        title: 'Invalid Amount',
        message: `Please enter a valid amount within your balance.`,
        view: 'WALLET'
      });
    }
  };

  const confirmTransfer = () => {
    if (pin.length !== 4) {
        addNotification({ type: 'wallet', title: 'Invalid PIN', message: 'Please enter your 4-digit PIN.', view: 'WALLET' });
        return;
    }

    setBalance(prev => prev - transactionFees.total);
    addNotification({
        type: 'wallet',
        title: 'Transaction Successful',
        message: `Sent GHS ${parseFloat(amount).toFixed(2)} to ${simulatedRecipientName} (${recipientNetwork}).`,
        view: 'WALLET'
    });

    // Reset
    setAmount('');
    setRecipientPhone('');
    setReference('');
    setPin('');
    setTransferStep('INPUT');
  };

  const handleRequestLoan = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(loanAmount);
    if(val > 0) {
         setBalance(prev => prev + val);
         addNotification({
            type: 'wallet',
            title: 'QwikLoan Approved',
            message: `Loan of GHS ${val.toFixed(2)} has been disbursed to your wallet. Repayment due in 30 days.`,
            view: 'WALLET'
          });
          setLoanAmount('');
    }
  };
  
  const handlePayBill = (e: React.FormEvent) => {
      e.preventDefault();
      const val = parseFloat(amount);
      if(val > 0 && val <= balance) {
          setBalance(prev => prev - val);
          addNotification({
            type: 'wallet',
            title: 'Bill Payment Successful',
            message: `GHS ${val.toFixed(2)} paid for ${billType}. Token/Receipt will be sent via SMS.`,
            view: 'WALLET'
          });
          setAmount('');
      }
  }

  const handlePayMerchant = (e: React.FormEvent) => {
      e.preventDefault();
      const val = parseFloat(amount);
      
      if (!merchantId.trim()) {
          addNotification({ type: 'wallet', title: 'Missing Info', message: 'Please enter a Merchant ID.', view: 'WALLET' });
          return;
      }

      if(val > 0 && val <= balance) {
          setBalance(prev => prev - val);
          addNotification({
            type: 'wallet',
            title: 'MoMo Pay Successful',
            message: `Paid GHS ${val.toFixed(2)} to ${merchantNetwork} Merchant: ${merchantId}.`,
            view: 'WALLET'
          });
          setAmount('');
          setMerchantId('');
      } else if (val > balance) {
          addNotification({ type: 'wallet', title: 'Insufficient Funds', message: 'Balance not enough to make payment.', view: 'WALLET' });
      }
  }

  const handleSubscribeInsurance = () => {
      addNotification({
            type: 'wallet',
            title: 'Insurance Active',
            message: `Crop Insurance subscription started. GHS 20.00 deducted. Policy #INS${Date.now()}`,
            view: 'WALLET'
      });
      setBalance(prev => prev - 20);
  }

  const handleScanResult = () => {
      addNotification({
          type: 'wallet',
          title: 'QR Code Scanned',
          message: 'Merchant Detected: Kojo Provisions Store',
          view: 'WALLET'
      });
      setActiveTab('MERCHANT');
      setMerchantId('MERCH-8892');
      setMerchantNetwork('MTN Mobile Money');
  }

  const toggleTransactionQr = () => {
      if (!validatePhone(recipientPhone)) {
          addNotification({ type: 'wallet', title: 'Invalid Number', message: 'Please enter a valid phone number to generate QR.', view: 'WALLET' });
          return;
      }
      setShowTransactionQr(!showTransactionQr);
  }

  // Generate QR Data based on logged in user or Guest fallback
  const qrData = user 
    ? `AgricSource-Wallet:${user.phone}:${user.name}` 
    : 'AgricSource-Wallet:Guest:0000000000';
    
  const encodedQrData = encodeURIComponent(qrData);
  
  // Transaction specific QR data
  const transactionQrData = encodeURIComponent(`AgricSource-Transfer:${recipientPhone}:${recipientNetwork}:${amount || '0'}`);

  // -- Deposit & Withdraw Logic --

  const handleLinkAccount = (e: React.FormEvent) => {
      e.preventDefault();
      
      const newAccount: LinkedAccount = {
          id: Date.now().toString(),
          type: newAccountType,
          provider: newProvider,
          accountNumber: newAccountNumber,
          accountName: user?.name || 'User Name'
      };
      setLinkedAccounts([...linkedAccounts, newAccount]);
      addNotification({ type: 'wallet', title: 'Account Linked', message: `${newProvider} account verified and added.`, view: 'WALLET' });
      setActiveTab('HISTORY');
      setNewAccountNumber('');
  };

  const handleDeposit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedAccount || !amount) return;
      setShowOtpModal(true);
  };

  const verifyDepositOtp = () => {
      if (otp.length !== 4) return;
      setShowOtpModal(false);
      setBalance(prev => prev + parseFloat(amount));
      addNotification({ type: 'wallet', title: 'Top Up Successful', message: `Wallet funded with GHS ${parseFloat(amount).toFixed(2)}.`, view: 'WALLET' });
      setAmount('');
      setOtp('');
      setActiveTab('HISTORY');
  };

  const handleWithdrawInput = (e: React.FormEvent) => {
      e.preventDefault();
      const val = parseFloat(amount);
      if (!selectedAccount || !val) return;
      if (val > balance) {
           addNotification({ type: 'wallet', title: 'Insufficient Funds', message: 'Amount exceeds available balance.', view: 'WALLET' });
           return;
      }
      setWithdrawStep('CONFIRM');
  };

  const confirmWithdraw = () => {
      if (pin.length !== 4) {
        addNotification({ type: 'wallet', title: 'Invalid PIN', message: 'Please enter your 4-digit PIN.', view: 'WALLET' });
        return;
      }

      setBalance(prev => prev - parseFloat(amount));
      addNotification({ type: 'wallet', title: 'Withdrawal Successful', message: `GHS ${parseFloat(amount).toFixed(2)} transferred to linked account.`, view: 'WALLET' });
      setAmount('');
      setPin('');
      setWithdrawStep('INPUT');
      setActiveTab('HISTORY');
  };


  return (
    <Card>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-yellow-100 rounded-full text-yellow-700">
          <WalletIcon className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Mobile Money & Digital Wallet</h2>
          <p className="text-gray-600">Secure transactions via MTN MoMo, Vodafone Cash & AirtelTigo.</p>
          {user && <p className="text-xs text-green-700 font-medium mt-1">Wallet linked to: {user.phone} ({user.name})</p>}
        </div>
      </div>

      {/* Balance Card */}
      <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-6 text-white mb-8 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-20">
            <WalletIcon className="w-32 h-32" />
        </div>
        <div className="flex justify-between items-start relative z-10">
            <div>
                <p className="text-yellow-100 text-sm font-medium mb-1">Available Balance</p>
                <h3 className="text-4xl font-bold mb-4">GHS {balance.toFixed(2)}</h3>
            </div>
            <div className="text-right">
                <span className="bg-white/20 text-xs px-2 py-1 rounded border border-white/30">Gold Tier User</span>
            </div>
        </div>
        
        <div className="flex flex-wrap gap-3 relative z-10">
           {/* Deposit/Withdraw Buttons */}
           <button 
            onClick={() => setActiveTab('DEPOSIT')} 
            className={`flex items-center gap-2 px-4 py-2 rounded-lg backdrop-blur-sm transition-colors ${activeTab === 'DEPOSIT' ? 'bg-white text-yellow-800 font-bold shadow-md' : 'bg-white/20 hover:bg-white/30'}`}
          >
             <ArrowDownIcon className="w-5 h-5" /> Deposit
          </button>
           <button 
            onClick={() => setActiveTab('WITHDRAW')} 
            className={`flex items-center gap-2 px-4 py-2 rounded-lg backdrop-blur-sm transition-colors ${activeTab === 'WITHDRAW' ? 'bg-white text-yellow-800 font-bold shadow-md' : 'bg-white/20 hover:bg-white/30'}`}
          >
             <ArrowUpIcon className="w-5 h-5" /> Withdraw
          </button>
          <div className="w-px bg-white/30 mx-2"></div> {/* Separator */}

          <button 
            onClick={() => { setActiveTab('SEND'); setTransferStep('INPUT'); setShowTransactionQr(false); }} 
            className={`flex items-center gap-2 px-4 py-2 rounded-lg backdrop-blur-sm transition-colors ${activeTab === 'SEND' ? 'bg-white text-yellow-800 font-bold shadow-md' : 'bg-white/20 hover:bg-white/30'}`}
          >
             <WalletIcon className="w-5 h-5" /> Send
          </button>
          <button 
            onClick={() => setActiveTab('MERCHANT')} 
            className={`flex items-center gap-2 px-4 py-2 rounded-lg backdrop-blur-sm transition-colors ${activeTab === 'MERCHANT' ? 'bg-white text-yellow-800 font-bold shadow-md' : 'bg-white/20 hover:bg-white/30'}`}
          >
             <ShoppingCartIcon className="w-5 h-5" /> MoMo Pay
          </button>
          <button 
            onClick={() => setActiveTab('QR')} 
            className={`flex items-center gap-2 px-4 py-2 rounded-lg backdrop-blur-sm transition-colors ${activeTab === 'QR' ? 'bg-white text-yellow-800 font-bold shadow-md' : 'bg-white/20 hover:bg-white/30'}`}
          >
             <QrCodeIcon className="w-5 h-5" /> Scan
          </button>
          <button 
            onClick={() => setActiveTab('LOAN')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg backdrop-blur-sm transition-colors ${activeTab === 'LOAN' ? 'bg-white text-yellow-800 font-bold shadow-md' : 'bg-white/20 hover:bg-white/30'}`}
          >
             <BanknotesIcon className="w-5 h-5" /> Loans
          </button>
          <button 
            onClick={() => setActiveTab('BILLS')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg backdrop-blur-sm transition-colors ${activeTab === 'BILLS' ? 'bg-white text-yellow-800 font-bold shadow-md' : 'bg-white/20 hover:bg-white/30'}`}
          >
             <LightningIcon className="w-5 h-5" /> Bills
          </button>
          <button 
            onClick={() => setActiveTab('INSURE')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg backdrop-blur-sm transition-colors ${activeTab === 'INSURE' ? 'bg-white text-yellow-800 font-bold shadow-md' : 'bg-white/20 hover:bg-white/30'}`}
          >
             <ShieldCheckIcon className="w-5 h-5" /> Insurance
          </button>
        </div>
      </div>

      {/* Action Area */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 min-h-[400px]">
        {activeTab === 'SEND' && (
          <div className="max-w-md mx-auto animate-fade-in">
             {transferStep === 'INPUT' ? (
                <form onSubmit={initiateTransfer}>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-gray-800">Send Money (P2P)</h3>
                        <button type="button" onClick={toggleTransactionQr} className="text-sm flex items-center gap-1 text-yellow-600 hover:text-yellow-700">
                             <QrCodeIcon className="w-4 h-4"/> {showTransactionQr ? 'Hide QR' : 'Generate QR'}
                        </button>
                    </div>

                    {showTransactionQr && (
                        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm mb-6 text-center animate-fade-in">
                             <p className="text-sm text-gray-600 mb-2">Scan to pay this transaction</p>
                             <img 
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${transactionQrData}`} 
                                alt="Transaction QR Code" 
                                className="w-32 h-32 mx-auto"
                            />
                            <p className="text-xs text-gray-500 mt-2 break-all">{recipientPhone} ({recipientNetwork}) - GHS {amount || '0.00'}</p>
                        </div>
                    )}

                    <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Network</label>
                    <select 
                        value={recipientNetwork}
                        onChange={(e) => setRecipientNetwork(e.target.value)}
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none bg-white text-gray-900"
                    >
                        {networks.map(network => (
                            <option key={network} value={network}>{network}</option>
                        ))}
                    </select>
                    </div>
                    <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Number</label>
                    <input 
                        type="tel" 
                        value={recipientPhone}
                        onChange={(e) => setRecipientPhone(e.target.value.replace(/\D/g,'').slice(0,10))}
                        placeholder="024XXXXXXX"
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900"
                        required
                    />
                    </div>
                    <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (GHS)</label>
                    <input 
                        type="number" 
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900"
                        required
                    />
                    </div>
                    <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reference (Optional)</label>
                    <input 
                        type="text" 
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="e.g. Payment for Seeds"
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900"
                    />
                    </div>
                    <Button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-700 font-bold">Next</Button>
                </form>
             ) : (
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                     <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Confirm Transaction</h3>
                     
                     <div className="space-y-3 mb-6">
                         <div className="flex justify-between border-b pb-2">
                             <span className="text-gray-600">Recipient:</span>
                             <span className="font-bold text-gray-900 text-right">
                                 {simulatedRecipientName}<br/>
                                 <span className="text-xs font-normal text-gray-500">{recipientPhone} ({recipientNetwork})</span>
                             </span>
                         </div>
                         <div className="flex justify-between">
                             <span className="text-gray-600">Amount:</span>
                             <span className="font-bold text-gray-900">GHS {parseFloat(amount).toFixed(2)}</span>
                         </div>
                         <div className="flex justify-between text-sm">
                             <span className="text-gray-500">Fee (1%):</span>
                             <span className="text-gray-700">GHS {transactionFees.fee.toFixed(2)}</span>
                         </div>
                         <div className="flex justify-between text-sm">
                             <span className="text-gray-500">E-Levy (1%):</span>
                             <span className="text-gray-700">GHS {transactionFees.elevy.toFixed(2)}</span>
                         </div>
                         <div className="flex justify-between border-t pt-2 mt-2">
                             <span className="font-bold text-gray-800">Total Deduction:</span>
                             <span className="font-bold text-red-600 text-lg">GHS {transactionFees.total.toFixed(2)}</span>
                         </div>
                     </div>

                     <div className="mb-6">
                         <label className="block text-sm font-medium text-gray-700 mb-1 text-center">Enter Mobile Money PIN</label>
                         <input 
                            type="password" 
                            value={pin}
                            onChange={(e) => setPin(e.target.value.slice(0, 4))}
                            placeholder="••••"
                            className="block w-32 mx-auto text-center tracking-widest text-2xl px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900"
                            maxLength={4}
                         />
                     </div>

                     <div className="flex gap-3">
                         <Button onClick={() => setTransferStep('INPUT')} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800">Back</Button>
                         <Button onClick={confirmTransfer} className="flex-1 bg-yellow-600 hover:bg-yellow-700">Confirm</Button>
                     </div>
                 </div>
             )}
          </div>
        )}

        {activeTab === 'QR' && (
            <div className="max-w-md mx-auto animate-fade-in">
                <div className="flex justify-center mb-6 border-b border-gray-200">
                    <button 
                        onClick={() => setQrMode('MY_CODE')}
                        className={`pb-2 px-4 text-sm font-medium ${qrMode === 'MY_CODE' ? 'text-yellow-600 border-b-2 border-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        My QR Code
                    </button>
                    <button 
                        onClick={() => setQrMode('SCAN')}
                        className={`pb-2 px-4 text-sm font-medium ${qrMode === 'SCAN' ? 'text-yellow-600 border-b-2 border-yellow-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Scan QR
                    </button>
                </div>

                {qrMode === 'MY_CODE' ? (
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-gray-800 mb-4">Receive Payment</h3>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 inline-block mb-4">
                            <img 
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodedQrData}`} 
                                alt="My QR Code" 
                                className="w-48 h-48 mx-auto"
                            />
                        </div>
                        <p className="text-gray-600 text-sm">Scan to send money to my wallet</p>
                        {user ? (
                            <p className="text-gray-800 font-bold mt-1">{user.phone} ({user.name})</p>
                        ) : (
                            <p className="text-red-500 text-sm mt-2">Please login to see your details</p>
                        )}
                    </div>
                ) : (
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-gray-800 mb-4">Scan to Pay</h3>
                        <div className="bg-gray-900 rounded-xl h-64 flex items-center justify-center relative overflow-hidden mb-4">
                            <CameraIcon className="w-16 h-16 text-gray-500" />
                            {/* Scanning Frame */}
                            <div className="absolute inset-10 border-2 border-yellow-500 opacity-50"></div>
                        </div>
                        <p className="text-gray-600 text-sm mb-6">Align QR code within the frame</p>
                        <Button onClick={handleScanResult} className="w-full bg-yellow-600 hover:bg-yellow-700 font-bold">
                            Scan Code
                        </Button>
                    </div>
                )}
            </div>
        )}

        {activeTab === 'MERCHANT' && (
          <form onSubmit={handlePayMerchant} className="max-w-md mx-auto animate-fade-in">
            <h3 className="text-xl font-bold text-gray-800 mb-4">MoMo Pay / Merchant Pay</h3>
            <div className="bg-gray-100 p-3 rounded-lg mb-4 text-sm text-gray-600">
                Enter the Merchant ID displayed at the shop or stall.
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Merchant Network</label>
              <select 
                 value={merchantNetwork}
                 onChange={(e) => setMerchantNetwork(e.target.value)}
                 className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none bg-white text-gray-900"
              >
                  {networks.map(network => (
                    <option key={network} value={network}>{network}</option>
                  ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Merchant ID / Till Number</label>
              <input 
                type="text" 
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                placeholder="Enter Merchant ID"
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900"
                required
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (GHS)</label>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900"
                required
              />
            </div>
            <Button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-700 font-bold">Pay Merchant</Button>
          </form>
        )}

        {activeTab === 'LOAN' && (
            <form onSubmit={handleRequestLoan} className="max-w-md mx-auto animate-fade-in">
                <h3 className="text-xl font-bold text-gray-800 mb-2">Quick Loans</h3>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-4">
                    <p className="text-sm text-blue-800 font-medium"><strong>QwikLoan / XpressLoan</strong></p>
                    <p className="text-xs text-blue-600 mt-1">No collateral required. Instant disbursement to your wallet based on your transaction history.</p>
                </div>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Loan Amount Needed (GHS)</label>
                     <input 
                        type="number" 
                        value={loanAmount}
                        onChange={(e) => setLoanAmount(e.target.value)}
                        placeholder="Max limit: GHS 2,000.00"
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900"
                        required
                    />
                </div>
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Repayment Terms</label>
                     <select className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none bg-white text-gray-900">
                         <option>30 Days (6.9% interest)</option>
                         <option>60 Days (12% interest)</option>
                         <option>90 Days (18% interest)</option>
                     </select>
                </div>
                 <Button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-700 font-bold">Apply Now</Button>
            </form>
        )}

        {activeTab === 'BILLS' && (
             <form onSubmit={handlePayBill} className="max-w-md mx-auto animate-fade-in">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Pay Bills</h3>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Provider</label>
                     <select 
                        value={billType}
                        onChange={(e) => setBillType(e.target.value)}
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none bg-white text-gray-900"
                    >
                         <optgroup label="Utilities">
                            <option value="Electricity (ECG) - Prepaid">ECG Prepaid (Token)</option>
                            <option value="Electricity (ECG) - Postpaid">ECG Postpaid</option>
                            <option value="Ghana Water (GWCL)">Ghana Water (GWCL)</option>
                         </optgroup>
                         <optgroup label="TV & Internet">
                            <option value="DSTV">DSTV Subscription</option>
                            <option value="GOtv">GOtv Subscription</option>
                            <option value="StarTimes">StarTimes</option>
                            <option value="MTN Fibre">MTN Fibre Broadband</option>
                            <option value="Vodafone Broadband">Vodafone Broadband</option>
                         </optgroup>
                         <optgroup label="Other">
                            <option value="School Fees">School Fees (GhIPSS)</option>
                            <option value="Cocoa Board">Cocoa Board Payments</option>
                         </optgroup>
                     </select>
                </div>
                <div className="mb-4">
                     <label className="block text-sm font-medium text-gray-700 mb-1">Account / Meter Number</label>
                     <input 
                        type="text" 
                        placeholder="Enter Account Number"
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900"
                        required
                    />
                </div>
                 <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (GHS)</label>
                    <input 
                        type="number" 
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900"
                        required
                    />
                </div>
                 <Button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-700 font-bold">Pay Bill</Button>
             </form>
        )}

        {activeTab === 'INSURE' && (
             <div className="max-w-md mx-auto text-center animate-fade-in">
                <div className="flex justify-center mb-4">
                     <div className="p-4 bg-green-100 rounded-full text-green-600">
                         <ShieldCheckIcon className="w-12 h-12" />
                     </div>
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Agro-Insurance (aYo / Star Micro)</h3>
                <p className="text-gray-600 mb-6">Protect your farm against drought, pests, and flooding with instant micro-insurance.</p>
                
                <div className="bg-white border border-gray-200 rounded-lg p-4 text-left mb-6 shadow-sm">
                    <div className="flex justify-between items-center border-b pb-2 mb-2">
                        <span className="font-semibold text-gray-800">Farmer's Shield (Basic)</span>
                        <span className="text-green-600 font-bold">GHS 15.00 / mo</span>
                    </div>
                    <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                        <li>Coverage: GHS 3,000</li>
                        <li>Flood & Drought Protection</li>
                        <li>Hospital Admission Support</li>
                    </ul>
                </div>

                 <div className="bg-white border border-gray-200 rounded-lg p-4 text-left mb-6 shadow-sm">
                    <div className="flex justify-between items-center border-b pb-2 mb-2">
                        <span className="font-semibold text-gray-800">Farmer's Shield (Premium)</span>
                        <span className="text-green-600 font-bold">GHS 30.00 / mo</span>
                    </div>
                    <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                        <li>Coverage: GHS 10,000</li>
                        <li>Flood, Drought & Fire</li>
                        <li>Hospital + Funeral Cover</li>
                    </ul>
                </div>

                 <Button onClick={handleSubscribeInsurance} className="w-full bg-yellow-600 hover:bg-yellow-700 font-bold">Subscribe Now</Button>
             </div>
        )}
        
        {/* History Tab (Default) */}
        {activeTab === 'HISTORY' && (
             <div className="animate-fade-in">
                 <div className="flex justify-between items-center mb-4">
                     <h3 className="text-xl font-bold text-gray-800">Transaction History</h3>
                     <button onClick={() => setActiveTab('LINK_ACCOUNT')} className="text-sm text-yellow-600 hover:underline font-medium">Link Bank/Card</button>
                 </div>
                 
                 {/* Linked Accounts Summary */}
                 {linkedAccounts.length > 0 && (
                     <div className="mb-6 flex gap-4 overflow-x-auto pb-2">
                         {linkedAccounts.map(acc => (
                             <div key={acc.id} className="min-w-[200px] p-3 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col">
                                 <span className="text-xs text-gray-500 mb-1">{acc.provider} ({acc.type})</span>
                                 <span className="font-bold text-gray-800">{acc.accountNumber}</span>
                                 <span className="text-xs text-gray-400 mt-auto">{acc.accountName}</span>
                             </div>
                         ))}
                     </div>
                 )}
                 
                 <div className="space-y-3">
                    <div className="bg-white p-4 rounded-lg border border-gray-200 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                             <div className="p-2 bg-green-100 rounded-full text-green-600">
                                 <ArrowDownIcon className="w-4 h-4" />
                             </div>
                             <div>
                                 <p className="font-bold text-gray-800">Deposit</p>
                                 <p className="text-xs text-gray-500">Today, 10:23 AM</p>
                             </div>
                        </div>
                        <span className="font-bold text-green-600">+ GHS 500.00</span>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-gray-200 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                             <div className="p-2 bg-red-100 rounded-full text-red-600">
                                 <ArrowUpIcon className="w-4 h-4" />
                             </div>
                             <div>
                                 <p className="font-bold text-gray-800">Transfer to Kwame</p>
                                 <p className="text-xs text-gray-500">Yesterday, 2:45 PM</p>
                             </div>
                        </div>
                        <span className="font-bold text-gray-800">- GHS 120.00</span>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-gray-200 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                             <div className="p-2 bg-yellow-100 rounded-full text-yellow-600">
                                 <LightningIcon className="w-4 h-4" />
                             </div>
                             <div>
                                 <p className="font-bold text-gray-800">ECG Prepaid</p>
                                 <p className="text-xs text-gray-500">22 Oct, 9:00 AM</p>
                             </div>
                        </div>
                        <span className="font-bold text-gray-800">- GHS 50.00</span>
                    </div>
                 </div>
             </div>
        )}

        {activeTab === 'LINK_ACCOUNT' && (
             <form onSubmit={handleLinkAccount} className="max-w-md mx-auto animate-fade-in">
                 <h3 className="text-xl font-bold text-gray-800 mb-4">Link New Account</h3>
                 <div className="mb-4">
                     <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
                     <div className="flex gap-4">
                         <label className="flex items-center">
                             <input 
                                type="radio" 
                                name="accType" 
                                checked={newAccountType === 'MOMO'} 
                                onChange={() => { setNewAccountType('MOMO'); setNewProvider(networks[0]); }}
                                className="mr-2"
                             /> Mobile Money
                         </label>
                         <label className="flex items-center">
                             <input 
                                type="radio" 
                                name="accType" 
                                checked={newAccountType === 'BANK'} 
                                onChange={() => { setNewAccountType('BANK'); setNewProvider(banks[0]); }}
                                className="mr-2"
                             /> Bank Account
                         </label>
                     </div>
                 </div>
                 <div className="mb-4">
                     <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                     <select 
                        value={newProvider}
                        onChange={(e) => setNewProvider(e.target.value)}
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none bg-white text-gray-900"
                    >
                         {(newAccountType === 'MOMO' ? networks : banks).map(p => <option key={p} value={p}>{p}</option>)}
                     </select>
                 </div>
                 <div className="mb-6">
                     <label className="block text-sm font-medium text-gray-700 mb-1">{newAccountType === 'MOMO' ? 'Phone Number' : 'Account Number'}</label>
                     <input 
                        type="text" 
                        value={newAccountNumber}
                        onChange={(e) => setNewAccountNumber(e.target.value)}
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900"
                        required
                     />
                 </div>
                 <Button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-700 font-bold">Verify & Link</Button>
             </form>
        )}

        {/* Deposit/Withdraw Modals */}
        {(activeTab === 'DEPOSIT' || activeTab === 'WITHDRAW') && (
            <div className="animate-fade-in max-w-md mx-auto">
                 <h3 className="text-xl font-bold text-gray-800 mb-4">{activeTab === 'DEPOSIT' ? 'Fund Wallet' : 'Withdraw to Account'}</h3>
                 
                 {withdrawStep === 'INPUT' ? (
                     <form onSubmit={activeTab === 'DEPOSIT' ? handleDeposit : handleWithdrawInput}>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Select Source/Destination</label>
                            <select 
                                value={selectedAccount}
                                onChange={(e) => setSelectedAccount(e.target.value)}
                                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none bg-white text-gray-900"
                                required
                            >
                                <option value="">Select Account</option>
                                {linkedAccounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.provider} - {acc.accountNumber}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (GHS)</label>
                            <input 
                                type="number" 
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900"
                                required
                            />
                        </div>
                        <Button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-700 font-bold">Next</Button>
                     </form>
                 ) : (
                     <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 text-center">
                         <h4 className="font-bold text-lg text-gray-800 mb-4">Confirm Withdrawal</h4>
                         <p className="text-gray-600 mb-2">Withdraw <strong>GHS {parseFloat(amount).toFixed(2)}</strong> to linked account?</p>
                         <div className="mb-6">
                             <input 
                                type="password" 
                                value={pin}
                                onChange={(e) => setPin(e.target.value.slice(0, 4))}
                                placeholder="Enter PIN"
                                className="block w-32 mx-auto text-center tracking-widest text-2xl px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900"
                                maxLength={4}
                             />
                         </div>
                         <div className="flex gap-3">
                             <Button onClick={() => setWithdrawStep('INPUT')} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800">Back</Button>
                             <Button onClick={confirmWithdraw} className="flex-1 bg-yellow-600 hover:bg-yellow-700">Confirm</Button>
                         </div>
                     </div>
                 )}
            </div>
        )}
        
        {/* OTP Modal for Deposit */}
        {showOtpModal && (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Approve Request</h3>
                    <p className="text-gray-600 text-sm mb-4">A prompt has been sent to your phone. Please enter the OTP or approve the transaction to fund your wallet.</p>
                    <input 
                        type="text" 
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="Enter OTP (e.g. 1234)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900"
                    />
                    <div className="flex gap-3">
                        <Button onClick={() => setShowOtpModal(false)} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800">Cancel</Button>
                        <Button onClick={verifyDepositOtp} className="flex-1 bg-yellow-600 hover:bg-yellow-700">Verify</Button>
                    </div>
                </div>
            </div>
        )}

      </div>
    </Card>
  );
};

export default DigitalWallet;