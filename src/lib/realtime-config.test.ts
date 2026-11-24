import { afterEach, describe, expect, it, vi } from "vitest";
import { realtimeBrowserConfig, realtimeServerConfig } from "./realtime-config";

afterEach(() => vi.unstubAllEnvs());

describe("realtime settings", () => {
  it("are the Realtime project's, browser and server", () => {
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "https://rt.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_REALTIME_ANON_KEY", "anon");
    vi.stubEnv("REALTIME_SERVICE_KEY", "svc");
    expect(realtimeBrowserConfig()).toEqual({
      url: "https://rt.supabase.co",
      anonKey: "anon",
    });
    expect(realtimeServerConfig()).toEqual({
      url: "https://rt.supabase.co",
      serviceKey: "svc",
    });
  });

  it("name the setting that is missing instead of connecting to nothing", () => {
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "https://rt.supabase.co");
    expect(() => realtimeBrowserConfig()).toThrow(
      "NEXT_PUBLIC_REALTIME_ANON_KEY is not set"
    );
    expect(() => realtimeServerConfig()).toThrow(
      "REALTIME_SERVICE_KEY is not set"
    );
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "");
    expect(() => realtimeBrowserConfig()).toThrow(
      "NEXT_PUBLIC_REALTIME_URL is not set"
    );
  });

  it("never read the old host's settings", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://old.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "old-anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "old-svc");
    expect(() => realtimeBrowserConfig()).toThrow("is not set");
    expect(() => realtimeServerConfig()).toThrow("is not set");
  });
});
