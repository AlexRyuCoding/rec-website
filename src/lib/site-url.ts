// An absolute address on this site, for a redirect a route sends.
//
// Built on NEXTAUTH_URL — the site's public address — and not on the
// request's own URL. Behind a proxy that is not the same thing: on Cloud
// Run a route's `req.url` is the address the server listens on
// (http://0.0.0.0:8080/…), and a redirect built from it sends the browser
// nowhere. On Vercel the two are the same address, so nothing changes
// there. The request is used only if NEXTAUTH_URL is not set.
//
// (The middleware's redirects are not affected: Next.js sends those as a
// path. Reading the query of `req.url` is fine anywhere.)
export function siteUrl(path: string, req: { url: string }): URL {
  const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  return new URL(path, base || req.url);
}
