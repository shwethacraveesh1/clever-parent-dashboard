/**
 * Usage-event cleaning rules 0–5 from docs/DECISIONS.md §6, applied in order.
 * Rules 6–7 (durations) live in aggregate.js.
 *
 * Pure: no I/O, no clock. `asOf` is always passed in.
 */

export const DEFAULT_WINDOW_DAYS = 7;
export const DEFAULT_CLOCK_DRIFT_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** @typedef {'missingEnd' | 'invalidTimeRange'} DurationIssue */

/**
 * @typedef {{
 *   eventId: string, studentId: string, deviceId: string, appId: string,
 *   startMs: number, endMs: number | null, durationIssue: DurationIssue | null
 * }} CleanEvent  endMs is null exactly when durationIssue is set
 */

/**
 * Counts only. Never add device or event IDs here: districts that hide
 * devices receive dataQuality as-is.
 *
 * @typedef {{
 *   invalidStartDropped: number, futureDropped: number, outsideWindowDropped: number,
 *   duplicatesRemoved: number, conflictingDuplicate: number,
 *   missingEnd: number, invalidTimeRange: number
 * }} DataQuality
 */

/**
 * @param {import('../data/DataSource.js').UsageEvent[]} events
 * @param {{ asOf: string | number | Date, windowDays?: number, clockDriftMs?: number }} options
 * @returns {{ events: CleanEvent[], dataQuality: DataQuality }}
 */
export function cleanEvents(
  events,
  { asOf, windowDays = DEFAULT_WINDOW_DAYS, clockDriftMs = DEFAULT_CLOCK_DRIFT_MS },
) {
  const asOfMs = toMs(asOf);
  if (Number.isNaN(asOfMs)) throw new Error(`cleanEvents: invalid asOf "${asOf}"`);
  const windowStartMs = asOfMs - windowDays * DAY_MS;
  const latestStartMs = asOfMs + clockDriftMs;

  const dataQuality = {
    invalidStartDropped: 0,
    futureDropped: 0,
    outsideWindowDropped: 0,
    duplicatesRemoved: 0,
    conflictingDuplicate: 0,
    missingEnd: 0,
    invalidTimeRange: 0,
  };

  let parsed = events.map((e) => ({ ...e, startMs: parseTime(e.start), endMs: parseTime(e.end) }));

  // Rule 0: no usable start time.
  parsed = dropWhere(
    parsed,
    (e) => e.startMs === null || Number.isNaN(e.startMs),
    () => dataQuality.invalidStartDropped++,
  );

  // Rule 1: starts in the future (beyond the clock-drift allowance).
  parsed = dropWhere(parsed, (e) => e.startMs > latestStartMs, () => dataQuality.futureDropped++);

  // Rule 2: starts before the window. Rule 1 already handled the upper bound.
  parsed = dropWhere(parsed, (e) => e.startMs < windowStartMs, () => dataQuality.outsideWindowDropped++);

  // Rule 3: duplicates.
  const { kept: deduped, duplicatesRemoved, conflictingDuplicate } = dedupe(parsed);
  dataQuality.duplicatesRemoved = duplicatesRemoved;
  dataQuality.conflictingDuplicate = conflictingDuplicate;

  // Rules 4–5: keep the event as "app used", but without a duration.
  const cleaned = deduped.map((e) => {
    let durationIssue = null;
    if (e.endMs === null) {
      durationIssue = 'missingEnd';
      dataQuality.missingEnd++;
    } else if (Number.isNaN(e.endMs) || e.endMs < e.startMs) {
      durationIssue = 'invalidTimeRange';
      dataQuality.invalidTimeRange++;
    }
    return {
      eventId: e.eventId,
      studentId: e.studentId,
      deviceId: e.deviceId,
      appId: e.appId,
      startMs: e.startMs,
      endMs: durationIssue ? null : e.endMs,
      durationIssue,
    };
  });

  return { events: cleaned, dataQuality };
}

/**
 * Rule 3. Times compare as instants, so "…15:00:00Z" and "…15:00:00.000Z"
 * are the same.
 *
 * 3a, repeated event_id: identical copies are plain duplicates. Differing
 * versions are conflicts; the one with a valid end wins, otherwise the later
 * one (devices resend an event once the session has ended).
 * 3b, identical content under different event_ids: keep the lowest ID.
 */
export function dedupe(events) {
  let duplicatesRemoved = 0;
  let conflictingDuplicate = 0;

  const byId = new Map();
  for (const e of events) {
    const current = byId.get(e.eventId);
    if (!current) {
      byId.set(e.eventId, e);
    } else if (contentKey(current) === contentKey(e)) {
      duplicatesRemoved++;
    } else {
      conflictingDuplicate++;
      if (hasValidEnd(e) || !hasValidEnd(current)) byId.set(e.eventId, e);
    }
  }

  const sorted = [...byId.values()].sort((a, b) => compareEventIds(a.eventId, b.eventId));
  const seenContent = new Set();
  const kept = [];
  for (const e of sorted) {
    const key = contentKey(e);
    if (seenContent.has(key)) {
      duplicatesRemoved++;
      continue;
    }
    seenContent.add(key);
    kept.push(e);
  }

  return { kept, duplicatesRemoved, conflictingDuplicate };
}

function hasValidEnd(e) {
  return typeof e.endMs === 'number' && !Number.isNaN(e.endMs) && e.endMs >= e.startMs;
}

function contentKey(e) {
  return [e.studentId, e.deviceId, e.appId, e.startMs, endKey(e)].join('|');
}

function endKey(e) {
  if (e.endMs === null) return 'none';
  if (Number.isNaN(e.endMs)) return `raw:${e.end}`;
  return e.endMs;
}

function compareEventIds(a, b) {
  return String(a).localeCompare(String(b), 'en', { numeric: true });
}

function dropWhere(events, predicate, onDrop) {
  return events.filter((e) => {
    if (!predicate(e)) return true;
    onDrop();
    return false;
  });
}

// Timezone is required: Date.parse reads "2026-10-19T14:00:00" as server-local time.
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** null/empty → null; not a valid ISO-8601 instant → NaN; otherwise epoch ms. */
export function parseTime(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return NaN;
  const m = ISO_INSTANT.exec(value);
  if (!m) return NaN;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map((part) => Number(part ?? 0));
  const calendar = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (calendar.getUTCMonth() !== mo - 1 || calendar.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) {
    return NaN;
  }
  return Date.parse(value);
}

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Date.parse(value);
}
