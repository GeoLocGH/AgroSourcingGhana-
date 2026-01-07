
import { createClient } from '@supabase/supabase-js';

// Usage of provided specific credentials for Agro Sourcing Ghana project
const supabaseUrl = process.env.SUPABASE_URL || 'https://vhigfbctihanitwrrohv.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_OmoujvfmVnGB5XcXpfBlJA_Nuuo4UIS';

export const supabase = createClient(supabaseUrl, supabaseKey);
