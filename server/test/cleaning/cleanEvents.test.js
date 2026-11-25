import { describe, expect, it } from 'vitest';
import { cleanEvents, parseTime } from '../../src/cleaning/cleanEvents.js';
import { AS_OF, WINDOW_START, rawEvent } from '../helpers/events.js';

const clean = (events, options = {}) => cleanEvents(events, { asOf: AS_OF, ...options });
const ids = (result) => result.events.map((e) => e.eventId);

describe('cleanEvents', () => {
  it('passes a normal event through with epoch times and no issue', () => {
    const result = clean([rawEvent('E1')]);
    expect(result.events).toEqual([
      {
        eventId: 'E1',
        studentId: 'ST01',
        deviceId: 'DV01',
        appId: 'A1',
        startMs: Date.parse('2026-10-20T14:00:00Z'),
        endMs: Date.parse('2026-10-20T14:30:00Z'),
        durationIssue: null,
      },
    ]);
    expect(Object.values(result.dataQuality).every((n) => n === 0)).toBe(true);
  });

  it('rejects an invalid asOf', () => {
    expect(() => cleanEvents([], { asOf: 'soon' })).toThrow('invalid asOf');
  });

  describe('rule 0: missing or unparseable start is dropped', () => {
    it.each([
      ['null', null],
      ['garbage', 'not a date'],
      ['no timezone (would be read as server-local time)', '2026-10-20T14:00:00'],
      ['impossible calendar date', '2026-02-30T14:00:00Z'],
    ])('%s', (_label, start) => {
      const result = clean([rawEvent('E1', { start })]);
      expect(result.events).toEqual([]);
      expect(result.dataQuality.invalidStartDropped).toBe(1);
    });
  });

  describe('rule 1: start after AS_OF + 5 min clock drift is dropped', () => {
    it('drops E010 (2027) and counts it once, as future, not also as outside the window', () => {
      const e010 = rawEvent('E010', { start: '2027-03-01T10:00:00Z', end: '2027-03-01T10:20:00Z' });
      const result = clean([e010]);
      expect(result.events).toEqual([]);
      expect(result.dataQuality.futureDropped).toBe(1);
      expect(result.dataQuality.outsideWindowDropped).toBe(0);
    });

    it('keeps a start within the drift allowance and drops one just past it', () => {
      const result = clean([
        rawEvent('E1', { start: '2026-10-25T00:05:00Z', end: '2026-10-25T00:10:00Z' }),
        rawEvent('E2', { start: '2026-10-25T00:05:00.001Z', end: '2026-10-25T00:10:00Z' }),
      ]);
      expect(ids(result)).toEqual(['E1']);
      expect(result.dataQuality.futureDropped).toBe(1);
    });
  });

  describe('rule 2: start before the 7-day window is dropped', () => {
    it('keeps a start exactly at the window start and drops one 1 ms earlier', () => {
      const result = clean([
        rawEvent('E1', { start: WINDOW_START }),
        rawEvent('E2', { start: '2026-10-17T23:59:59.999Z' }),
      ]);
      expect(ids(result)).toEqual(['E1']);
      expect(result.dataQuality.outsideWindowDropped).toBe(1);
    });

    it('respects a custom windowDays', () => {
      const result = clean([rawEvent('E1', { start: '2026-10-23T00:00:00Z' })], { windowDays: 1 });
      expect(result.dataQuality.outsideWindowDropped).toBe(1);
    });
  });

  describe('rule 3: duplicates are removed, keeping the lowest event_id', () => {
    it('removes E003 as a copy of E002', () => {
      const e002 = rawEvent('E002', { appId: 'A2', start: '2026-10-19T15:00:00Z', end: '2026-10-19T15:40:00Z' });
      const e003 = { ...e002, eventId: 'E003' };
      const result = clean([e003, e002]);
      expect(ids(result)).toEqual(['E002']);
      expect(result.dataQuality.duplicatesRemoved).toBe(1);
    });

    it('orders event IDs naturally (E9 is lower than E10)', () => {
      expect(ids(clean([rawEvent('E10'), rawEvent('E9')]))).toEqual(['E9']);
    });

    it('treats the same instant in different formats as identical', () => {
      const result = clean([
        rawEvent('E1'),
        rawEvent('E2', { start: '2026-10-20T14:00:00.000Z', end: '2026-10-20T09:30:00-05:00' }),
      ]);
      expect(ids(result)).toEqual(['E1']);
    });

    it('dedupes copies that both have a missing end', () => {
      const result = clean([rawEvent('E1', { end: null }), rawEvent('E2', { end: null })]);
      expect(ids(result)).toEqual(['E1']);
      expect(result.dataQuality).toMatchObject({ duplicatesRemoved: 1, missingEnd: 1 });
    });

    it('counts an identical repeated event_id as a plain duplicate, not a conflict', () => {
      const result = clean([rawEvent('E1'), rawEvent('E1')]);
      expect(result.events).toHaveLength(1);
      expect(result.dataQuality).toMatchObject({ duplicatesRemoved: 1, conflictingDuplicate: 0 });
    });

    it('keeps events that differ in any of student, device, app, start or end', () => {
      const result = clean([
        rawEvent('E1'),
        rawEvent('E2', { studentId: 'ST02' }),
        rawEvent('E3', { deviceId: 'DV02' }),
        rawEvent('E4', { appId: 'A2' }),
        rawEvent('E5', { start: '2026-10-20T14:01:00Z' }),
        rawEvent('E6', { end: '2026-10-20T14:31:00Z' }),
      ]);
      expect(result.events).toHaveLength(6);
      expect(result.dataQuality.duplicatesRemoved).toBe(0);
    });
  });

  describe('rule 3a: repeated event_id with different content', () => {
    const open = rawEvent('E1', { end: null });
    const closed = rawEvent('E1', { end: '2026-10-20T14:45:00Z' });

    it('keeps the resent, complete version over the earlier open one', () => {
      const result = clean([open, closed]);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({ endMs: Date.parse('2026-10-20T14:45:00Z'), durationIssue: null });
      expect(result.dataQuality).toMatchObject({ conflictingDuplicate: 1, duplicatesRemoved: 0, missingEnd: 0 });
    });

    it('keeps the complete version even when it arrived first', () => {
      const result = clean([closed, open]);
      expect(result.events[0].durationIssue).toBeNull();
      expect(result.dataQuality.conflictingDuplicate).toBe(1);
    });

    it('treats an end before start as not valid when choosing', () => {
      const reversed = rawEvent('E1', { end: '2026-10-20T13:00:00Z' });
      expect(clean([closed, reversed]).events[0].durationIssue).toBeNull();
      expect(clean([reversed, closed]).events[0].durationIssue).toBeNull();
    });

    it('keeps the last in input order when both have a valid end', () => {
      const later = rawEvent('E1', { end: '2026-10-20T14:50:00Z' });
      expect(clean([closed, later]).events[0].endMs).toBe(Date.parse('2026-10-20T14:50:00Z'));
      expect(clean([later, closed]).events[0].endMs).toBe(Date.parse('2026-10-20T14:45:00Z'));
    });

    it('keeps the last in input order when neither has a valid end', () => {
      const reversed = rawEvent('E1', { end: '2026-10-20T13:00:00Z' });
      expect(clean([open, reversed]).events[0].durationIssue).toBe('invalidTimeRange');
      expect(clean([reversed, open]).events[0].durationIssue).toBe('missingEnd');
    });

    it('counts each extra conflicting version', () => {
      const result = clean([open, closed, rawEvent('E1', { appId: 'A2' })]);
      expect(result.events).toHaveLength(1);
      expect(result.dataQuality.conflictingDuplicate).toBe(2);
    });

    it('runs before content dedupe, so the winner can still match another ID', () => {
      const result = clean([rawEvent('E0', { end: '2026-10-20T14:45:00Z' }), open, closed]);
      expect(result.events.map((e) => e.eventId)).toEqual(['E0']);
      expect(result.dataQuality).toMatchObject({ conflictingDuplicate: 1, duplicatesRemoved: 1 });
    });
  });

  describe('rule 4: missing end means used, duration unknown', () => {
    it('keeps E009 with no end and flags missingEnd', () => {
      const result = clean([rawEvent('E009', { appId: 'A4', start: '2026-10-22T23:00:00Z', end: null })]);
      expect(result.events[0]).toMatchObject({ eventId: 'E009', endMs: null, durationIssue: 'missingEnd' });
      expect(result.dataQuality.missingEnd).toBe(1);
    });
  });

  describe('rule 5: end before start (or unparseable end) means used, duration unknown, invalid', () => {
    it('keeps E006 without swapping its times', () => {
      const result = clean([
        rawEvent('E006', { appId: 'A4', start: '2026-10-20T22:10:00Z', end: '2026-10-20T21:50:00Z' }),
      ]);
      expect(result.events[0]).toMatchObject({
        eventId: 'E006',
        startMs: Date.parse('2026-10-20T22:10:00Z'),
        endMs: null,
        durationIssue: 'invalidTimeRange',
      });
      expect(result.dataQuality.invalidTimeRange).toBe(1);
    });

    it('treats an unparseable end as an invalid range', () => {
      const result = clean([rawEvent('E1', { end: 'later' })]);
      expect(result.events[0].durationIssue).toBe('invalidTimeRange');
      expect(result.dataQuality.invalidTimeRange).toBe(1);
    });

    it('accepts a zero-length event as valid', () => {
      const result = clean([rawEvent('E1', { end: '2026-10-20T14:00:00Z' })]);
      expect(result.events[0].durationIssue).toBeNull();
    });
  });

  it('applies rules in order, so a future duplicate is counted only as future', () => {
    const future = { start: '2027-03-01T10:00:00Z', end: '2027-03-01T10:20:00Z' };
    const result = clean([rawEvent('E1', future), rawEvent('E2', future)]);
    expect(result.dataQuality).toMatchObject({ futureDropped: 2, duplicatesRemoved: 0 });
  });

  it('puts only counts in dataQuality, never IDs', () => {
    const { dataQuality } = clean([rawEvent('E1', { end: null }), rawEvent('E2', { start: null })]);
    expect(Object.values(dataQuality).every((v) => Number.isInteger(v))).toBe(true);
    expect(JSON.stringify(dataQuality)).not.toMatch(/DV\d|E\d/);
  });

  it('does not mutate its input', () => {
    const input = [rawEvent('E2'), rawEvent('E1')];
    const snapshot = structuredClone(input);
    clean(input);
    expect(input).toEqual(snapshot);
  });
});

describe('parseTime', () => {
  it('accepts Z and numeric offsets, with or without seconds and fractions', () => {
    expect(parseTime('2026-10-20T14:00Z')).toBe(Date.parse('2026-10-20T14:00:00Z'));
    expect(parseTime('2026-10-20T09:00:00.5-05:00')).toBe(Date.parse('2026-10-20T14:00:00.500Z'));
  });

  it('returns null for missing values and NaN for anything else invalid', () => {
    expect(parseTime(null)).toBeNull();
    expect(parseTime('')).toBeNull();
    expect(parseTime(1761000000000)).toBeNaN();
    expect(parseTime('2026-10-20')).toBeNaN();
    expect(parseTime('2026-10-20T24:00:00Z')).toBeNaN();
  });
});
