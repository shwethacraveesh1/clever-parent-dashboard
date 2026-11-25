import { describe, expect, it } from 'vitest';
import { mergeIntervals, unionDurationMs } from '../../src/cleaning/intervals.js';

const iv = (startMs, endMs) => ({ startMs, endMs });

describe('mergeIntervals', () => {
  it('merges overlapping, contained and touching intervals regardless of input order', () => {
    expect(mergeIntervals([iv(50, 60), iv(0, 10), iv(5, 20), iv(6, 7), iv(20, 30)])).toEqual([
      iv(0, 30),
      iv(50, 60),
    ]);
  });

  it('does not mutate its input', () => {
    const input = [iv(0, 10), iv(5, 20)];
    mergeIntervals(input);
    expect(input).toEqual([iv(0, 10), iv(5, 20)]);
  });

  it('returns [] for no intervals', () => {
    expect(mergeIntervals([])).toEqual([]);
  });
});

describe('unionDurationMs', () => {
  it('counts overlapping time once', () => {
    expect(unionDurationMs([iv(0, 60), iv(30, 75)])).toBe(75);
  });

  it('sums disjoint intervals and allows zero-length ones', () => {
    expect(unionDurationMs([iv(0, 10), iv(20, 25), iv(40, 40)])).toBe(15);
  });
});
