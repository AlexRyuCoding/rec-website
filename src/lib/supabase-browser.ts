import { createClient } from "@supabase/supabase-js";
import { realtimeBrowserConfig } from "./realtime-config";

// Anon-key client for the browser. Used ONLY to subscribe to Realtime
// broadcast channels (no table access — RLS has no policies, so the anon
// key can read nothing; that posture is unchanged by this client).
// Its address and key are Realtime's own (realtime-config.ts).
export function createBrowserClient() {
  const { url, anonKey } = realtimeBrowserConfig();
  return createClient(url, anonKey);
}
