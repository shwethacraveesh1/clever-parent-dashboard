/** Inclusive calendar span for [from, to). window.to / AS_OF is exclusive. */
export function formatWindowRange(window) {
  if (!window?.from || !window?.to) return '';
  const start = new Date(window.from);
  const endExclusive = new Date(window.to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime())) return '';

  const lastInclusive = new Date(
    Date.UTC(endExclusive.getUTCFullYear(), endExclusive.getUTCMonth(), endExclusive.getUTCDate() - 1),
  );
  const day = (d) =>
    d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  return `${day(start)} – ${day(lastInclusive)}, ${lastInclusive.getUTCFullYear()} (UTC)`;
}

export function firstNameOf(fullName) {
  if (typeof fullName !== 'string' || fullName.trim() === '') return '';
  return fullName.trim().split(/\s+/)[0];
}

export function formatMinutes(row) {
  if (!row || !('minutes' in row)) return null;
  if (row.minutes == null) return 'duration unknown';
  if (row.hasUnknownDuration) return `at least ${row.minutes} min`;
  return `${row.minutes} min`;
}

/** Chromebook + school → "School Chromebook"; strips "(browser extension)" notes. */
export function deviceLabel(device) {
  if (!device) return 'Unknown device';
  const base =
    typeof device.type === 'string' ? device.type.replace(/\s*\([^)]*\)\s*/g, '').trim() : '';
  const name = base || 'device';
  return device.managedBySchool ? `School ${name}` : name;
}

export function hasUntimedOrInvalidSessions(dataQuality) {
  if (!dataQuality) return false;
  return Number(dataQuality.missingEnd) > 0 || Number(dataQuality.invalidTimeRange) > 0;
}
