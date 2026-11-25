import { describe, expect, it } from 'vitest';
import { buildTestApp, guardianRecord } from '../helpers/app.js';

describe('revocation mid-session', () => {
  it('returns 404 on the next request after a Verified link is revoked', async () => {
    const t = await buildTestApp();
    const agent = await t.loginAs('G01');

    await agent.get('/api/students/ST01/dashboard').expect(200);
    await agent.get('/api/students').expect(200).then((res) => {
      expect(res.body.students.map((s) => s.id)).toEqual(['ST01', 'ST02']);
      expect(res.body.accessState).toBe('ok');
    });

    const link = guardianRecord(t.ds, 'G01').links.find((l) => l.studentId === 'ST01');
    link.status = 'Revoked';

    await agent.get('/api/students/ST01/dashboard').expect(404);
    const list = await agent.get('/api/students').expect(200);
    expect(list.body.students.map((s) => s.id)).toEqual(['ST02']);
    expect(list.body.accessState).toBe('ok');
    expect(JSON.stringify(list.body)).not.toMatch(/ST01|Maya|revoked/i);
  });

  it('flips accessState to none when the last Verified link is revoked', async () => {
    const t = await buildTestApp();
    const agent = await t.loginAs('G02');
    await agent.get('/api/students/ST03/dashboard').expect(200);

    guardianRecord(t.ds, 'G02').links[0].status = 'Revoked';

    await agent.get('/api/students/ST03/dashboard').expect(404);
    const list = await agent.get('/api/students').expect(200);
    expect(list.body).toEqual({ students: [], accessState: 'none' });
  });
});
