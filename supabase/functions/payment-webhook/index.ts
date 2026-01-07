// Follow this setup guide to deploy: https://supabase.com/docs/guides/functions/deploy
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Create Supabase Client with Admin Context
  // NOTE: Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars to be set in your Supabase project
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // 2. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 3. Parse Webhook Payload (e.g. from Paystack, MTN, etc.)
    const payload = await req.json();
    
    // 4. Validate Signature (Crucial Security Step - Example for Paystack)
    // const signature = req.headers.get('x-paystack-signature');
    // if (!isValidSignature(signature, payload)) throw new Error("Invalid Signature");

    // 5. Extract Details (Payment Reconciler Logic)
    // Looking for 'external_id' and 'final_amount' as per reconciliation requirements
    // Adapting generic payload extraction to support multiple formats
    const data = payload.data || payload; 
    
    const reference = data.reference || data.external_id || data.provider_reference;
    const amount = data.amount || data.final_amount; 
    const gatewayStatus = data.status; // e.g. 'success', 'successful', 'completed'

    if (!reference) {
        throw new Error("Missing transaction reference/external_id");
    }

    // Determine if status should be 'completed'
    // Common success codes: 'success', 'successful', 'completed', 'paid', '00'
    const isSuccess = ['success', 'successful', 'completed', 'paid', '00'].includes(String(gatewayStatus).toLowerCase());
    const newStatus = isSuccess ? 'completed' : 'failed';

    if (newStatus === 'completed') {
        // 6. Update Database securely
        const { error } = await supabaseClient
            .from('transactions')
            .update({ 
                status: 'completed',
                // Optionally update amount if the final_amount differs (reconciliation)
                // amount: amount 
            })
            .eq('provider_reference', reference);

        if (error) throw error;
        
        return new Response(JSON.stringify({ message: "Transaction reconciled", status: "completed" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    } else {
         // Mark as failed if explicitly failed
         const { error } = await supabaseClient
            .from('transactions')
            .update({ status: 'failed' })
            .eq('provider_reference', reference);
            
         if (error) throw error;
         
         return new Response(JSON.stringify({ message: "Transaction marked as failed" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})