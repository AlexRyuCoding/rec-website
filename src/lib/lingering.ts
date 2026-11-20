// Keeping things on screen for a moment after they are gone, so they can
// animate out instead of vanishing. The pure part: where a departed item
// sits among the ones still present.

export interface Lingering<T> {
  item: T;
  // No longer in the data; shown only so it can leave gracefully.
  leaving: boolean;
}

// Present items first-class, departed ones marked — all in one order
// (highest `rank` first, e.g. newest call first), so a departing row
// stays exactly where it was while it fades instead of jumping to the end.
// Equal ranks keep the order given, present before departed.
export function mergeLingering<T extends { id: string }>(
  present: readonly T[],
  departed: readonly T[],
  rank: (item: T) => number
): Lingering<T>[] {
  const ids = new Set(present.map((item) => item.id));
  const rows: Lingering<T>[] = [
    ...present.map((item) => ({ item, leaving: false })),
    // Something that came back is present again, not leaving.
    ...departed
      .filter((item) => !ids.has(item.id))
      .map((item) => ({ item, leaving: true })),
  ];
  return rows
    .map((row, index) => ({ row, index, rank: rank(row.item) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map(({ row }) => row);
}

// What `departed` should be after the data changed from `before` to
// `after`: everything still on its way out, plus whatever just left,
// minus anything that has come back.
export function nextDeparted<T extends { id: string }>(
  departed: readonly T[],
  before: readonly T[],
  after: readonly T[]
): T[] {
  const present = new Set(after.map((item) => item.id));
  const next = departed.filter((item) => !present.has(item.id));
  const known = new Set(next.map((item) => item.id));
  for (const item of before) {
    if (!present.has(item.id) && !known.has(item.id)) {
      next.push(item);
      known.add(item.id);
    }
  }
  return next;
}
