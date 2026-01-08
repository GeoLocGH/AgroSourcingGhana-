
import React, { useState, useEffect } from 'react';
import Card from './common/Card';
import Button from './common/Button';
import { 
    WalletIcon, 
    BanknotesIcon, 
    LightningIcon, 
    ShieldCheckIcon, 
    QrCodeIcon, 
    ArrowDownIcon, 
    ArrowUpIcon, 
    Spinner, 
    BankIcon,
    ArrowLeftIcon,
    HomeIcon,
    GridIcon,
    ClockIcon,
    ArrowRightIcon,
    UserCircleIcon,
    CameraIcon,
    CheckCircleIcon
} from './common/icons';
import { useNotifications } from '../contexts/NotificationContext';
import type { User, Transaction } from '../types';
import { initiatePayment, getWalletBalance, getTransactionHistory } from '../services/paymentService';
import { parsePaymentSMS } from '../services/geminiService';
import { supabase } from '../services/supabase';

// --- Constants & Mock Data ---

const NETWORKS = ["MTN", "Telecel", "AirtelTigo"];
const BANKS = ["GCB Bank", "Ecobank", "Fidelity", "Stanbic", "Zenith", "Absa"];

const BILL_PROVIDERS = [
    { id: 'ecg', name: 'ECG Prepaid', category: 'Utilities', icon: <LightningIcon className="w-5 h-5 text-yellow-600"/> },
    { id: 'gwcl', name: 'Ghana Water', category: 'Utilities', icon: <div className="w-5 h-5 bg-blue-500 rounded-full text-white flex items-center justify-center text-xs font-bold">W</div> },
    { id: 'dstv', name: 'DSTV', category: 'TV', icon: <div className="w-5 h-5 bg-blue-800 rounded-full text-white flex items-center justify-center text-xs font-bold">TV</div> },
    { id: 'gotv', name: 'GOtv', category: 'TV', icon: <div className="w-5 h-5 bg-green-600 rounded-full text-white flex items-center justify-center text-xs font-bold">GO</div> },
    { id: 'school', name: 'School Fees', category: 'Fees', icon: <div className="w-5 h-5 bg-orange-500 rounded-full text-white flex items-center justify-center text-xs font-bold">Sch</div> },
];

const INSURANCE_PLANS = [
    { id: 'crop_basic', name: 'Crop Shield Basic', premium: 15, coverage: 2000, desc: 'Covers drought & pests' },
    { id: 'crop_pro', name: 'Crop Shield Pro', premium: 45, coverage: 8000, desc: 'Full harvest protection' },
    { id: 'health_fam', name: 'Farmer Health', premium: 30, coverage: 5000, desc: 'Medical & accident cover' },
];

// --- Types ---

interface LinkedAccount {
  id: string;
  type: 'BANK' | 'MOMO';
  provider: string;
  accountNumber: string;
  accountName: string;
}

type WalletView = 'HOME' | 'DEPOSIT' | 'WITHDRAW' | 'TRANSFER' | 'BILLS' | 'LOANS' | 'INSURANCE' | 'QR' | 'HISTORY' | 'LINK_ACCOUNT' | 'VERIFY_SMS' | 'SETTINGS';

interface DigitalWalletProps {
    user: User | null;
}

// --- Component ---

