import { createClient } from '@supabase/supabase-js';

// Hardcoded credentials for Agro Sourcing Ghana project
const supabaseUrl = 'https://vhigfbctihanitwrrohv.supabase.co';
const supabaseKey = 'sb_publishable_OmoujvfmVnGB5XcXpfBlJA_Nuuo4UIS';

export const supabase = createClient(supabaseUrl, supabaseKey);
