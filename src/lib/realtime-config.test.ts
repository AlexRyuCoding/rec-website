import { afterEach, describe, expect, it, vi } from "vitest";
import { realtimeBrowserConfig, realtimeServerConfig } from "./realtime-config";

afterEach(() => vi.unstubAllEnvs());
const old = () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://old.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "old-anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "old-svc");
};

describe("realtime settings", () => {
  it("are Supabase's when no new ones are set", () => {
    old();
    expect(realtimeBrowserConfig()).toEqual({
      url: "https://old.supabase.co",
      anonKey: "old-anon",
    });
    expect(realtimeServerConfig()).toEqual({
      url: "https://old.supabase.co",
      serviceKey: "old-svc",
      separate: false,
    });
  });
  it("are the new project's when the new set is complete", () => {
    old();
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "https://new.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_REALTIME_ANON_KEY", "new-anon");
    vi.stubEnv("REALTIME_SERVICE_KEY", "new-svc");
    expect(realtimeBrowserConfig()).toEqual({
      url: "https://new.supabase.co",
      anonKey: "new-anon",
    });
    expect(realtimeServerConfig()).toEqual({
      url: "https://new.supabase.co",
      serviceKey: "new-svc",
      separate: true,
    });
  });
  it("never pair a new address with an old key", () => {
    old();
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "https://new.supabase.co");
    expect(realtimeBrowserConfig().url).toBe("https://old.supabase.co");
    expect(realtimeServerConfig()).toMatchObject({
      url: "https://old.supabase.co",
      serviceKey: "old-svc",
      separate: false,
    });
  });
});
