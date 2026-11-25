import { beforeAll, describe, expect, it } from 'vitest';
import { ApiDataSource, DataSource, SeedDataSource, createDataSource } from '../../src/data/index.js';
import { SEED_DIR, loadSeed } from '../helpers/seed.js';

const WINDOW_START = '2026-10-18T00:00:00Z';
const AS_OF = '2026-10-25T00:00:00Z';

describe('SeedDataSource (seed files)', () => {
  let ds;
  beforeAll(async () => {
    ds = await loadSeed();
  });

  it('is a DataSource', () => {
    expect(ds).toBeInstanceOf(DataSource);
  });

  describe('getGuardianByEmail', () => {
    it('matches case-insensitively and ignores surrounding whitespace', async () => {
      expect(await ds.getGuardianByEmail('  Ruth.Okafor@Example.com ')).toEqual({
        id: 'G01',
        name: 'Ruth Okafor',
        email: 'ruth.okafor@example.com',
        accountStatus: 'active',
      });
    });

    it('does not expose links on the guardian profile', async () => {
      expect(await ds.getGuardianByEmail('ruth.okafor@example.com')).not.toHaveProperty('links');
    });

    it('returns accountStatus pending_verification for G06', async () => {
      expect((await ds.getGuardianByEmail('chris.m@example.com')).accountStatus).toBe(
        'pending_verification',
      );
    });

    it('returns null for unknown or non-string emails', async () => {
      expect(await ds.getGuardianByEmail('nobody@example.com')).toBeNull();
      expect(await ds.getGuardianByEmail(undefined)).toBeNull();
      expect(await ds.getGuardianByEmail({ $ne: null })).toBeNull();
    });
  });

  it('getGuardian looks up by ID, without links, or returns null', async () => {
    expect(await ds.getGuardian('G06')).toEqual({
      id: 'G06',
      name: 'Chris Moreno',
      email: 'chris.m@example.com',
      accountStatus: 'pending_verification',
    });
    expect(await ds.getGuardian('G99')).toBeNull();
  });

  describe('getGuardianLinks', () => {
    it('returns links of every status, unfiltered', async () => {
      expect(await ds.getGuardianLinks('G01')).toEqual([
        { studentId: 'ST01', status: 'Verified' },
        { studentId: 'ST02', status: 'Verified' },
      ]);
      expect(await ds.getGuardianLinks('G05')).toEqual([{ studentId: 'ST05', status: 'Revoked' }]);
    });

    it('returns [] for a guardian with no links or an unknown guardian', async () => {
      expect(await ds.getGuardianLinks('G06')).toEqual([]);
      expect(await ds.getGuardianLinks('G99')).toEqual([]);
    });
  });

  it('getStudent returns the student or null', async () => {
    expect(await ds.getStudent('ST02')).toEqual({
      id: 'ST02',
      name: 'Leo Okafor',
      grade: 7,
      districtId: 'D1',
    });
    expect(await ds.getStudent('ST99')).toBeNull();
  });

  it('getDistrict includes visibility settings, or null', async () => {
    expect((await ds.getDistrict('D2')).visibleCategories).toEqual([
      'apps',
      'contentRatings',
      'dataSharing',
    ]);
    expect(await ds.getDistrict('D9')).toBeNull();
  });

  it('getApps returns known apps and omits unknown IDs', async () => {
    const apps = await ds.getApps(['A4', 'A9']);
    expect(apps).toEqual([
      { id: 'A4', name: 'VideoHub EDU', category: 'Video', ageRating: 13, dataReceived: ['Email'] },
    ]);
  });

  it('getDevicesForStudent returns only that student’s devices', async () => {
    expect((await ds.getDevicesForStudent('ST02')).map((d) => d.id)).toEqual(['DV02', 'DV03']);
    expect(await ds.getDevicesForStudent('ST99')).toEqual([]);
  });

  describe('getEventsForStudent', () => {
    it('returns raw events with null for a missing end', async () => {
      const events = await ds.getEventsForStudent('ST04');
      expect(events.map((e) => [e.eventId, e.end])).toEqual([
        ['E008', '2026-10-22T19:30:00Z'],
        ['E009', null],
        ['E010', '2027-03-01T10:20:00Z'],
      ]);
    });

    it('with only `from`, keeps future-dated events so cleaning can count them', async () => {
      const ids = (await ds.getEventsForStudent('ST04', WINDOW_START)).map((e) => e.eventId);
      expect(ids).toEqual(['E008', 'E009', 'E010']);
    });

    it('with `from` and `to`, filters by start (to exclusive)', async () => {
      const ids = (await ds.getEventsForStudent('ST04', WINDOW_START, AS_OF)).map((e) => e.eventId);
      expect(ids).toEqual(['E008', 'E009']);
    });

    it('does not clean anything: duplicates and reversed ranges come through', async () => {
      const st01 = (await ds.getEventsForStudent('ST01')).map((e) => e.eventId);
      expect(st01).toEqual(['E001', 'E002', 'E003']);
      const e006 = (await ds.getEventsForStudent('ST02')).find((e) => e.eventId === 'E006');
      expect(e006).toMatchObject({ start: '2026-10-20T22:10:00Z', end: '2026-10-20T21:50:00Z' });
    });

    it('rejects an unparseable range', async () => {
      await expect(ds.getEventsForStudent('ST01', 'yesterday')).rejects.toThrow('Invalid event range');
    });
  });

  it('returns copies, so callers cannot mutate the store', async () => {
    const student = await ds.getStudent('ST01');
    student.name = 'Changed';
    const links = await ds.getGuardianLinks('G05');
    links[0].status = 'Verified';

    expect((await ds.getStudent('ST01')).name).toBe('Maya Okafor');
    expect((await ds.getGuardianLinks('G05'))[0].status).toBe('Revoked');
  });
});

