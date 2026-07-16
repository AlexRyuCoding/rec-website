import { describe, expect, it } from "vitest";
import { grievanceFormSchema, requestFormSchema } from "./validation";

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
