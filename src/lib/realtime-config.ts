// Where live updates (Supabase Realtime) connect — settings of their own,
// so the database and Realtime can live in different places. Realtime
// carries no patient data (see rooms-realtime.ts), which is why it may
// stay in a Supabase project of its own while the database is elsewhere.
//
// The rule: the new settings are used only as a complete set, otherwise
// Supabase's are used whole. A new address is never paired with an old
// key. The browser's set is address + anon key; the server's is address +
// service key. next.config.js applies the browser's rule to the
// content-security policy — keep the two in step.
//
// Both functions read process.env when called. The NEXT_PUBLIC_ names
// must stay written out in full: Next.js puts their values into the
// browser's code by finding exactly these expressions at build time.

export function realtimeBrowserConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_REALTIME_URL;
  const anonKey = process.env.NEXT_PUBLIC_REALTIME_ANON_KEY;
  if (url && anonKey) return { url, anonKey };
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  };
}

// Server only. `separate` = the new settings are in use.
export function realtimeServerConfig(): {
  url: string;
  serviceKey: string;
  separate: boolean;
} {
  const url = process.env.NEXT_PUBLIC_REALTIME_URL;
  const serviceKey = process.env.REALTIME_SERVICE_KEY;
  if (url && serviceKey) return { url, serviceKey, separate: true };
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    separate: false,
  };
}
