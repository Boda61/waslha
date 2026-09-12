// ┌─────────────────────────────────────────────────────────────────────────┐
// │  Waslha — Supabase client (replaces the old Firebase client module)     │
// │  Only public, publishable configuration is used here. No secrets.       │
// └─────────────────────────────────────────────────────────────────────────┘
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Fail fast with a clear developer message instead of a cryptic runtime error.
  // console.error is intentional here — there is no user-facing UI at this point.
  console.error('Supabase env vars missing — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Persist the session across reloads (replaces onAuthStateChanged + token refresh).
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInLoad: true,
  },
  realtime: {
    // Ack timeouts help recover quickly on flaky networks.
    params: { api: { heartbeat: true } },
  },
});

export default supabase;