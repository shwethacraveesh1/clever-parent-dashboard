import { describe, expect, it } from 'vitest';
import { getAuthorizedStudentIds } from '../../src/authz/getAuthorizedStudentIds.js';
import { SeedDataSource } from '../../src/data/SeedDataSource.js';
import { loadSeed } from '../helpers/seed.js';

describe('getAuthorizedStudentIds', () => {
  it('returns only Verified student IDs from the seed', async () => {
    const ds = await loadSeed();
    expect([...(await getAuthorizedStudentIds(ds, 'G01'))].sort()).toEqual(['ST01', 'ST02']);
    expect([...(await getAuthorizedStudentIds(ds, 'G05'))]).toEqual([]);
    expect([...(await getAuthorizedStudentIds(ds, 'G06'))]).toEqual([]);
  });

  it('ignores Pending, Revoked and unknown statuses', async () => {
    const ds = new SeedDataSource({
      districts: [],
      students: [],
      apps: [],
      devices: [],
      events: [],
      guardians: [
        {
          id: 'G1',
          name: 'A',
          email: 'a@x',
          accountStatus: 'active',
          links: [
            { studentId: 'S1', status: 'Verified' },
            { studentId: 'S2', status: 'Pending' },
            { studentId: 'S3', status: 'Revoked' },
            { studentId: 'S4', status: 'verified' },
            { studentId: 'S5', status: 'APPROVED' },
          ],
        },
      ],
    });
    expect([...(await getAuthorizedStudentIds(ds, 'G1'))]).toEqual(['S1']);
  });

  it('returns an empty set for a missing guardian or missing ID', async () => {
    const ds = await loadSeed();
    expect(await getAuthorizedStudentIds(ds, 'G99')).toEqual(new Set());
    expect(await getAuthorizedStudentIds(ds, undefined)).toEqual(new Set());
  });
});
