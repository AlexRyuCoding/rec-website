import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getClientIp,
  grievanceFormSchema,
  requestFormSchema,
} from "./validation";

const validRequest = {
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "(818) 555-1234",
  message: "I'd like to book a first appointment.",
  company: "",
};

describe("requestFormSchema", () => {
  it("accepts a valid submission", () => {
    expect(requestFormSchema.safeParse(validRequest).success).toBe(true);
  });

  it("rejects a missing email", () => {
    expect(
      requestFormSchema.safeParse({ ...validRequest, email: "" }).success
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      requestFormSchema.safeParse({ ...validRequest, email: "not-an-email" })
        .success
    ).toBe(false);
  });

  it("rejects an oversized message", () => {
    expect(
      requestFormSchema.safeParse({
        ...validRequest,
        message: "x".repeat(2001),
      }).success
    ).toBe(false);
  });

  it("rejects a phone with letters", () => {
    expect(
      requestFormSchema.safeParse({ ...validRequest, phone: "call me" }).success
    ).toBe(false);
  });

  it("keeps the honeypot value for the route to inspect", () => {
    const parsed = requestFormSchema.safeParse({
      ...validRequest,
      company: "SpamBot Inc",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.company).toBe("SpamBot Inc");
  });
});

const validGrievance = {
  subject: "Billing concern",
  message: "Detailed description of my concern.",
  company: "",
};

describe("grievanceFormSchema", () => {
  it("accepts a valid submission without optional contact info", () => {
    expect(grievanceFormSchema.safeParse(validGrievance).success).toBe(true);
  });

  it("treats empty-string contact fields as absent", () => {
    const parsed = grievanceFormSchema.safeParse({
      ...validGrievance,
      name: "",
      email: "",
      phone: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing subject", () => {
    expect(
      grievanceFormSchema.safeParse({ ...validGrievance, subject: " " }).success
    ).toBe(false);
  });

  it("rejects an invalid optional email when provided", () => {
    expect(
      grievanceFormSchema.safeParse({ ...validGrievance, email: "nope" })
        .success
    ).toBe(false);
  });
});

describe("getClientIp behind Google's load balancer", () => {
  afterEach(() => vi.unstubAllEnvs());
  const req = (headers: Record<string, string>) =>
    new Request("https://x.test/", { headers });

  it("keeps Vercel's rule when CLIENT_IP_FROM_RIGHT is not set", () => {
    expect(
      getClientIp(
        req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" })
      )
    ).toBe("203.0.113.7");
  });
  it("takes the address the load balancer wrote, counted from the right", () => {
    vi.stubEnv("CLIENT_IP_FROM_RIGHT", "2");
    expect(
      getClientIp(req({ "x-forwarded-for": "203.0.113.7, 34.1.1.1" }))
    ).toBe("203.0.113.7");
    expect(
      getClientIp(
        req({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 203.0.113.7, 34.1.1.1" })
      )
    ).toBe("203.0.113.7");
  });
  it("ignores a forged x-real-ip", () => {
    vi.stubEnv("CLIENT_IP_FROM_RIGHT", "2");
    expect(
      getClientIp(
        req({
          "x-real-ip": "9.9.9.9",
          "x-forwarded-for": "203.0.113.7, 34.1.1.1",
        })
      )
    ).toBe("203.0.113.7");
    expect(getClientIp(req({ "x-real-ip": "9.9.9.9" }))).toBe("unknown");
  });
  it("is unknown when the header is shorter than expected", () => {
    vi.stubEnv("CLIENT_IP_FROM_RIGHT", "2");
    expect(getClientIp(req({ "x-forwarded-for": "34.1.1.1" }))).toBe("unknown");
  });
  it("is unknown, never Vercel's rule, when the setting is not a positive whole number", () => {
    for (const bad of ["0", "-1", "two", "1.5"]) {
      vi.stubEnv("CLIENT_IP_FROM_RIGHT", bad);
      expect(
        getClientIp(
          req({
            "x-real-ip": "9.9.9.9",
            "x-forwarded-for": "203.0.113.7, 34.1.1.1",
          })
        )
      ).toBe("unknown");
    }
  });
});
