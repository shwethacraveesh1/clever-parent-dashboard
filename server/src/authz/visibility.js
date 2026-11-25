import { isAboveEstimatedAge } from '../services/ageRating.js';

export const CATEGORIES = ['apps', 'screenTime', 'devices', 'contentRatings', 'dataSharing'];

const DATA_QUALITY_KEYS = [
  'invalidStartDropped',
  'futureDropped',
  'outsideWindowDropped',
  'duplicatesRemoved',
  'conflictingDuplicate',
  'missingEnd',
  'invalidTimeRange',
];

function allowedCategories(district) {
  const listed = Array.isArray(district?.visibleCategories) ? district.visibleCategories : [];
  return new Set(CATEGORIES.filter((c) => listed.includes(c)));
}

/**
 * Builds the guardian-facing dashboard from an allowlist (DECISIONS §5).
 * Every field is copied explicitly under the category that permits it;
 * nothing is spread from source records, so a new field on an app, device
 * or usage row stays private until it's mapped here. Hidden fields are
 * absent, never null.
 *
 * @param {{
 *   student: { id: string, name: string, grade: number },
 *   district: { visibleCategories?: string[] } | null,
 *   window: { from: string, to: string },
 *   usage: ReturnType<typeof import('../cleaning/aggregate.js').aggregateUsage>,
 *   dataQuality: Record<string, number>,
 *   appCatalog: object[],
 *   deviceCatalog: object[],
 * }} input
 */
export function buildDashboard({ student, district, window, usage, dataQuality, appCatalog, deviceCatalog }) {
  const allowed = allowedCategories(district);
  const can = (category) => allowed.has(category);
  const appsById = new Map(appCatalog.map((a) => [a.id, a]));
  const devicesById = new Map(deviceCatalog.map((d) => [d.id, d]));

  const dashboard = {
    student: { id: student.id, name: student.name },
    window: { from: window.from, to: window.to },
    hiddenCategories: CATEGORIES.filter((c) => !can(c)),
  };

  if (can('apps')) {
    dashboard.apps = usage.apps.map((u) => appRow(u, appsById.get(u.appId), student, can));
    dashboard.dataQuality = Object.fromEntries(
      DATA_QUALITY_KEYS.map((key) => [key, Number.isInteger(dataQuality[key]) ? dataQuality[key] : 0]),
    );
  }

  if (can('screenTime')) {
    dashboard.total = {
      minutes: usage.total.minutes,
      hasUnknownDuration: usage.total.hasUnknownDuration,
    };
  }

  if (can('devices')) {
    dashboard.devices = usage.devices.map((u) => deviceRow(u, devicesById.get(u.deviceId), can));
  }

  return dashboard;
}

function appRow(usage, app, student, can) {
  const row = {
    id: usage.appId,
    name: app?.name ?? 'Unknown app',
    category: app?.category ?? null,
  };
  if (can('screenTime')) {
    row.minutes = usage.minutes;
    row.hasUnknownDuration = usage.hasUnknownDuration;
  }
  if (can('devices')) {
    row.deviceIds = [...usage.deviceIds];
  }
  if (can('contentRatings')) {
    row.ageRating = app?.ageRating ?? null;
    row.aboveEstimatedAge = isAboveEstimatedAge(app?.ageRating, student.grade);
  }
  if (can('dataSharing')) {
    row.dataReceived = [...(app?.dataReceived ?? [])];
  }
  return row;
}

function deviceRow(usage, device, can) {
  const row = {
    id: usage.deviceId,
    type: device?.type ?? null,
    managedBySchool: device?.managedBySchool ?? null,
  };
  if (can('screenTime')) {
    row.minutes = usage.minutes;
    row.hasUnknownDuration = usage.hasUnknownDuration;
  }
  return row;
}
