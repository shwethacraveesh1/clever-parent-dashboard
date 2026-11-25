/**
 * The single source of truth for which students a guardian may see: those
 * with a link whose status is exactly "Verified". Anything else (Pending,
 * Revoked, unknown or mistyped statuses) grants nothing.
 *
 * Reads links fresh on every call; never cache this in the session.
 *
 * @param {import('../data/DataSource.js').DataSource} dataSource
 * @returns {Promise<Set<string>>}
 */
export async function getAuthorizedStudentIds(dataSource, guardianId) {
  if (!guardianId) return new Set();
  const links = await dataSource.getGuardianLinks(guardianId);
  return new Set(links.filter((l) => l.status === 'Verified').map((l) => l.studentId));
}
