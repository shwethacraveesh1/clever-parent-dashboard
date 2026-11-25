import { getAuthorizedStudentIds } from './getAuthorizedStudentIds.js';

/**
 * Mount on the whole /:studentId router (not per-route) so every sub-path
 * is checked the same way. Unauthorized and nonexistent students both get
 * `{ error: "not_found" }` with no stack — the API never confirms that a
 * student ID exists.
 */
export function requireStudentAccess({ dataSource, audit }) {
  return async (req, res, next) => {
    const studentId = req.params.studentId;
    const authorized = await getAuthorizedStudentIds(dataSource, req.guardianId);
    if (!authorized.has(studentId)) {
      audit?.record({
        guardianId: req.guardianId,
        studentId,
        outcome: 'denied',
      });
      res.status(404).json({ error: 'not_found' });
      return;
    }
    next();
  };
}
