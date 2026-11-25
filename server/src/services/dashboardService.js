import { aggregateUsage } from '../cleaning/aggregate.js';
import { DEFAULT_WINDOW_DAYS, cleanEvents } from '../cleaning/cleanEvents.js';
import { buildDashboard } from '../authz/visibility.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Assumes the caller already checked access (requireStudentAccess).
 * Order: fetch → clean → aggregate → visibility allowlist.
 *
 * @param {import('../data/DataSource.js').DataSource} dataSource
 * @returns {Promise<object | null>} null if the student doesn't exist
 */
export async function getDashboard(dataSource, studentId, { asOf, windowDays = DEFAULT_WINDOW_DAYS }) {
  const student = await dataSource.getStudent(studentId);
  if (!student) return null;

  const asOfMs = Date.parse(asOf);
  const window = {
    from: new Date(asOfMs - windowDays * DAY_MS).toISOString(),
    to: new Date(asOfMs).toISOString(),
  };

  const [district, rawEvents, deviceCatalog] = await Promise.all([
    dataSource.getDistrict(student.districtId),
    // No upper bound: future-dated events must reach cleaning rule 1 to be counted.
    dataSource.getEventsForStudent(studentId, window.from),
    dataSource.getDevicesForStudent(studentId),
  ]);

  // A source bug must not put another student's usage on this dashboard.
  const ownEvents = rawEvents.filter((e) => e.studentId === studentId);
  const { events, dataQuality } = cleanEvents(ownEvents, { asOf, windowDays });
  const usage = aggregateUsage(events);
  const appCatalog = await dataSource.getApps(usage.apps.map((a) => a.appId));

  return buildDashboard({ student, district, window, usage, dataQuality, appCatalog, deviceCatalog });
}
