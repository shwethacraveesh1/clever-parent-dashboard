import { describe, expect, it } from 'vitest';
import { createAuditLogger } from '../../src/audit/logger.js';
import { buildTestApp } from '../helpers/app.js';

describe('createAuditLogger', () => {
  it('writes one JSON object per line with only the allowed fields', () => {
    const lines = [];
    const audit = createAuditLogger({
      write: (line) => lines.push(line),
      now: () => Date.parse('2026-10-25T12:00:00Z'),
    });
    audit.record({ guardianId: 'G01', studentId: 'ST01', outcome: 'viewed' });

    expect(lines).toHaveLength(1);
    expect(lines[0].endsWith('\n')).toBe(true);
    expect(JSON.parse(lines[0])).toEqual({
      ts: '2026-10-25T12:00:00.000Z',
      guardianId: 'G01',
      studentId: 'ST01',
      outcome: 'viewed',
    });
  });
});

describe('access audit via HTTP', () => {
  it('records viewed for an allowed dashboard and denied for unauthorized/nonexistent', async () => {
    const t = await buildTestApp();
    const agent = await t.loginAs('G01');

    await agent.get('/api/students/ST01/dashboard').expect(200);
    await agent.get('/api/students/ST03/dashboard').expect(404);
    await agent.get('/api/students/ST99/dashboard').expect(404);

    expect(t.auditLines).toEqual([
      { guardianId: 'G01', studentId: 'ST01', outcome: 'viewed' },
      { guardianId: 'G01', studentId: 'ST03', outcome: 'denied' },
      { guardianId: 'G01', studentId: 'ST99', outcome: 'denied' },
    ]);
  });

  it('does not audit the student list', async () => {
    const t = await buildTestApp();
    const agent = await t.loginAs('G01');
    await agent.get('/api/students').expect(200);
    expect(t.auditLines).toEqual([]);
  });
});
