import { beforeAll, describe, expect, it } from 'vitest';
import { aggregateUsage } from '../../src/cleaning/aggregate.js';
import { cleanEvents } from '../../src/cleaning/cleanEvents.js';
import { AS_OF, WINDOW_START } from '../helpers/events.js';
import { loadSeed } from '../helpers/seed.js';

/**
 * docs/DECISIONS.md §7, run end to end on the seed data: fetch with only
 * `from` (as the service will), clean, aggregate. Visibility and authorization
 * are not applied here, so ST03 still has minutes at this layer.
 *
 * Expected values are literals copied from §7, never computed with the
 * helpers under test.
 */
const NO_ISSUES = {
  invalidStartDropped: 0,
  futureDropped: 0,
  outsideWindowDropped: 0,
  duplicatesRemoved: 0,
  conflictingDuplicate: 0,
  missingEnd: 0,
  invalidTimeRange: 0,
};

describe('§7 expected dashboards (cleaning + aggregation)', () => {
  let dashboardFor;
  beforeAll(async () => {
    const ds = await loadSeed();
    dashboardFor = async (studentId) => {
      const raw = await ds.getEventsForStudent(studentId, WINDOW_START);
      const { events, dataQuality } = cleanEvents(raw, { asOf: AS_OF });
      return { ...aggregateUsage(events), dataQuality };
    };
  });

  it('ST01 Maya: MathQuest 25, ReadAlong 40, total 65, DV01, 1 duplicate removed', async () => {
    expect(await dashboardFor('ST01')).toEqual({
      apps: [
        { appId: 'A1', minutes: 25, hasUnknownDuration: false, deviceIds: ['DV01'] },
        { appId: 'A2', minutes: 40, hasUnknownDuration: false, deviceIds: ['DV01'] },
      ],
      devices: [{ deviceId: 'DV01', minutes: 65, hasUnknownDuration: false }],
      total: { minutes: 65, hasUnknownDuration: false },
      dataQuality: { ...NO_ISSUES, duplicatesRemoved: 1 },
    });
  });

  it('ST02 Leo: CodeLab 75 (DV02 60, DV03 45), VideoHub used with unknown duration, 1 invalid range', async () => {
    expect(await dashboardFor('ST02')).toEqual({
      apps: [
        { appId: 'A3', minutes: 75, hasUnknownDuration: false, deviceIds: ['DV02', 'DV03'] },
        { appId: 'A4', minutes: null, hasUnknownDuration: true, deviceIds: ['DV03'] },
      ],
      devices: [
        { deviceId: 'DV02', minutes: 60, hasUnknownDuration: false },
        { deviceId: 'DV03', minutes: 45, hasUnknownDuration: true },
      ],
      total: { minutes: 75, hasUnknownDuration: true },
      dataQuality: { ...NO_ISSUES, invalidTimeRange: 1 },
    });
  });

  it('ST03 Sam: SciSim and ReadAlong, no data-quality issues', async () => {
    const dashboard = await dashboardFor('ST03');
    expect(dashboard.apps.map((a) => a.appId)).toEqual(['A6', 'A2']);
    expect(dashboard.apps.map((a) => a.minutes)).toEqual([45, 20]);
    expect(dashboard.dataQuality).toEqual(NO_ISSUES);
  });

  it('ST04 Ava: ChatTutor 90 (DV05), VideoHub used with unknown duration (DV06), 1 missing end, 1 future dropped', async () => {
    expect(await dashboardFor('ST04')).toEqual({
      apps: [
        { appId: 'A5', minutes: 90, hasUnknownDuration: false, deviceIds: ['DV05'] },
        { appId: 'A4', minutes: null, hasUnknownDuration: true, deviceIds: ['DV06'] },
      ],
      devices: [
        { deviceId: 'DV05', minutes: 90, hasUnknownDuration: false },
        { deviceId: 'DV06', minutes: null, hasUnknownDuration: true },
      ],
      total: { minutes: 90, hasUnknownDuration: true },
      dataQuality: { ...NO_ISSUES, missingEnd: 1, futureDropped: 1 },
    });
  });
});
