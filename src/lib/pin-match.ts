// Whose PIN is this, among patients who can only be asked one hash at a
// time? Pure: the caller hands in the compare (pin-hash.ts) and how many
// may run at once. The database side is pin-server.ts.
//
// The rows are compared a group at a time, `width` compares running
// together, and a group is always waited for whole. So the answer is the
// FIRST matching row in the order given — exactly what comparing one
// after another gives — however the compares happen to finish. Two
// patients cannot hold the same PIN, but nothing here relies on that.
//
// Why groups and not everything at once: the compares run on Node's
// small pool of helper threads, which also reads files and looks up
// host names. A thousand compares queued together would make all of
// that wait behind them; a group of `width` makes it wait for one.
//
// No imports and no type-only syntax beyond annotations, on purpose:
// scripts/bench-pin-slow-path.mjs loads this very file to time it.

export type PinCompare = (pin: string, hash: string) => Promise<boolean>;

export async function firstMatch<Row extends { pin: string }>(
  rows: readonly Row[],
  pin: string,
  compare: PinCompare,
  width: number
): Promise<Row | null> {
  const size = Number.isInteger(width) && width >= 1 ? width : 1;
  for (let start = 0; start < rows.length; start += size) {
    const group = rows.slice(start, start + size);
    // A compare that fails rejects the whole search: "could not tell"
    // must never be answered as "nobody has this PIN".
    const answers = await Promise.all(
      group.map((row) => compare(pin, row.pin))
    );
    const hit = answers.indexOf(true);
    if (hit !== -1) return group[hit];
  }
  return null;
}
