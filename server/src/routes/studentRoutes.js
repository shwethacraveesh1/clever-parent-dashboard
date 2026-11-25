import { Router } from 'express';
import { accessStateFor } from '../authz/accessState.js';
import { getAuthorizedStudentIds } from '../authz/getAuthorizedStudentIds.js';
import { requireStudentAccess } from '../authz/requireStudentAccess.js';
import { getDashboard } from '../services/dashboardService.js';

/**
 * Mounted behind requireSession. req.guardianId is the only guardian
 * identity used; params, query, body and headers are never consulted for it.
 *
 * GET /api/students                       → { students, accessState }
 * GET /api/students/:studentId/dashboard  → dashboard, or 404
 *
 * requireStudentAccess is mounted on the whole /:studentId router, so any
 * future sub-route inherits the same check.
 */
export function studentRoutes({ dataSource, config, audit }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const [authorizedIds, links, guardian] = await Promise.all([
      getAuthorizedStudentIds(dataSource, req.guardianId),
      dataSource.getGuardianLinks(req.guardianId),
      dataSource.getGuardian(req.guardianId),
    ]);

    const students = (await Promise.all([...authorizedIds].map((id) => dataSource.getStudent(id))))
      .filter(Boolean)
      .map((s) => ({ id: s.id, name: s.name }));

    // accessState uses verified-link count, not resolved students: a Verified
    // link to a missing student record is still "ok", never "none".
    res.json({
      students,
      accessState: accessStateFor({ authorizedCount: authorizedIds.size, links, guardian }),
    });
  });

  const studentRouter = Router({ mergeParams: true });
  studentRouter.use(requireStudentAccess({ dataSource, audit }));

  studentRouter.get('/dashboard', async (req, res) => {
    const dashboard = await getDashboard(dataSource, req.params.studentId, { asOf: config.asOf });
    if (!dashboard) {
      // Authorized link to a missing record: same opaque 404 as a deny.
      audit?.record({
        guardianId: req.guardianId,
        studentId: req.params.studentId,
        outcome: 'denied',
      });
      res.status(404).json({ error: 'not_found' });
      return;
    }
    audit?.record({
      guardianId: req.guardianId,
      studentId: req.params.studentId,
      outcome: 'viewed',
    });
    res.json(dashboard);
  });

  router.use('/:studentId', studentRouter);
  return router;
}
