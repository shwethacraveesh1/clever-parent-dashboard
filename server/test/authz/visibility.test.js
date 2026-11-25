import { describe, expect, it } from 'vitest';
import { buildDashboard } from '../../src/authz/visibility.js';
import { buildTestApp, guardianRecord } from '../helpers/app.js';

const FULL_USAGE = {
  apps: [
    { appId: 'A1', minutes: 25, hasUnknownDuration: false, deviceIds: ['DV01'] },
    { appId: 'A4', minutes: null, hasUnknownDuration: true, deviceIds: ['DV06'] },
  ],
  devices: [
    { deviceId: 'DV01', minutes: 25, hasUnknownDuration: false },
    { deviceId: 'DV06', minutes: null, hasUnknownDuration: true },
  ],
  total: { minutes: 25, hasUnknownDuration: true },
};

const DATA_QUALITY = {
  invalidStartDropped: 0,
  futureDropped: 1,
  outsideWindowDropped: 0,
  duplicatesRemoved: 0,
  conflictingDuplicate: 0,
  missingEnd: 1,
  invalidTimeRange: 0,
};

const STUDENT = { id: 'ST04', name: 'Ava Lindqvist', grade: 10 };
const APPS = [
  { id: 'A1', name: 'MathQuest', category: 'Math practice', ageRating: 6, dataReceived: ['Name'] },
  { id: 'A4', name: 'VideoHub EDU', category: 'Video', ageRating: 13, dataReceived: ['Email'] },
];
const DEVICES = [
  { id: 'DV01', studentId: 'ST04', type: 'Chromebook', managedBySchool: true },
  { id: 'DV06', studentId: 'ST04', type: 'Home laptop (browser extension)', managedBySchool: false },
];
const WINDOW = { from: '2026-10-18T00:00:00.000Z', to: '2026-10-25T00:00:00.000Z' };

function build(district) {
  return buildDashboard({
    student: STUDENT,
    district,
    window: WINDOW,
    usage: FULL_USAGE,
    dataQuality: DATA_QUALITY,
    appCatalog: APPS,
    deviceCatalog: DEVICES,
  });
}

describe('buildDashboard allowlist', () => {
  it('includes every mapped field for a district that allows all categories', () => {
    const dash = build({
      visibleCategories: ['apps', 'screenTime', 'devices', 'contentRatings', 'dataSharing'],
    });
    expect(dash.hiddenCategories).toEqual([]);
    expect(dash.apps[0]).toEqual({
      id: 'A1',
      name: 'MathQuest',
      category: 'Math practice',
      minutes: 25,
      hasUnknownDuration: false,
      deviceIds: ['DV01'],
      ageRating: 6,
      aboveEstimatedAge: false,
      dataReceived: ['Name'],
    });
    expect(dash.apps[1].aboveEstimatedAge).toBe(false); // grade 10 ≈ 15 > 13
    expect(dash.total).toEqual({ minutes: 25, hasUnknownDuration: true });
    expect(dash.devices[0]).toEqual({
      id: 'DV01',
      type: 'Chromebook',
      managedBySchool: true,
      minutes: 25,
      hasUnknownDuration: false,
    });
    expect(dash.dataQuality).toEqual(DATA_QUALITY);
  });

  it('D2: apps/content/data only; no minutes or devices keys anywhere', () => {
    const dash = build({
      visibleCategories: ['apps', 'contentRatings', 'dataSharing'],
    });
    expect(dash.hiddenCategories).toEqual(['screenTime', 'devices']);
    expect(dash).not.toHaveProperty('total');
    expect(dash).not.toHaveProperty('devices');
    expect(dash.apps[0]).toEqual({
      id: 'A1',
      name: 'MathQuest',
      category: 'Math practice',
      ageRating: 6,
      aboveEstimatedAge: false,
      dataReceived: ['Name'],
    });
    // hiddenCategories may list the names "screenTime" / "devices"; the data
    // keys themselves must be absent, and no device IDs may leak.
    expect(objectKeys(dash)).not.toEqual(expect.arrayContaining(['minutes', 'devices', 'deviceIds', 'total']));
    expect(stringValues(dash).some((v) => /^DV\d+/.test(v))).toBe(false);
    expect(dash.dataQuality).toEqual(DATA_QUALITY);
  });

  it('includes aboveEstimatedAge only when contentRatings is allowed', () => {
    const without = build({
      visibleCategories: ['apps', 'screenTime', 'devices', 'dataSharing'],
    });
    expect(without.apps[0]).not.toHaveProperty('aboveEstimatedAge');
    expect(without.apps[0]).not.toHaveProperty('ageRating');
    expect(objectKeys(without)).not.toContain('aboveEstimatedAge');

    const withRatings = build({
      visibleCategories: ['apps', 'contentRatings'],
    });
    expect(withRatings.apps[0]).toHaveProperty('aboveEstimatedAge');
    expect(withRatings.apps[0]).toHaveProperty('ageRating');
  });

  it('default-denies when the district or its settings are missing', () => {
    for (const district of [null, {}, { visibleCategories: null }, { visibleCategories: ['nope'] }]) {
      const dash = build(district);
      expect(dash).toEqual({
        student: { id: 'ST04', name: 'Ava Lindqvist' },
        window: WINDOW,
        hiddenCategories: ['apps', 'screenTime', 'devices', 'contentRatings', 'dataSharing'],
      });
    }
  });

  it('does not copy unmapped fields from catalog or usage records', () => {
    const dash = buildDashboard({
      student: STUDENT,
      district: { visibleCategories: ['apps', 'screenTime', 'devices', 'contentRatings', 'dataSharing'] },
      window: WINDOW,
      usage: {
        ...FULL_USAGE,
        apps: [{ ...FULL_USAGE.apps[0], secret: 'leak' }],
        devices: [{ ...FULL_USAGE.devices[0], secret: 'leak' }],
      },
      dataQuality: { ...DATA_QUALITY, deviceIds: ['DV01'], leakedEvent: 'E1' },
      appCatalog: [{ ...APPS[0], internalNote: 'do not send' }],
      deviceCatalog: [{ ...DEVICES[0], serial: 'XYZ' }],
    });
    expect(JSON.stringify(dash)).not.toMatch(/secret|internalNote|serial|leakedEvent/);
    expect(dash.dataQuality).toEqual(DATA_QUALITY);
    expect(Object.keys(dash.dataQuality)).not.toContain('deviceIds');
  });
});

