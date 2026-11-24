// The room timer board connects from the browser to Supabase Realtime
// (wss:// websocket + https:// fallback), so the Realtime project's host
// must be in connect-src. Without it, WebKit (every iPad browser) throws
// synchronously from the blocked WebSocket constructor and crashes the
// page, while Chromium just silently loses realtime.
//
// The host is the one src/lib/realtime-config.ts connects to — keep the
// two in step. Browsers never talk to the database, so its host is not
// allowed for its own sake.
const realtimeHttp = process.env.NEXT_PUBLIC_REALTIME_URL || "";
const realtimeWs = realtimeHttp.replace(/^https:/, "wss:");
// One policy for the whole site, with the few extra allowances the
// waiting-room TV needs for background music (see src/lib/music.ts).
// Those are granted to /waiting-room only — the kiosk, the dashboard and
// the public pages still load nothing from outside.
function buildCsp({ music = false } = {}) {
  const join = (...parts) => parts.filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    join(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // YouTube's IFrame Player API and Spotify's Web Playback SDK.
      music && "https://www.youtube.com https://sdk.scdn.co"
    ),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    join(
      "connect-src 'self'",
      realtimeHttp,
      realtimeWs,
      // "Play this playlist on this screen" goes to Spotify's API.
      music &&
        "https://api.spotify.com https://*.spotify.com wss://*.spotify.com"
    ),
    // The two players are iframes; nothing else may be framed.
    music && "frame-src https://www.youtube.com https://sdk.scdn.co",
    // Radio: staff may choose any station, so any https stream.
    music && "media-src 'self' https: blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
    .filter(Boolean)
    .join("; ");
}
const CSP = buildCsp();
const WAITING_ROOM_CSP = buildCsp({ music: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Also write .next/standalone: the server with only the files it needs,
  // which is what the container image runs (Dockerfile). Vercel builds
  // its own way and is not affected.
  output: "standalone",
  images: {
    formats: ["image/avif", "image/webp"],
  },
  headers: async () => {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
      // Listed after the catch-all on purpose: when two entries set the
      // same header for a path, Next.js uses the later one.
      {
        source: "/waiting-room",
        headers: [{ key: "Content-Security-Policy", value: WAITING_ROOM_CSP }],
      },
    ];
  },
};

module.exports = nextConfig;
