import { createClient } from "@supabase/supabase-js";

/** Server-side Supabase client, or null when SUPABASE_URL / SUPABASE_ANON_KEY aren't set (local JSON/memory mode). */
export function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}
