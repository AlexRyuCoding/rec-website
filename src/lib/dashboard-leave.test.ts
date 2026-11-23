import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  leaveDashboardQuietly,
  reportWhileStaying,
  resetDashboardLeaveForTests,
} from "./dashboard-leave";

// Signing out of the dashboard, and the page's own "somebody is using it"
// reports: a report that is still on its way when the sign-out's answer
// clears the cookie would put a working cookie back.

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

beforeEach(() => {
  resetDashboardLeaveForTests();
});

describe("leaving the dashboard", () => {
  it("a report is sent while staying", async () => {
    const send = vi.fn(async () => "sent");
    expect(await reportWhileStaying(send)).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("no report is sent once leaving has begun", async () => {
    const signOut = vi.fn(async () => {});
    await leaveDashboardQuietly(signOut);
    const send = vi.fn(async () => "sent");
    expect(await reportWhileStaying(send)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("the sign-out waits for a report that is already on its way", async () => {
    const report = deferred<string>();
    const order: string[] = [];
    const reporting = reportWhileStaying(() =>
      report.promise.then((v) => (order.push("report answered"), v))
    );
    const signOut = vi.fn(async () => {
      order.push("sign-out sent");
    });
    const leaving = leaveDashboardQuietly(signOut);
    await Promise.resolve();
    await Promise.resolve();
    expect(signOut).not.toHaveBeenCalled();
    report.resolve("ok");
    await reporting;
    await leaving;
    expect(order).toEqual(["report answered", "sign-out sent"]);
  });

  it("…and does not wait for ever: a report that never answers", async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => {});
    void reportWhileStaying(() => never);
    const signOut = vi.fn(async () => {});
    const leaving = leaveDashboardQuietly(signOut);
    await vi.advanceTimersByTimeAsync(5000);
    await leaving;
    vi.useRealTimers();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("a report that fails does not stop the sign-out", async () => {
    const failing = reportWhileStaying(() => Promise.reject(new Error("x")));
    const signOut = vi.fn(async () => {});
    await leaveDashboardQuietly(signOut);
    await failing.catch(() => {});
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("pressing Sign out twice signs out once", async () => {
    const signOut = vi.fn(async () => {});
    await Promise.all([
      leaveDashboardQuietly(signOut),
      leaveDashboardQuietly(signOut),
    ]);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
