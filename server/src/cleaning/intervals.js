/**
 * Merges [startMs, endMs] intervals into a sorted, non-overlapping list.
 * Touching intervals (one ends exactly when the next starts) are merged.
 * Callers must pass only valid intervals (endMs >= startMs).
 *
 * @param {{ startMs: number, endMs: number }[]} intervals
 * @returns {{ startMs: number, endMs: number }[]}
 */
export function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged = [];
  for (const { startMs, endMs } of sorted) {
    const last = merged[merged.length - 1];
    if (last && startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, endMs);
    } else {
      merged.push({ startMs, endMs });
    }
  }
  return merged;
}

/** Total time covered by the intervals, counting overlaps once. */
export function unionDurationMs(intervals) {
  return mergeIntervals(intervals).reduce((sum, i) => sum + (i.endMs - i.startMs), 0);
}
