import { afterEach, describe, expect, it, vi } from "vitest";
import { dbTarget, stripRestPrefix } from "./db-rest";

afterEach(() => vi.unstubAllGlobals());

describe("stripRestPrefix", () => {
  it("drops supabase-js's /rest/v1 from the start of the path", () => {
    expect(
      stripRestPrefix("http://127.0.0.1:3001/rest/v1/patients?select=id")
    ).toBe("http://127.0.0.1:3001/patients?select=id");
    expect(
      stripRestPrefix("http://127.0.0.1:3001/rest/v1/rpc/search_patients")
    ).toBe("http://127.0.0.1:3001/rpc/search_patients");
  });
  it("touches nothing else", () => {
    expect(stripRestPrefix("http://h/patients?x=/rest/v1/")).toBe(
      "http://h/patients?x=/rest/v1/"
    );
    expect(stripRestPrefix("http://h/realtime/v1/api/broadcast")).toBe(
      "http://h/realtime/v1/api/broadcast"
    );
  });
});

describe("dbTarget", () => {
  it("is our PostgREST, with the prefix taken off each request", async () => {
    const t = dbTarget({
      DB_REST_URL: "http://127.0.0.1:3001",
      DB_REST_JWT: "jwt",
    });
    expect(t.url).toBe("http://127.0.0.1:3001");
    expect(t.key).toBe("jwt");
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      seen.push(u);
      return new Response("[]");
    });
    await t.fetch("http://127.0.0.1:3001/rest/v1/rooms");
    expect(seen).toEqual(["http://127.0.0.1:3001/rooms"]);
  });

  // There is no other database to fall back to: a missing setting is an
  // error to be seen, never a quiet empty site.
  it("refuses to point anywhere without both settings", () => {
    expect(() => dbTarget({ DB_REST_JWT: "jwt" })).toThrow(
      "DB_REST_URL is not set"
    );
    expect(() => dbTarget({ DB_REST_URL: "http://127.0.0.1:3001" })).toThrow(
      "DB_REST_JWT is not set"
    );
  });

  it("ignores the settings of the old host entirely", () => {
    expect(() =>
      dbTarget({
        NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "svc",
      })
    ).toThrow("DB_REST_URL is not set");
  });
});
