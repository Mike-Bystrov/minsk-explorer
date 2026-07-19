import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://shvgbprjrtwyvwzvgedg.supabase.co";
const supabaseAnonKey = "sb_publishable_DV4B2LRfveYTEyO4vRjmgA_3YTLQWEt";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
