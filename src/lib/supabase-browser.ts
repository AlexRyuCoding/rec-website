import { createClient } from "@supabase/supabase-js";

// Anon-key client for the browser. Used ONLY to subscribe to Realtime
// broadcast channels (no table access — RLS has no policies, so the anon
// key can read nothing; that posture is unchanged by this client).
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