const DigitalWallet: React.FC<DigitalWalletProps> = ({ user }) => {
  const { addNotification } = useNotifications();
  
  // State
  const [balance, setBalance] = useState(0.00);
  const [activeView, setActiveView] = useState<WalletView>('HOME');
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Linked Accounts - Initialized as empty, populated via useEffect based on user record
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);

  // Inputs
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState(''); // Used for transfer recipient OR manual deposit phone number
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [reference, setReference] = useState('');
  
  // QR State
  const [qrMode, setQrMode] = useState<'MY_CODE' | 'SCAN'>('MY_CODE');
  
  // PIN Verification
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pendingTransaction, setPendingTransaction] = useState<{
      type: Transaction['type']; 
      amount: number; 
      desc: string; 
      meta?: any 
  } | null>(null);

  // Feature Specific
  const [creditLimit, setCreditLimit] = useState(0);
  const [loanTerm, setLoanTerm] = useState('1');
  const [smsText, setSmsText] = useState('');
  const [verificationResult, setVerificationResult] = useState<any>(null);

  // --- Effects ---

  // Autofill Linked Accounts from User Profile
  useEffect(() => {
    if (user?.phone && user?.network) {
        setLinkedAccounts(prev => {
            // Only add if not already present (avoid duplicates on re-renders)
            if (prev.find(a => a.accountNumber === user.phone)) return prev;
            return [{
                id: 'auto-linked-1',
                type: 'MOMO',
                provider: user.network || 'MTN',
                accountNumber: user.phone || '',
                accountName: user.name
            }, ...prev];
        });
        // Default to the auto-linked account if none selected
        if (!selectedAccount) setSelectedAccount('auto-linked-1');
    }
  }, [user?.phone, user?.network, user?.name]);

  useEffect(() => {
      if (user?.uid) {
          setLoadingBalance(true);
          getWalletBalance(user.uid).then(bal => {
              setBalance(bal);
              // Simple credit score logic: 3.5x balance or min 500
              setCreditLimit(Math.max(500, Math.floor(bal * 3.5)));
          });
          getTransactionHistory(user.uid).then((txs: any) => setTransactions(txs || []));
          setLoadingBalance(false);

          const channel = supabase.channel('wallet_updates')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions', filter: `user_id=eq.${user.uid}` }, 
            (payload) => {
                const newTx = payload.new as Transaction;
                setTransactions(prev => [newTx, ...prev]);
                // Re-fetch balance to ensure sync (though optimistic UI handles visuals)
                getWalletBalance(user.uid!).then(setBalance);
            })
            .subscribe();

          return () => { supabase.removeChannel(channel); };
      }
  }, [user]);

  // --- Helpers ---

  const formatMoney = (amount: number) => `GHS ${amount.toFixed(2)}`;

  const handleTransactionStart = (type: Transaction['type'], amountVal: number, desc: string, meta?: any) => {
      if (amountVal <= 0) {
          addNotification({ type: 'wallet', title: 'Invalid Amount', message: 'Please enter a valid amount.', view: 'WALLET' });
          return;
      }
      if (type !== 'DEPOSIT' && type !== 'LOAN' && amountVal > balance) {
          addNotification({ type: 'wallet', title: 'Insufficient Funds', message: 'Top up your wallet first.', view: 'WALLET' });
          return;
      }
      
      setPendingTransaction({ type, amount: amountVal, desc, meta });
      setPin('');
      setShowPinModal(true);
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (pin.length !== 4) return;
      
      // Simulate PIN check
      if (pin === '0000') {
          addNotification({ type: 'wallet', title: 'Invalid PIN', message: 'Default PIN 0000 is not allowed. Try 1234.', view: 'WALLET' });
          return;
      }

      setShowPinModal(false);
      setIsProcessing(true);

      if (!pendingTransaction || !user?.uid) return;

      const { type, amount: txAmount, desc, meta } = pendingTransaction;

      // 1. Optimistic Update (Instant feedback)
      const oldBalance = balance;
      if (type === 'DEPOSIT' || type === 'LOAN') {
          setBalance(prev => prev + txAmount);
      } else {
          setBalance(prev => prev - txAmount);
      }

      // 2. Persist to DB
      try {
          // If it's a deposit, we use the service to simulate external flow (USSD trigger)
          if (type === 'DEPOSIT') {
              let provider = 'MTN';
              let phoneNumber = '0240000000';

              if (selectedAccount === 'MANUAL') {
                  provider = selectedProvider || 'MTN';
                  phoneNumber = recipient || user.phone || '0240000000';
              } else {
                  const account = linkedAccounts.find(a => a.id === selectedAccount);
                  provider = account?.provider || 'MTN';
                  phoneNumber = account?.accountNumber || user.phone || '0240000000';
              }

              await initiatePayment(user, txAmount, provider, phoneNumber);
          } else {
              // Direct DB insert for other types
              const { error } = await supabase.from('transactions').insert([{
                  user_id: user.uid,
                  amount: txAmount,
                  currency: 'GHS',
                  type: type, // Matches DB enum
                  status: 'completed',
                  provider: 'Wallet',
                  provider_reference: `TRX-${Date.now()}`,
                  phone_number: user.phone || 'N/A',
                  description: desc,
                  created_at: new Date().toISOString()
              }]);
              if (error) throw error;
          }

          addNotification({ type: 'wallet', title: 'Success', message: desc, view: 'WALLET' });
          
          // Reset Form State
          setAmount('');
          setRecipient('');
          setReference('');
          setSelectedProvider('');
          setActiveView('HOME'); // Return home on success

      } catch (error) {
          console.error(error);
          setBalance(oldBalance); // Rollback on error
          addNotification({ type: 'wallet', title: 'Transaction Failed', message: 'Network error. Please try again.', view: 'WALLET' });
      } finally {
          setIsProcessing(false);
          setPendingTransaction(null);
      }
  };

  const handleLinkAccount = (e: React.FormEvent) => {
      e.preventDefault();
      const newAcc: LinkedAccount = {
          id: Date.now().toString(),
          type: 'MOMO', // simplified for demo
          provider: selectedProvider || 'MTN',
          accountNumber: recipient,
          accountName: user?.name || 'User'
      };
      setLinkedAccounts([...linkedAccounts, newAcc]);
      addNotification({ type: 'wallet', title: 'Account Linked', message: 'Account verified successfully.', view: 'WALLET' });
      setActiveView('HOME');
      setRecipient('');
  };

  // --- Sub-Components ---

  const ActionButton = ({ icon, label, onClick, color = "blue" }: { icon: React.ReactNode, label: string, onClick: () => void, color: string }) => {
      const colorClasses: {[key: string]: string} = {
          green: 'bg-green-100 text-green-700 hover:bg-green-200',
          red: 'bg-red-100 text-red-700 hover:bg-red-200',
          blue: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
          yellow: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200',
          purple: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
          gray: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
      };
      
      return (
        <button onClick={onClick} className="flex flex-col items-center gap-2 group p-2">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 ${colorClasses[color]}`}>
                {React.cloneElement(icon as React.ReactElement, { className: "w-6 h-6" })}
            </div>
            <span className="text-xs font-medium text-gray-600 group-hover:text-gray-900">{label}</span>
        </button>
      );
  };

  const PinModal = () => (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center shadow-2xl">
              <ShieldCheckIcon className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <h3 className="text-xl font-bold text-gray-900 mb-1">Enter Security PIN</h3>
              <p className="text-sm text-gray-500 mb-6">Confirm {pendingTransaction?.type.toLowerCase()} of {formatMoney(pendingTransaction?.amount || 0)}</p>
              
              <form onSubmit={handlePinSubmit}>
                  <input 
                      type="password" 
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      maxLength={4}
                      autoFocus
                      className="w-32 text-center text-3xl tracking-[0.5em] font-bold border-b-2 border-gray-300 focus:border-green-500 outline-none mb-8 text-gray-800 bg-transparent"
                      placeholder="••••"
                  />
                  <div className="grid grid-cols-2 gap-3">
                      <Button type="button" onClick={() => setShowPinModal(false)} className="bg-gray-200 !text-gray-800">Cancel</Button>
                      <Button type="submit" disabled={pin.length !== 4}>Confirm</Button>
                  </div>
              </form>
          </div>
      </div>
  );

  // --- Views ---

  const renderHome = () => (
      <div className="space-y-6 animate-fade-in pb-10">
          {/* Balance Card */}
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10"><WalletIcon className="w-40 h-40" /></div>
              <div className="relative z-10">
                  <div className="flex justify-between items-start mb-2">
                      <span className="text-gray-300 text-sm font-medium">Available Balance</span>
                      <div className="p-1.5 bg-white/10 rounded-lg cursor-pointer hover:bg-white/20" onClick={() => setActiveView('QR')}>
                          <QrCodeIcon className="w-5 h-5 text-white" />
                      </div>
                  </div>
                  <h2 className="text-4xl font-bold mb-6 tracking-tight flex items-center gap-2">
                      {balance.toFixed(2)} <span className="text-lg font-normal text-gray-400">GHS</span>
                      {loadingBalance && <Spinner className="w-4 h-4" />}
                  </h2>
              </div>
          </div>

          {/* Main Actions Group */}
          <div>
              <h3 className="text-gray-800 font-bold mb-3 px-1 text-sm uppercase tracking-wider">Main Actions</h3>
              <div className="grid grid-cols-4 gap-2 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                  <ActionButton icon={<ArrowDownIcon />} label="Deposit" onClick={() => setActiveView('DEPOSIT')} color="green" />
                  <ActionButton icon={<ArrowUpIcon />} label="Withdraw" onClick={() => setActiveView('WITHDRAW')} color="red" />
                  <ActionButton icon={<BankIcon />} label="Link" onClick={() => setActiveView('LINK_ACCOUNT')} color="gray" />
                  <ActionButton icon={<QrCodeIcon />} label="Scan" onClick={() => setActiveView('QR')} color="purple" />
              </div>
          </div>

          {/* Services Group */}
          <div>
              <h3 className="text-gray-800 font-bold mb-3 px-1 text-sm uppercase tracking-wider">Services</h3>
              <div className="grid grid-cols-3 gap-3">
                  <div onClick={() => setActiveView('BILLS')} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-2 hover:bg-yellow-50 cursor-pointer h-24 transition-colors">
                      <LightningIcon className="w-8 h-8 text-yellow-600" />
                      <span className="text-xs font-bold text-gray-700">Pay Bills</span>
                  </div>
                  <div onClick={() => setActiveView('LOANS')} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-2 hover:bg-blue-50 cursor-pointer h-24 transition-colors">
                      <BanknotesIcon className="w-8 h-8 text-blue-600" />
                      <span className="text-xs font-bold text-gray-700">Loans</span>
                  </div>
                  <div onClick={() => setActiveView('INSURANCE')} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-2 hover:bg-green-50 cursor-pointer h-24 transition-colors">
                      <ShieldCheckIcon className="w-8 h-8 text-green-600" />
                      <span className="text-xs font-bold text-gray-700">Insurance</span>
                  </div>
              </div>
          </div>

          {/* Account Management Group */}
          <div>
              <h3 className="text-gray-800 font-bold mb-3 px-1 text-sm uppercase tracking-wider">Account Management</h3>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y">
                  <div onClick={() => setActiveView('HISTORY')} className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-gray-100 rounded-full text-gray-600"><ClockIcon className="w-5 h-5"/></div>
                          <span className="font-medium text-gray-700">Transaction History</span>
                      </div>
                      <ArrowRightIcon className="w-5 h-5 text-gray-400" />
                  </div>
                  <div onClick={() => setActiveView('VERIFY_SMS')} className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-gray-100 rounded-full text-gray-600"><CheckCircleIcon className="w-5 h-5"/></div>
                          <span className="font-medium text-gray-700">Verify Payment SMS</span>
                      </div>
                      <ArrowRightIcon className="w-5 h-5 text-gray-400" />
                  </div>
                  <div onClick={() => setActiveView('SETTINGS')} className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-gray-100 rounded-full text-gray-600"><UserCircleIcon className="w-5 h-5"/></div>
                          <span className="font-medium text-gray-700">Settings & Security</span>
                      </div>
                      <ArrowRightIcon className="w-5 h-5 text-gray-400" />
                  </div>
              </div>
          </div>
      </div>
  );

  const renderBills = () => (
      <div className="animate-fade-in max-w-md mx-auto">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Pay Bills</h3>
          <div className="grid grid-cols-2 gap-3 mb-6">
              {BILL_PROVIDERS.map(prov => (
                  <div 
                    key={prov.id} 
                    onClick={() => { setSelectedProvider(prov.id); setReference(''); }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col items-center gap-2 ${selectedProvider === prov.id ? 'border-yellow-500 bg-yellow-50 ring-1 ring-yellow-500' : 'border-gray-200 bg-white hover:border-yellow-300'}`}
                  >
                      {prov.icon}
                      <span className="text-xs font-bold text-gray-700">{prov.name}</span>
                  </div>
              ))}
          </div>

          {selectedProvider && (
              <div className="space-y-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Account / Meter Number</label>
                      <input value={reference} onChange={e => setReference(e.target.value)} className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900" placeholder="e.g. 123456789" />
                  </div>
                  <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Amount</label>
                      <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900" placeholder="0.00" />
                  </div>
                  <Button onClick={() => handleTransactionStart('PAYMENT', parseFloat(amount), `Bill: ${BILL_PROVIDERS.find(p => p.id === selectedProvider)?.name}`)} className="w-full bg-yellow-600 hover:bg-yellow-700">
                      Pay Bill
                  </Button>
              </div>
          )}
      </div>
  );

  const renderLoans = () => (
      <div className="animate-fade-in max-w-md mx-auto">
          <div className="bg-blue-600 text-white p-6 rounded-2xl shadow-lg mb-6 text-center">
              <p className="text-blue-100 text-sm font-medium mb-1">Pre-Approved Limit</p>
              <h3 className="text-3xl font-bold">{formatMoney(creditLimit)}</h3>
              <p className="text-xs text-blue-200 mt-2">Interest Rate: 5% / month</p>
          </div>

          <div className="space-y-4 bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Loan Amount</label>
                  <input type="number" max={creditLimit} value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" placeholder="0.00" />
                  <div className="flex justify-between mt-1 text-xs text-gray-400">
                      <span>Min: GHS 50</span>
                      <span>Max: GHS {creditLimit}</span>
                  </div>
              </div>
              <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Duration</label>
                  <div className="flex gap-2">
                      {['1', '3', '6'].map(m => (
                          <button key={m} onClick={() => setLoanTerm(m)} className={`flex-1 py-2 rounded-lg border text-sm font-medium ${loanTerm === m ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-600'}`}>
                              {m} Month{m !== '1' && 's'}
                          </button>
                      ))}
                  </div>
              </div>

              {amount && (
                  <div className="bg-blue-50 p-3 rounded-lg flex justify-between items-center text-sm">
                      <span className="text-blue-800">Repayment Total:</span>
                      <span className="font-bold text-blue-900">{formatMoney(parseFloat(amount) * (1 + (parseInt(loanTerm) * 0.05)))}</span>
                  </div>
              )}

              <Button onClick={() => handleTransactionStart('LOAN', parseFloat(amount), `Loan Disbursement (${loanTerm} mo)`)} className="w-full bg-blue-600 hover:bg-blue-700">
                  Request Loan
              </Button>
          </div>
      </div>
  );

  const renderInsurance = () => (
      <div className="animate-fade-in space-y-4 max-w-md mx-auto">
          {INSURANCE_PLANS.map(plan => (
              <div key={plan.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:border-green-400 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-100 text-green-700 rounded-lg"><ShieldCheckIcon className="w-6 h-6" /></div>
                          <div>
                              <h4 className="font-bold text-gray-900">{plan.name}</h4>
                              <p className="text-xs text-gray-500">{plan.desc}</p>
                          </div>
                      </div>
                      <span className="text-lg font-bold text-green-700">GHS {plan.premium}<span className="text-xs font-normal text-gray-400">/mo</span></span>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-50">
                      <span className="text-xs font-medium text-gray-500">Coverage: GHS {plan.coverage}</span>
                      <Button onClick={() => handleTransactionStart('PAYMENT', plan.premium, `Insurance: ${plan.name}`)} className="text-xs px-4 py-2 bg-green-600 hover:bg-green-700">
                          Subscribe
                      </Button>
                  </div>
              </div>
          ))}
      </div>
  );

  const renderDepositWithdraw = (mode: 'DEPOSIT' | 'WITHDRAW') => (
    <div className="animate-fade-in max-w-md mx-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-4 capitalize">{mode.toLowerCase()} Funds</h3>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                    {mode === 'DEPOSIT' ? 'From Account' : 'To Account'}
                </label>
                <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-gray-900">
                    <option value="">Select Linked Account</option>
                    {linkedAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.provider} - {acc.accountNumber}</option>)}
                    <option value="MANUAL">Manual Entry</option>
                </select>
                {linkedAccounts.length === 0 && selectedAccount !== 'MANUAL' && <p className="text-xs text-red-500 mt-1">Please link an account or select manual entry.</p>}
            </div>

            {selectedAccount === 'MANUAL' && (
                <div className="grid grid-cols-2 gap-3 animate-fade-in">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Provider</label>
                        <select 
                            value={selectedProvider} 
                            onChange={e => setSelectedProvider(e.target.value)} 
                            className="w-full p-3 bg-gray-50 border rounded-lg outline-none text-gray-900"
                        >
                            <option value="">Select</option>
                            {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Number</label>
                        <input 
                            value={recipient} 
                            onChange={e => setRecipient(e.target.value)} 
                            placeholder="024..." 
                            className="w-full p-3 bg-gray-50 border rounded-lg outline-none text-gray-900"
                        />
                    </div>
                </div>
            )}

            <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Amount</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-gray-900" placeholder="0.00" />
            </div>
            
            <Button onClick={() => {
                const desc = selectedAccount === 'MANUAL' 
                    ? `${mode === 'DEPOSIT' ? 'Deposit from' : 'Withdrawal to'} ${selectedProvider} - ${recipient}`
                    : `${mode === 'DEPOSIT' ? 'Deposit from' : 'Withdrawal to'} Linked Account`;
                
                handleTransactionStart(mode === 'WITHDRAW' ? 'WITHDRAWAL' : mode, parseFloat(amount), desc);
            }} className={`w-full ${mode === 'DEPOSIT' ? 'bg-green-600' : 'bg-red-600'}`}>
                Confirm {mode === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'}
            </Button>
        </div>
    </div>
  );

  const renderQr = () => (
      <div className="animate-fade-in text-center max-w-sm mx-auto">
          <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
              <button 
                onClick={() => setQrMode('MY_CODE')}
                className={`flex-1 py-2 text-sm font-medium rounded-md ${qrMode === 'MY_CODE' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                  My Code
              </button>
              <button 
                onClick={() => setQrMode('SCAN')}
                className={`flex-1 py-2 text-sm font-medium rounded-md ${qrMode === 'SCAN' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                  Scan Code
              </button>
          </div>

          {qrMode === 'MY_CODE' ? (
              <div className="flex flex-col items-center">
                  <div className="relative group">
                      {/* Outer Glow/Ring */}
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-blue-600 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-1000 group-hover:duration-200"></div>
                      
                      {/* Card Container */}
                      <div className="relative bg-white p-6 rounded-2xl shadow-xl border border-gray-100 flex flex-col items-center">
                          {/* QR Code Image */}
                          <div className="bg-white p-1 rounded-lg">
                             <img 
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(user?.phone || user?.uid || 'AGRO_USER')}&margin=2`}
                                alt="Payment QR" 
                                className="w-56 h-56 object-contain"
                             />
                          </div>
                          
                          {/* User Info */}
                          <div className="mt-5 text-center">
                              <h3 className="text-lg font-bold text-gray-900 flex items-center justify-center gap-1.5">
                                  {user?.name}
                                  {user?.merchant_id && <ShieldCheckIcon className="w-4 h-4 text-blue-500" title="Verified Merchant" />}
                              </h3>
                              <p className="text-sm text-gray-500 font-mono tracking-wider mt-1">{user?.phone || 'No Phone Linked'}</p>
                          </div>
                      </div>
                      
                      {/* Central Logo Overlay (Simulated) */}
                      <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-[60%] w-10 h-10 bg-white rounded-full p-1 shadow-md border border-gray-200 flex items-center justify-center">
                          <div className="w-full h-full bg-gray-900 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                              Ag
                          </div>
                      </div>
                  </div>
                  <p className="text-sm text-gray-500 mt-6">Scan to pay instantly</p>
              </div>
          ) : (
              <div className="bg-black rounded-2xl aspect-square flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 border-2 border-green-500/50 rounded-2xl animate-pulse"></div>
                  <CameraIcon className="w-16 h-16 text-gray-600 mb-4 opacity-50" />
                  <p className="text-gray-400 text-sm mb-4">Point camera at QR code</p>
                  <Button onClick={() => {
                      addNotification({ type: 'wallet', title: 'Code Scanned', message: 'Found: Kofi (0244123456). Redirecting...', view: 'WALLET' });
                      setRecipient('0244123456');
                      setActiveView('TRANSFER');
                  }} className="bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm">Simulate Scan</Button>
              </div>
          )}
      </div>
  );

  return (
    <Card className="min-h-[600px] relative">
      {/* Header / Nav */}
      <div className="flex items-center justify-between mb-4">
          {activeView === 'HOME' ? (
              <div className="flex items-center gap-2">
                   <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center text-white font-bold text-xs">Ag</div>
                   <span className="font-bold text-gray-900 tracking-tight">AgroWallet</span>
              </div>
          ) : (
              <button onClick={() => setActiveView('HOME')} className="flex items-center text-gray-600 hover:text-gray-900 bg-gray-100 px-3 py-1.5 rounded-lg text-sm font-medium">
                  <ArrowLeftIcon className="w-4 h-4 mr-1" /> Back
              </button>
          )}
          <div className="flex gap-3">
             <button onClick={() => setActiveView('HOME')} className={`p-2 rounded-full ${activeView === 'HOME' ? 'bg-gray-100 text-gray-900' : 'text-gray-400'}`}>
                 <HomeIcon className="w-5 h-5" />
             </button>
             <button onClick={() => setActiveView('HISTORY')} className={`p-2 rounded-full ${activeView === 'HISTORY' ? 'bg-gray-100 text-gray-900' : 'text-gray-400'}`}>
                 <GridIcon className="w-5 h-5" />
             </button>
          </div>
      </div>

      {/* Main Content Area */}
      <div className="pb-4">
          {activeView === 'HOME' && renderHome()}
          {activeView === 'BILLS' && renderBills()}
          {activeView === 'LOANS' && renderLoans()}
          {activeView === 'INSURANCE' && renderInsurance()}
          {activeView === 'DEPOSIT' && renderDepositWithdraw('DEPOSIT')}
          {activeView === 'WITHDRAW' && renderDepositWithdraw('WITHDRAW')}
          {activeView === 'QR' && renderQr()}
          
          {/* Reuse logic for simple views */}
          {activeView === 'LINK_ACCOUNT' && (
               <div className="max-w-md mx-auto animate-fade-in">
                   <h3 className="text-lg font-bold mb-4">Link New Account</h3>
                   <div className="bg-white p-5 rounded-xl border space-y-4">
                       <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="w-full p-3 border rounded-lg bg-white text-gray-900">
                           <option value="">Select Provider</option>
                           {[...NETWORKS, ...BANKS].map(p => <option key={p} value={p}>{p}</option>)}
                       </select>
                       <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Account/Phone Number" className="w-full p-3 border rounded-lg text-gray-900" />
                       <Button onClick={handleLinkAccount} className="w-full">Link Account</Button>
                   </div>
               </div>
          )}

          {activeView === 'TRANSFER' && (
              <div className="max-w-md mx-auto animate-fade-in">
                  <h3 className="text-lg font-bold mb-4">Send Money</h3>
                  <div className="bg-white p-5 rounded-xl border space-y-4">
                       <input type="tel" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Recipient Phone (024...)" className="w-full p-3 border rounded-lg text-gray-900" />
                       <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (GHS)" className="w-full p-3 border rounded-lg text-gray-900" />
                       <Button onClick={() => handleTransactionStart('TRANSFER', parseFloat(amount), `Transfer to ${recipient}`)} className="w-full bg-blue-600 hover:bg-blue-700">Next</Button>
                  </div>
              </div>
          )}

          {activeView === 'HISTORY' && (
               <div className="animate-fade-in">
                   <h3 className="font-bold text-lg mb-4">All Transactions</h3>
                   <div className="space-y-3">
                       {transactions.map(tx => (
                          <div key={tx.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
                              <div>
                                  <p className="font-bold text-gray-800">{tx.description}</p>
                                  <p className="text-xs text-gray-500">{new Date(tx.created_at).toLocaleString()}</p>
                              </div>
                              <span className={`font-bold ${['DEPOSIT', 'LOAN'].includes(tx.type) ? 'text-green-600' : 'text-gray-800'}`}>
                                  {['DEPOSIT', 'LOAN'].includes(tx.type) ? '+' : '-'} {tx.amount.toFixed(2)}
                              </span>
                          </div>
                       ))}
                   </div>
               </div>
          )}
          
          {activeView === 'VERIFY_SMS' && (
            <div className="max-w-md mx-auto animate-fade-in">
                <h3 className="text-lg font-bold mb-4">Verify Payment SMS</h3>
                <textarea value={smsText} onChange={e => setSmsText(e.target.value)} rows={4} className="w-full p-3 border rounded-lg mb-4 text-gray-900" placeholder="Paste SMS..." />
                <Button onClick={async () => {
                    const res = await parsePaymentSMS(smsText);
                    setVerificationResult(res);
                }} className="w-full">Verify</Button>
                {verificationResult && (
                    <div className="mt-4 p-4 bg-green-50 rounded border border-green-200">
                        <p className="font-bold text-green-800">Status: {verificationResult.status}</p>
                        <p className="text-sm">Amount: {verificationResult.amount}</p>
                    </div>
                )}
            </div>
          )}

          {activeView === 'SETTINGS' && (
              <div className="max-w-md mx-auto animate-fade-in bg-white p-6 rounded-xl border text-center text-gray-500">
                  <ShieldCheckIcon className="w-12 h-12 mx-auto mb-2 text-gray-300"/>
                  <p>Security Settings and PIN management coming soon.</p>
              </div>
          )}
      </div>

      {showPinModal && <PinModal />}
    </Card>
  );
};

export default DigitalWallet;