describe('D2 HTTP response deep scan', () => {
  it('contains no minutes/devices keys, and no string value matching /^DV\\d+/', async () => {
    const { loginAs } = await buildTestApp();
    const agent = await loginAs('G02');
    const res = await agent.get('/api/students/ST03/dashboard').expect(200);

    expect(res.body.student).toEqual({ id: 'ST03', name: 'Sam Reyes' });
    expect(res.body.hiddenCategories).toEqual(['screenTime', 'devices']);
    expect(res.body.apps.map((a) => a.name).sort()).toEqual(['ReadAlong', 'SciSim']);
    expect(res.body).not.toHaveProperty('total');
    expect(res.body).not.toHaveProperty('devices');

    const keys = objectKeys(res.body);
    expect(keys).not.toContain('minutes');
    expect(keys).not.toContain('devices');
    expect(keys).not.toContain('deviceIds');
    expect(keys).not.toContain('total');
    expect(stringValues(res.body).filter((v) => /^DV\d+/.test(v))).toEqual([]);
  });
});

describe('contentRatings on every app', () => {
  it.each([
    ['G02', 'ST03'],
    ['G03', 'ST04'],
  ])('%s → %s dashboard includes ageRating for every app', async (guardian, student) => {
    const { loginAs } = await buildTestApp();
    const agent = await loginAs(guardian);
    const res = await agent.get(`/api/students/${student}/dashboard`).expect(200);

    expect(res.body.apps.length).toBeGreaterThan(0);
    for (const app of res.body.apps) {
      expect(app).toHaveProperty('ageRating');
      expect(typeof app.ageRating).toBe('number');
      expect(app).toHaveProperty('aboveEstimatedAge');
    }
  });
});

/** Collects every own-property key in the JSON tree (arrays included). */
function objectKeys(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) objectKeys(item, out);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      out.push(key);
      objectKeys(child, out);
    }
  }
  return out;
}

/** Collects every string leaf in the JSON tree. */
function stringValues(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) stringValues(item, out);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) stringValues(child, out);
  }
  return out;
}

describe('pending links stay nameless', () => {
  it('returns ok and never names the pending student', async () => {
    const t = await buildTestApp();
    guardianRecord(t.ds, 'G01').links.push({ studentId: 'ST03', status: 'Pending' });

    const agent = await t.loginAs('G01');
    const res = await agent.get('/api/students').expect(200);
    expect(res.body).toEqual({
      students: [
        { id: 'ST01', name: 'Maya Okafor' },
        { id: 'ST02', name: 'Leo Okafor' },
      ],
      accessState: 'ok',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/ST03|Sam|Reyes|pendingLinkCount/i);
  });
});
