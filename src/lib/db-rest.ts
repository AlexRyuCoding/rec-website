// Where the server's database client points. Pure: the caller hands in
// the environment, nothing here imports supabase-js.
//
// Two hosts run the same build:
//  - Supabase (nothing new set): the project's address and its
//    service-role key, exactly as before.
//  - A PostgREST of our own (DB_REST_URL + DB_REST_JWT): the same REST
//    layer Supabase runs, so every query stays as written. supabase-js
//    always asks for `<address>/rest/v1/<table>`; a bare PostgREST serves
//    `<address>/<table>`, so the prefix is taken off each request.
//
// DB_REST_URL is an address without a path (http://127.0.0.1:3001).

export interface DbTarget {
  url: string;
  key: string;
  fetch?: typeof fetch;
}

// Only at the very start of the path: a "/rest/v1" further along, or in
// the query, is somebody's data.
const REST_PREFIX = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)\/rest\/v1(?=[/?#]|$)/i;

export function stripRestPrefix(url: string): string {
  return url.replace(REST_PREFIX, "$1");
}

export function dbTarget(env: Record<string, string | undefined>): DbTarget {
  const url = env.DB_REST_URL;
  if (!url) {
    return {
      url: env.NEXT_PUBLIC_SUPABASE_URL as string,
      key: env.SUPABASE_SERVICE_ROLE_KEY as string,
    };
  }
  // Never "PostgREST's address with Supabase's key", and never a quiet
  // return to Supabase: a half-set Google side is a mistake to be seen.
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
