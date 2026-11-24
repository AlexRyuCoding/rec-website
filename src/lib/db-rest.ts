// Where the server's database client points. Pure: the caller hands in
// the environment, nothing here imports supabase-js.
//
// The database is Cloud SQL, reached through a PostgREST of our own
// (DB_REST_URL + DB_REST_JWT) — the same REST layer Supabase ran, so
// every query stays as it was written for Supabase. supabase-js always
// asks for `<address>/rest/v1/<table>`; a bare PostgREST serves
// `<address>/<table>`, so the prefix is taken off each request.
//
// DB_REST_URL is an address without a path (http://127.0.0.1:3001).
// Both must be set: there is no other database to fall back to, and a
// missing setting is an error to be seen, never a quiet empty site.

export interface DbTarget {
  url: string;
  key: string;
  fetch: typeof fetch;
}

// Only at the very start of the path: a "/rest/v1" further along, or in
// the query, is somebody's data.
const REST_PREFIX = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)\/rest\/v1(?=[/?#]|$)/i;

export function stripRestPrefix(url: string): string {
  return url.replace(REST_PREFIX, "$1");
}

export function dbTarget(env: Record<string, string | undefined>): DbTarget {
  const url = env.DB_REST_URL;
  if (!url) throw new Error("DB_REST_URL is not set");
  const key = env.DB_REST_JWT;
  if (!key) throw new Error("DB_REST_JWT is not set");
  return {
    url,
    key,
    // `fetch` is looked up on each call, not captured here.
    fetch: (input, init) => {
      if (typeof input === "string") return fetch(stripRestPrefix(input), init);
      if (input instanceof URL) return fetch(stripRestPrefix(input.href), init);
      return fetch(new Request(stripRestPrefix(input.url), input), init);
    },
  };
}
