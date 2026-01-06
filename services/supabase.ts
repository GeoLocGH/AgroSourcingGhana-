
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vhigfbctihanitwrrohv.supabase.co';
const supabaseKey = 'sb_publishable_OmoujvfmVnGB5XcXpfBlJA_Nuuo4UIS';

export const supabase = createClient(supabaseUrl, supabaseKey);
