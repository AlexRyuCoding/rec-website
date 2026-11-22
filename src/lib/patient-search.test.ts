import { describe, expect, it } from "vitest";
import { parsePatientSearch } from "./patient-search";

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