describe('SeedDataSource (in-memory data)', () => {
  it('reads the data object by reference, so tests can change links mid-session', async () => {
    const data = {
      districts: [],
      students: [],
      apps: [],
      devices: [],
      events: [],
      guardians: [
        { id: 'G1', name: 'A', email: 'a@x', accountStatus: 'active', links: [{ studentId: 'S1', status: 'Verified' }] },
      ],
    };
    const ds = new SeedDataSource(data);
    expect(await ds.getGuardianLinks('G1')).toEqual([{ studentId: 'S1', status: 'Verified' }]);

    data.guardians[0].links[0].status = 'Revoked';
    expect(await ds.getGuardianLinks('G1')).toEqual([{ studentId: 'S1', status: 'Revoked' }]);
  });

  it('includes events with an unparseable start even when a range is given', async () => {
    const ds = new SeedDataSource({
      districts: [], students: [], guardians: [], apps: [], devices: [],
      events: [{ eventId: 'X', studentId: 'S1', deviceId: 'D', appId: 'A', start: 'garbage', end: null }],
    });
    expect(await ds.getEventsForStudent('S1', WINDOW_START, AS_OF)).toHaveLength(1);
  });
});

describe('createDataSource', () => {
  it('builds a SeedDataSource by default', async () => {
    expect(await createDataSource({ seedDir: SEED_DIR })).toBeInstanceOf(SeedDataSource);
  });

  it('builds an ApiDataSource whose methods are not implemented yet', async () => {
    const ds = await createDataSource({ type: 'api', apiBaseUrl: 'http://localhost:9' });
    expect(ds).toBeInstanceOf(ApiDataSource);
    await expect(ds.getStudent('ST01')).rejects.toThrow('ApiDataSource.getStudent is not implemented');
  });

  it('rejects missing config and unknown types', async () => {
    await expect(createDataSource({ type: 'seed' })).rejects.toThrow('seedDir is required');
    await expect(createDataSource({ type: 'api' })).rejects.toThrow('requires a baseUrl');
    await expect(createDataSource({ type: 'sql' })).rejects.toThrow('unknown type "sql"');
  });
});
