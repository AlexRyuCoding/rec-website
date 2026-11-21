import { describe, expect, it } from "vitest";
import * as app from "./patient-record";
// The terminal script keeps its own copy of these rules; the same tests
// run against both so they cannot drift apart.
import script from "../../scripts/sync-patients.js";

const copies = [
  ["the app (patient-record.ts)", app],
  ["the script (scripts/sync-patients.js)", script as typeof app],
] as const;

describe.each(copies)("cleanText in %s", (_name, { cleanText }) => {
  it("removes spaces around the text", () => {
    expect(cleanText("  Ann ")).toBe("Ann");
  });

  it("turns any run of blank characters into one space", () => {
    expect(cleanText("Mary   Ann")).toBe("Mary Ann");
    expect(cleanText("Mary\t\n Ann")).toBe("Mary Ann");
    // a non-breaking space, as pasted from a web page or a document
    expect(cleanText("Mary\u00A0Ann\u00A0")).toBe("Mary Ann");
  });

  it("removes characters that cannot be seen", () => {
    expect(cleanText("An\u200Bn\uFEFF")).toBe("Ann");
  });

  it("leaves real punctuation and accents alone", () => {
    expect(cleanText("O'Brien-Muñoz")).toBe("O'Brien-Muñoz");
  });

  it("treats nothing as empty text", () => {
    expect(cleanText(undefined)).toBe("");
    expect(cleanText(null)).toBe("");
    expect(cleanText("   ")).toBe("");
  });
});

describe.each(copies)("toPatientRow in %s", (_name, { toPatientRow }) => {
  it("copies a tidy record as it is", () => {
    expect(
      toPatientRow({
        id: "pb1",
        profile: {
          firstName: "Ann",
          lastName: "Licater",
          emailAddress: "al@example.com",
          mobilePhone: "(415) 555-1234",
        },
      })
    ).toEqual({
      pb_client_id: "pb1",
      first_name: "Ann",
      last_name: "Licater",
      email: "al@example.com",
      phone: "(415) 555-1234",
    });
  });

  it("cleans the names", () => {
    const row = toPatientRow({
      id: "pb1",
      profile: { firstName: " Mary  Ann ", lastName: "Jones-Smith\u00A0" },
    });
    expect(row.first_name).toBe("Mary Ann");
    expect(row.last_name).toBe("Jones-Smith");
  });

  it("stores the email lowercase, without spaces around it", () => {
    const row = toPatientRow({
      id: "pb1",
      profile: { emailAddress: "  Ann.Licater@Example.COM " },
    });
    expect(row.email).toBe("ann.licater@example.com");
  });

  it("stores a blank email or phone as none", () => {
    const row = toPatientRow({
      id: "pb1",
      profile: { emailAddress: "  ", mobilePhone: "", homePhone: " " },
    });
    expect(row.email).toBeNull();
    expect(row.phone).toBeNull();
  });

  it("uses the home phone when the mobile is missing or blank", () => {
    expect(
      toPatientRow({ id: "pb1", profile: { homePhone: "415-555-0000" } }).phone
    ).toBe("415-555-0000");
    expect(
      toPatientRow({
        id: "pb1",
        profile: { mobilePhone: " ", homePhone: " 415-555-0000 " },
      }).phone
    ).toBe("415-555-0000");
  });

  it("prefers the mobile phone", () => {
    expect(
      toPatientRow({
        id: "pb1",
        profile: { mobilePhone: "415-555-1111", homePhone: "415-555-0000" },
      }).phone
    ).toBe("415-555-1111");
  });

  it("copes with a record that has no profile", () => {
    expect(toPatientRow({ id: "pb1" })).toEqual({
      pb_client_id: "pb1",
      first_name: "",
      last_name: "",
      email: null,
      phone: null,
    });
  });
});
