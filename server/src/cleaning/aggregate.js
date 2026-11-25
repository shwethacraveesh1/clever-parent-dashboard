import { unionDurationMs } from './intervals.js';

const MINUTE_MS = 60 * 1000;

/**
 * Rules 6–7 from docs/DECISIONS.md §6. Input is the output of cleanEvents.
 *
 * "Was it used?" and "for how long?" are separate: every event marks its app
 * and device as used; only events with a known duration contribute minutes.
 * `minutes` is null when nothing used has a known duration, and
 * `hasUnknownDuration` says some usage couldn't be timed (the UI shows
 * "at least N min"). Same shape per app, per device and for the total.
 *
 * Returns IDs only. App/device metadata and district visibility are applied
 * by the service layer.
 *
 * @param {import('./cleanEvents.js').CleanEvent[]} events
 */
export function aggregateUsage(events) {
  const apps = groupBy(events, (e) => e.appId).map(([appId, appEvents]) => ({
    appId,
    ...timeFor(appEvents),
    deviceIds: unique(appEvents.map((e) => e.deviceId)),
  }));

  const devices = groupBy(events, (e) => e.deviceId).map(([deviceId, deviceEvents]) => ({
    deviceId,
    ...timeFor(deviceEvents),
  }));

  const timedApps = apps.filter((a) => a.minutes !== null);
  return {
    apps,
    devices,
    total: {
      minutes:
        events.length > 0 && timedApps.length === 0
          ? null
          : timedApps.reduce((sum, a) => sum + a.minutes, 0),
      hasUnknownDuration: apps.some((a) => a.hasUnknownDuration),
    },
  };
}

/** Union of the events' known intervals, so overlaps aren't double-counted. */
function timeFor(events) {
  const timed = events.filter((e) => e.durationIssue === null);
  return {
    minutes: timed.length === 0 ? null : Math.round(unionDurationMs(timed) / MINUTE_MS),
    hasUnknownDuration: timed.length < events.length,
  };
}

/** Groups in first-seen order. */
function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()];
}

function unique(values) {
  return [...new Set(values)];
}
