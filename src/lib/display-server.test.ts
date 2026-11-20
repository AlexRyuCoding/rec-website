import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatDisplayCookie,
  generateSecret,
  hashSecret,
} from "./display-auth";
import { authorizeDisplay } from "./display-server";

const T0 = Date.parse("2026-11-19T18:00:00.000Z");
const ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

// The one lookup authorizeDisplay makes, answered with a canned result.
const clientReturning = (result: { data: unknown; error: unknown }) =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => result }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }) as unknown as SupabaseClient;

describe("authorizeDisplay", () => {
  const secret = generateSecret();
  const cookie = formatDisplayCookie(ID, secret);
  const approvedRow = {
    id: ID,
    code: "K7M4QX",
    secret_hash: hashSecret(secret),
    created_at: new Date(T0 - 86_400_000).toISOString(),
    approved_at: new Date(T0 - 86_000_000).toISOString(),
    revoked_at: null,
    last_seen_at: new Date(T0 - 5_000).toISOString(),
  };

  it("accepts a paired screen", async () => {
    const client = clientReturning({ data: approvedRow, error: null });
    expect(await authorizeDisplay(client, cookie, T0)).toEqual({
      status: "ok",
    });
  });

  it("reports a database failure as an error, never as unpaired", async () => {
    // "none" makes the TV ask for a new pairing, which overwrites its
    // cookie. A database blip must not cost a working screen its pairing.
    const client = clientReturning({
      data: null,
      error: { message: "connection reset" },
    });
    expect(await authorizeDisplay(client, cookie, T0)).toEqual({
      status: "error",
    });
  });

  it("treats a screen the database does not know as unpaired", async () => {
    const client = clientReturning({ data: null, error: null });
    expect(await authorizeDisplay(client, cookie, T0)).toEqual({
      status: "none",
    });
  });

  it("treats a revoked screen as unpaired", async () => {
    const revoked = { ...approvedRow, revoked_at: new Date(T0).toISOString() };
    const client = clientReturning({ data: revoked, error: null });
    expect(await authorizeDisplay(client, cookie, T0)).toEqual({
      status: "none",
    });
  });

  it("does not touch the database for a garbled cookie", async () => {
    const client = {
      from: () => {
        throw new Error("must not query");
      },
    } as unknown as SupabaseClient;
    expect(await authorizeDisplay(client, "garbage", T0)).toEqual({
      status: "none",
    });
  });
});
