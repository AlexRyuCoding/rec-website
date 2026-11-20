import { describe, expect, it } from "vitest";
import { createTapGuard } from "./tap-guard";

describe("tap guard", () => {
  it("lets taps through when nothing has changed", () => {
    const guard = createTapGuard();
    expect(guard.blocked(1000)).toBe(false);
  });
  it("blocks taps for a moment after the screen changes", () => {
    const guard = createTapGuard();
    guard.block(350, 1000);
    expect(guard.blocked(1001)).toBe(true);
    expect(guard.blocked(1349)).toBe(true);
    expect(guard.blocked(1350)).toBe(false);
  });
  it("a shorter block never cuts a longer one short", () => {
    const guard = createTapGuard();
    guard.block(600, 1000);
    guard.block(100, 1050);
    expect(guard.blocked(1500)).toBe(true);
    expect(guard.blocked(1600)).toBe(false);
  });
});
