import { afterEach, describe, expect, it, vi } from "vitest";
import { dbTarget, stripRestPrefix } from "./db-rest";

afterEach(() => vi.unstubAllGlobals());

describe("stripRestPrefix", () => {
  it("drops Supabase's /rest/v1 from the start of the path", () => {
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
  const supabase = {
    NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "svc",
  };
  it("is Supabase, untouched, when DB_REST_URL is not set", () => {
    expect(dbTarget(supabase)).toEqual({
      url: "https://x.supabase.co",
      key: "svc",
    });
  });
  it("is PostgREST when DB_REST_URL is set, even if Supabase's are too", async () => {
    const t = dbTarget({
      ...supabase,
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
    await t.fetch!("http://127.0.0.1:3001/rest/v1/rooms");
    expect(seen).toEqual(["http://127.0.0.1:3001/rooms"]);
  });
  it("refuses a half-configured Google side instead of falling back to Supabase", () => {
    expect(() =>
      dbTarget({ ...supabase, DB_REST_URL: "http://127.0.0.1:3001" })
    ).toThrow("DB_REST_JWT is not set");
  });
});
