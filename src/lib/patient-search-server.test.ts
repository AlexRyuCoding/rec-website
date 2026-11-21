import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePatientSearch } from "./patient-search";
import { searchPatients, type RunnableSearch } from "./patient-search-server";

type Answer = { data: unknown; error: { code: string } | null };

// A stand-in for the Supabase client that records what it was asked.
function fakeSupabase(rpcAnswer: Answer, tableAnswer?: Answer) {
  const calls: { rpc: unknown[][]; or: string[] } = { rpc: [], or: [] };
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    or: (filter: string) => {
      calls.or.push(filter);
      return builder;
    },
    then: (resolve: (v: unknown) => void) =>
      resolve(tableAnswer ?? { data: [], error: null }),
  };
  const client = {
    rpc: async (...args: unknown[]) => {
      calls.rpc.push(args);
      return rpcAnswer;
    },
    from: () => builder,
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const typed = (text: string) => parsePatientSearch(text) as RunnableSearch;

const ann = {
  id: "p1",
  first_name: "Ann",
  last_name: "Licater",
  email: "al@example.com",
  phone: "(415) 555-1234",
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("searchPatients", () => {
  it("sends the words to the database function", async () => {
    const { client, calls } = fakeSupabase({
      data: [{ ...ann, has_pin: true, total_matches: 1 }],
      error: null,
    });
    expect(await searchPatients(client, typed("Ann Lic"))).toEqual({
      more: false,
      patients: [{ ...ann, has_pin: true }],
    });
    expect(calls.rpc).toEqual([
      [
        "search_patients",
        { search_words: ["ann", "lic"], search_phones: [], max_results: 20 },
      ],
    ]);
    expect(calls.or).toEqual([]);
  });

  it("sends a phone number as digits, with and without the 1", async () => {
    const { client, calls } = fakeSupabase({ data: [], error: null });
    await searchPatients(client, typed("+1 (415) 555-1234"));
    expect(calls.rpc[0][1]).toEqual({
      search_words: [],
      search_phones: ["14155551234", "4155551234"],
      max_results: 20,
    });
  });

  it("says when there were more matches than it lists", async () => {
    const { client } = fakeSupabase({
      data: [{ ...ann, has_pin: false, total_matches: 57 }],
      error: null,
    });
    const outcome = await searchPatients(client, typed("ann"));
    expect(outcome).toMatchObject({ more: true });
  });

  it("finds nobody without complaining", async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    expect(await searchPatients(client, typed("zzzz"))).toEqual({
      more: false,
      patients: [],
    });
  });

  it("falls back to the basic search when migration 0014 is missing", async () => {
    const { client, calls } = fakeSupabase(
      { data: null, error: { code: "PGRST202" } },
      { data: [{ ...ann, pin: "$2a$hash" }], error: null }
    );
    const outcome = await searchPatients(client, typed("Ann Lic"));
    expect(calls.or).toEqual([
      "first_name.ilike.%ann%,last_name.ilike.%ann%,email.ilike.%ann%",
      "first_name.ilike.%lic%,last_name.ilike.%lic%,email.ilike.%lic%",
    ]);
    expect(outcome).toEqual({
      more: false,
      patients: [{ ...ann, has_pin: true }],
    });
    expect(JSON.stringify(outcome)).not.toContain("hash");
  });

  it("does not fall back on any other database error", async () => {
    const { client, calls } = fakeSupabase({
      data: null,
      error: { code: "57014" },
    });
    expect(await searchPatients(client, typed("Ann Lic"))).toBe("error");
    expect(calls.or).toEqual([]);
  });

  it("reports an error from the fallback too", async () => {
    const { client } = fakeSupabase(
      { data: null, error: { code: "PGRST202" } },
      { data: null, error: { code: "57014" } }
    );
    expect(await searchPatients(client, typed("Ann Lic"))).toBe("error");
  });
});
