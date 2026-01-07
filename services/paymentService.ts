
import { supabase } from './supabase';
import type { User } from '../types';

/**
 * Initiates a payment request.
 * In a real-world scenario, this would call a Paystack/MTN API which triggers a USSD prompt on the user's phone.
 * Since we can't do that here, we simulate it.
 */
export const initiatePayment = async (user: User, amount: number, provider: string, phoneNumber: string) => {
    // 1. Log the 'pending' transaction in Supabase
    const { data, error } = await supabase.from('transactions').insert([{
        user_id: user.uid,
        amount: amount,
        currency: 'GHS',
        type: 'DEPOSIT',
        status: 'pending',
        provider: provider, // 'MTN Mobile Money' etc.
        provider_reference: `SIM-${Date.now()}`, // Simulated Reference
        phone_number: phoneNumber,
        created_at: new Date().toISOString(),
        description: 'Wallet Top-up'
    }]).select().single();

    if (error) throw error;

    // 2. Simulate the Webhook delay (The "Server-Side" action)
    // In production, the Edge Function (payment-webhook) would be called by MTN/Paystack.
    // Here, we simulate that external call after 3 seconds.
    setTimeout(async () => {
        await simulateWebhookSuccess(data.id);
    }, 3000);

    return data;
};

/**
 * Simulates the external webhook hitting our backend to confirm payment.
 * This is strictly for demonstration purposes. In production, this logic lives in the Edge Function.
 */
const simulateWebhookSuccess = async (transactionId: string) => {
    await supabase.from('transactions')
        .update({ status: 'completed' })
        .eq('id', transactionId);
};

/**
 * Fetches transaction history for a user.
 */
export const getTransactionHistory = async (userId: string) => {
    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
};

/**
 * Fetches ALL transactions for Admin Analytics.
 */
export const getAllTransactions = async () => {
    const { data, error } = await supabase
        .from('transactions')
        .select('created_at, amount, provider, status, currency')
        .order('created_at', { ascending: false })
        .limit(500); // Limit for context window safety
    
    if (error) throw error;
    return data;
};

/**
 * Calculates current wallet balance from transaction history.
 * Secure approach: Calculate on server or via aggregation query.
 * Here we aggregate client-side from the transactions table.
 */
export const getWalletBalance = async (userId: string): Promise<number> => {
    const { data, error } = await supabase
        .from('transactions')
        .select('amount, type, status')
        .eq('user_id', userId)
        .eq('status', 'completed');

    if (error) {
        console.error("Error calculating balance:", error);
        return 0;
    }

    let balance = 0;
    data.forEach((tx: any) => {
        if (tx.type === 'DEPOSIT' || tx.type === 'LOAN') {
            balance += tx.amount;
        } else if (tx.type === 'WITHDRAWAL' || tx.type === 'PAYMENT' || tx.type === 'TRANSFER') {
            balance -= tx.amount;
        }
    });

    return balance;
};
