import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../helpers/app.js';

describe('tampering', () => {
  let t;
  let ruth;
  beforeAll(async () => {
    t = await buildTestApp();
    ruth = await t.loginAs('G01');
  });

  it('changing the student ID in the URL never reveals another family’s data', async () => {
    const own = await ruth.get('/api/students/ST01/dashboard').expect(200);
    const other = await ruth.get('/api/students/ST03/dashboard').expect(404);

    expect(own.body.student.id).toBe('ST01');
    expect(other.body).toEqual({ error: 'not_found' });
    expect(JSON.stringify(other.body)).not.toMatch(/Sam|Reyes|ST03|SciSim/);
  });

  it('a guardianId in the body, query or header never changes who is authorized', async () => {
    const baseline = await ruth.get('/api/students').expect(200);

    for (const req of [
      ruth.get('/api/students').query({ guardianId: 'G02' }),
      ruth.get('/api/students').set('X-Guardian-Id', 'G02'),
      ruth.get('/api/students/ST03/dashboard').send({ guardianId: 'G02' }),
      ruth.get('/api/students/ST03/dashboard').query({ guardianId: 'G02' }),
      ruth.get('/api/students/ST03/dashboard').set('X-Guardian-Id', 'G02'),
    ]) {
      const res = await req;
      if (res.status === 200) {
        expect(res.body.students.map((s) => s.id)).toEqual(baseline.body.students.map((s) => s.id));
      } else {
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'not_found' });
      }
    }
  });

  it('another guardian’s session cookie cannot be forged by writing their ID into the body', async () => {
    const res = await request(t.app)
      .get('/api/students/ST03/dashboard')
      .send({ guardianId: 'G02' })
      .expect(401);
    expect(res.body).toEqual({ error: 'unauthenticated' });
  });
});
