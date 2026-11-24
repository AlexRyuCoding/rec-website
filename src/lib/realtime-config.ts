// Where live updates (Supabase Realtime) connect. Realtime carries no
// patient data (see rooms-realtime.ts), which is why it lives in a free
// Supabase project of its own while the database is on Cloud SQL.
//
// The browser's set is address + anon key; the server's is address +
// service key. next.config.js puts the same address into the
// content-security policy — keep the two in step, or the policy blocks
// the board's websocket, which crashes the page on an iPad.
//
// Both functions read process.env when called. The NEXT_PUBLIC_ names
// must stay written out in full: Next.js puts their values into the
// browser's code by finding exactly these expressions at build time (the
// Dockerfile refuses to build without them).

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function realtimeBrowserConfig(): { url: string; anonKey: string } {
  return {
    url: required(
      "NEXT_PUBLIC_REALTIME_URL",
      process.env.NEXT_PUBLIC_REALTIME_URL
    ),
    anonKey: required(
      "NEXT_PUBLIC_REALTIME_ANON_KEY",
      process.env.NEXT_PUBLIC_REALTIME_ANON_KEY
    ),
  };
}

// Server only.
export function realtimeServerConfig(): { url: string; serviceKey: string } {
  return {
    url: required(
      "NEXT_PUBLIC_REALTIME_URL",
      process.env.NEXT_PUBLIC_REALTIME_URL
    ),
    serviceKey: required(
      "REALTIME_SERVICE_KEY",
      process.env.REALTIME_SERVICE_KEY
    ),
  };
}
