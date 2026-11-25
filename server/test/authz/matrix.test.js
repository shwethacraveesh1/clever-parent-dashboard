import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../helpers/app.js';

const GUARDIANS = ['G01', 'G02', 'G03', 'G04', 'G05', 'G06'];
const STUDENTS = ['ST01', 'ST02', 'ST03', 'ST04', 'ST05', 'ST99'];

// Written out from the seed tables, not derived from the data: the only
// Verified links. ST99 doesn't exist.
const ALLOWED = new Set(['G01:ST01', 'G01:ST02', 'G02:ST03', 'G03:ST04', 'G04:ST04']);

const pairs = GUARDIANS.flatMap((g) => STUDENTS.map((s) => [g, s, ALLOWED.has(`${g}:${s}`)]));

describe('guardian × student access matrix', () => {
  let t;
  const agents = {};
  beforeAll(async () => {
    t = await buildTestApp();
    for (const g of GUARDIANS) agents[g] = await t.loginAs(g);
  });

  it.each(pairs)('%s → %s dashboard: allowed=%s', async (guardian, student, allowed) => {
    const res = await agents[guardian].get(`/api/students/${student}/dashboard`);
    if (allowed) {
      expect(res.status).toBe(200);
      expect(res.body.student.id).toBe(student);
    } else {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'not_found' });
    }
  });

  it('gives an unauthorized real student the exact same 404 as a nonexistent one', async () => {
    const real = await agents.G01.get('/api/students/ST03/dashboard');
    const fake = await agents.G01.get('/api/students/ST99/dashboard');

    expect(real.status).toBe(404);
    expect(fake.status).toBe(404);
    expect(real.body).toEqual({ error: 'not_found' });
    expect(fake.body).toEqual(real.body);
    expect(real.headers['content-type']).toBe(fake.headers['content-type']);
    expect(real.headers['content-type']).toMatch(/application\/json/);

    // No stack traces, HTML error pages, or student names in either response.
    for (const res of [real, fake]) {
      const text = res.text;
      expect(text).toBe(JSON.stringify({ error: 'not_found' }));
      expect(text).not.toMatch(/stack|Exception|<html|Sam|Reyes|ST03/i);
      expect(text).not.toMatch(/\bat\s+\S+\s+\(/); // V8 stack frames like "at foo (file:1:2)"
    }
  });

  it.each(STUDENTS)('no session → 401 for %s', async (student) => {
    await request(t.app).get(`/api/students/${student}/dashboard`).expect(401);
  });

  it('no session → 401 for the student list', async () => {
    await request(t.app).get('/api/students').expect(401);
  });

  it.each([
    ['G01', ['ST01', 'ST02'], 'ok'],
    ['G02', ['ST03'], 'ok'],
    ['G03', ['ST04'], 'ok'],
    ['G04', ['ST04'], 'ok'],
    ['G05', [], 'none'],
    ['G06', [], 'pending'],
  ])('%s lists %j with accessState %s', async (guardian, studentIds, accessState) => {
    const res = await agents[guardian].get('/api/students').expect(200);
    expect(res.body.students.map((s) => s.id)).toEqual(studentIds);
    expect(res.body.accessState).toBe(accessState);
  });

  it('G05 (revoked) gets nothing that names Noah or says "revoked"', async () => {
    const list = await agents.G05.get('/api/students');
    expect(list.body).toEqual({ students: [], accessState: 'none' });
    expect(JSON.stringify(list.body)).not.toMatch(/Noah|Brandt|ST05|revoked/i);
  });

  it('G03 and G04 share Ava but neither response mentions the other guardian', async () => {
    for (const [self, other] of [['G03', 'Erik'], ['G04', 'Priya']]) {
      const list = await agents[self].get('/api/students');
      const dash = await agents[self].get('/api/students/ST04/dashboard');
      expect(JSON.stringify([list.body, dash.body])).not.toMatch(new RegExp(`${other}|G0[34]`));
    }
  });
});
