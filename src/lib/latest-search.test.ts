import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSearchRunner } from "./latest-search";

// A search whose replies arrive only when the test says so.
function setup() {
  const sent: {
    text: string;
    signal: AbortSignal;
    reply: (value: string) => void;
    fail: (error: unknown) => void;
  }[] = [];
  const log: string[] = [];
  const runner = createSearchRunner<string>({
    delayMs: 250,
    minLength: 2,
    run: (text, signal) =>
      new Promise<string>((reply, fail) => {
        sent.push({ text, signal, reply, fail });
      }),
    onStart: (text) => log.push(`start ${text}`),
    onResult: (result, text) => log.push(`result ${text}=${result}`),
    onError: (_error, text) => log.push(`error ${text}`),
    onClear: () => log.push("clear"),
  });
  return { runner, sent, log };
}

// Lets the promise callbacks run.
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createSearchRunner", () => {
  it("searches once, a moment after typing stops", async () => {
    const { runner, sent } = setup();
    runner.type("a");
    runner.type("an");
    vi.advanceTimersByTime(100);
    runner.type("ann");
    vi.advanceTimersByTime(249);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent.map((s) => s.text)).toEqual(["ann"]);
  });

  it("delivers the reply with the text it belongs to", async () => {
    const { runner, sent, log } = setup();
    runner.type("ann");
    vi.advanceTimersByTime(250);
    sent[0].reply("A");
    await settle();
    expect(log).toEqual(["start ann", "result ann=A"]);
  });

  it("drops a slow reply to older text, even if it arrives last", async () => {
    const { runner, sent, log } = setup();
    runner.type("ann");
    vi.advanceTimersByTime(250);
    runner.type("ann lic");
    vi.advanceTimersByTime(250);
    expect(sent[0].signal.aborted).toBe(true);
    sent[1].reply("new");
    await settle();
    sent[0].reply("old");
    await settle();
    expect(log).toEqual(["start ann", "start ann lic", "result ann lic=new"]);
  });

  it("does not report the cancelled request as a failure", async () => {
    const { runner, sent, log } = setup();
    runner.type("ann");
    vi.advanceTimersByTime(250);
    runner.type("ann lic");
    vi.advanceTimersByTime(250);
    sent[0].fail(new DOMException("aborted", "AbortError"));
    await settle();
    expect(log).toEqual(["start ann", "start ann lic"]);
  });

  it("reports a failure of the latest request", async () => {
    const { runner, sent, log } = setup();
    runner.type("ann");
    vi.advanceTimersByTime(250);
    sent[0].fail(new Error("offline"));
    await settle();
    expect(log).toEqual(["start ann", "error ann"]);
  });

  it("clears instead of searching when the text is too short", async () => {
    const { runner, sent, log } = setup();
    runner.type("ann");
    vi.advanceTimersByTime(250);
    runner.type("a");
    expect(sent[0].signal.aborted).toBe(true);
    sent[0].reply("late");
    await settle();
    vi.advanceTimersByTime(1000);
    expect(sent.length).toBe(1);
    expect(log).toEqual(["start ann", "clear"]);
  });

  it("ignores spaces around the text", async () => {
    const { runner, sent } = setup();
    runner.type("  ann ");
    vi.advanceTimersByTime(250);
    expect(sent.map((s) => s.text)).toEqual(["ann"]);
    // A space after the word is not a new search…
    runner.type("ann  ");
    vi.advanceTimersByTime(1000);
    expect(sent.length).toBe(1);
    // …and neither is one that is only spaces short of the minimum.
    runner.type(" a ");
    vi.advanceTimersByTime(1000);
    expect(sent.length).toBe(1);
  });

  it("searches again when the text comes back to an earlier value", async () => {
    const { runner, sent } = setup();
    runner.type("ann");
    vi.advanceTimersByTime(250);
    runner.type("anna");
    vi.advanceTimersByTime(250);
    runner.type("ann");
    vi.advanceTimersByTime(250);
    expect(sent.map((s) => s.text)).toEqual(["ann", "anna", "ann"]);
  });

  it("submit searches at once, and again for the same text", async () => {
    const { runner, sent } = setup();
    runner.type("ann");
    runner.submit("ann");
    expect(sent.map((s) => s.text)).toEqual(["ann"]);
    // the typing timer must not send it a second time
    vi.advanceTimersByTime(1000);
    expect(sent.length).toBe(1);
    runner.submit("ann");
    expect(sent.length).toBe(2);
  });

  it("submit does nothing for text that is too short", () => {
    const { runner, sent } = setup();
    runner.submit("a");
    expect(sent).toEqual([]);
  });

  it("cancel stops the timer and silences the request in flight", async () => {
    const { runner, sent, log } = setup();
    runner.type("ann");
    vi.advanceTimersByTime(250);
    runner.type("ann lic");
    runner.cancel();
    vi.advanceTimersByTime(1000);
    sent[0].reply("late");
    await settle();
    expect(sent.length).toBe(1);
    expect(sent[0].signal.aborted).toBe(true);
    expect(log).toEqual(["start ann"]);
  });
});
