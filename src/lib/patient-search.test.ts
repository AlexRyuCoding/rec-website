import { describe, expect, it } from "vitest";
import {
  isMissingSearchFunction,
  parsePatientSearch,
  phoneFilter,
  rankPatients,
  wordFilter,
} from "./patient-search";

describe("parsePatientSearch", () => {
  it("splits a first + last name into separate words", () => {
    expect(parsePatientSearch("Ann lic")).toEqual({
      kind: "words",
      words: ["ann", "lic"],
    });
  });

  it("accepts 'Last, First' and stray spaces", () => {
    expect(parsePatientSearch("  Licater,Ann  ")).toEqual({
      kind: "words",
      words: ["licater", "ann"],
    });
  });

  it("keeps a single word as one word", () => {
    expect(parsePatientSearch("licater")).toEqual({
      kind: "words",
      words: ["licater"],
    });
  });

  it("keeps the characters real names and emails contain", () => {
    expect(parsePatientSearch("o'brien-smith a_b.c@x.com")).toEqual({
      kind: "words",
      words: ["o'brien-smith", "a_b.c@x.com"],
    });
  });

  it("drops characters that would act as wildcards or break the filter", () => {
    expect(parsePatientSearch('a%n*n\\ "(lic)"')).toEqual({
      kind: "words",
      words: ["ann", "lic"],
    });
  });

  it("drops repeated words and caps how many are used", () => {
    expect(parsePatientSearch("ann Ann a b c d e f g")).toEqual({
      kind: "words",
      words: ["ann", "a", "b", "c", "d", "e"],
    });
  });

  it("treats a formatted phone number as a phone search", () => {
    expect(parsePatientSearch("(415) 555-1234")).toEqual({
      kind: "phone",
      digits: ["4155551234"],
    });
  });

  it("also tries a phone number without its leading 1", () => {
    expect(parsePatientSearch("+1 415.555.1234")).toEqual({
      kind: "phone",
      digits: ["14155551234", "4155551234"],
    });
  });

  it("searches short numbers as words, not phones", () => {
    expect(parsePatientSearch("123")).toEqual({
      kind: "words",
      words: ["123"],
    });
  });

  it("refuses a search with fewer than 2 usable characters", () => {
    expect(parsePatientSearch("a")).toEqual({ kind: "too-short" });
    expect(parsePatientSearch(" % ")).toEqual({ kind: "too-short" });
    expect(parsePatientSearch("")).toEqual({ kind: "too-short" });
  });

  it("allows two one-letter words (initials)", () => {
    expect(parsePatientSearch("a l")).toEqual({
      kind: "words",
      words: ["a", "l"],
    });
  });
});

describe("isMissingSearchFunction", () => {
  it("is true only when the database does not have the function", () => {
    expect(isMissingSearchFunction("PGRST202")).toBe(true);
    expect(isMissingSearchFunction("42883")).toBe(true);
    expect(isMissingSearchFunction("57014")).toBe(false); // timeout
    expect(isMissingSearchFunction(undefined)).toBe(false);
  });
});

describe("fallback filters", () => {
  it("matches one word against first name, last name or email", () => {
    expect(wordFilter("lic")).toBe(
      "first_name.ilike.%lic%,last_name.ilike.%lic%,email.ilike.%lic%"
    );
  });

  it("matches any of the phone number forms", () => {
    expect(phoneFilter(["14155551234", "4155551234"])).toBe(
      "phone_digits.like.%14155551234%,phone_digits.like.%4155551234%"
    );
  });
});

describe("fallback rankPatients", () => {
  const p = (first_name: string, last_name: string, email: string | null) => ({
    first_name,
    last_name,
    email,
  });

  it("puts the patient whose names start with the words first", () => {
    const rows = [
      p("Joanne", "Abel", "jabel@gmail.com"), // "ann" inside, "l" inside
      p("Hannah", "Baker", "hb@gmail.com"), // "l" only via gmail
      p("Ann", "Licater", "al@example.com"),
      p("Anna", "Lopez", null),
    ];
    expect(
      rankPatients(rows, ["ann", "l"]).map(
        (r) => `${r.first_name} ${r.last_name}`
      )
    ).toEqual(["Ann Licater", "Anna Lopez", "Joanne Abel", "Hannah Baker"]);
  });

  it("does not care which order the names were typed in", () => {
    const rows = [p("Lichelle", "Mann", null), p("Ann", "Licater", null)];
    expect(rankPatients(rows, ["licater", "ann"])[0].last_name).toBe("Licater");
  });

  it("keeps equal matches in last name, first name order", () => {
    const rows = [
      p("Zoe", "Smith", null),
      p("Amy", "Smith", null),
      p("Bob", "Smart", null),
    ];
    expect(
      rankPatients(rows, ["sm"]).map((r) => `${r.first_name} ${r.last_name}`)
    ).toEqual(["Bob Smart", "Amy Smith", "Zoe Smith"]);
  });

  it("matches the second part of a two-part name as a start", () => {
    const rows = [p("Amy", "Ansmith", null), p("Mary", "Jones-Smith", null)];
    expect(rankPatients(rows, ["smith"])[0].first_name).toBe("Mary");
  });
});
