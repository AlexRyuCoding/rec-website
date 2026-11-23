import { afterEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "./site-url";

afterEach(() => vi.unstubAllEnvs());

// What a route sees on Cloud Run: the address the server listens on.
const behindProxy = { url: "http://0.0.0.0:8080/api/admin/spotify/login" };

describe("siteUrl", () => {
  it("is on the site's public address, not the one the server listens on", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://www.example.test");
    expect(siteUrl("/admin/login", behindProxy).href).toBe(
      "https://www.example.test/admin/login"
    );
  });

  it("keeps the query and the fragment of the path", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://www.example.test/");
    expect(
      siteUrl("/admin/dashboard?spotify=failed#music", behindProxy).href
    ).toBe("https://www.example.test/admin/dashboard?spotify=failed#music");
  });

  it("falls back to the request's own address only when NEXTAUTH_URL is not set", () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    expect(
      siteUrl("/admin/login", { url: "http://localhost:3000/api/x?y=1" }).href
    ).toBe("http://localhost:3000/admin/login");
  });
});
