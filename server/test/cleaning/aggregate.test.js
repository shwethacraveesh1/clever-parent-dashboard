import { describe, expect, it } from 'vitest';
import { aggregateUsage } from '../../src/cleaning/aggregate.js';
import { cleanEvents } from '../../src/cleaning/cleanEvents.js';
import { AS_OF, rawEvent } from '../helpers/events.js';

const run = (events) => aggregateUsage(cleanEvents(events, { asOf: AS_OF }).events);

// E004 / E005: CodeLab on two devices, overlapping 16:30–17:00.
const e004 = rawEvent('E004', { deviceId: 'DV02', appId: 'A3', start: '2026-10-20T16:00:00Z', end: '2026-10-20T17:00:00Z' });
const e005 = rawEvent('E005', { deviceId: 'DV03', appId: 'A3', start: '2026-10-20T16:30:00Z', end: '2026-10-20T17:15:00Z' });

describe('aggregateUsage', () => {
  describe('rule 6: time per app is the union of its intervals across devices', () => {
    it('counts CodeLab as 75 min, not 105', () => {
      const [codeLab] = run([e004, e005]).apps;
      expect(codeLab).toEqual({
        appId: 'A3',
        minutes: 75,
        hasUnknownDuration: false,
        deviceIds: ['DV02', 'DV03'],
      });
    });

    it('does not merge different apps that overlap in time', () => {
      const apps = run([e004, { ...e005, eventId: 'E5', appId: 'A1' }]).apps;
      expect(apps.map((a) => [a.appId, a.minutes])).toEqual([
        ['A3', 60],
        ['A1', 45],
      ]);
    });
  });

  describe('rule 7: time per device is that device’s own intervals', () => {
    it('gives DV02 60 min and DV03 45 min', () => {
      expect(run([e004, e005]).devices).toEqual([
        { deviceId: 'DV02', minutes: 60, hasUnknownDuration: false },
        { deviceId: 'DV03', minutes: 45, hasUnknownDuration: false },
      ]);
    });

    it('unions overlapping apps on the same device', () => {
      const [device] = run([e004, { ...e004, eventId: 'E5', appId: 'A1', start: '2026-10-20T16:30:00Z', end: '2026-10-20T17:30:00Z' }]).devices;
      expect(device.minutes).toBe(90);
    });
  });

  describe('used vs. duration unknown (rules 4–5 downstream)', () => {
    it('shows an app with only untimed events as used, with null minutes', () => {
      const result = run([rawEvent('E009', { appId: 'A4', deviceId: 'DV06', end: null })]);
      expect(result.apps).toEqual([
        { appId: 'A4', minutes: null, hasUnknownDuration: true, deviceIds: ['DV06'] },
      ]);
      expect(result.devices).toEqual([{ deviceId: 'DV06', minutes: null, hasUnknownDuration: true }]);
    });

    it('keeps known minutes for an app that also has untimed events', () => {
      const [app] = run([rawEvent('E1'), rawEvent('E2', { start: '2026-10-21T10:00:00Z', end: null })]).apps;
      expect(app).toMatchObject({ minutes: 30, hasUnknownDuration: true });
    });
  });

  describe('total', () => {
    it('is the sum of per-app minutes, flagged when some usage is untimed ("at least")', () => {
      const result = run([e004, e005, rawEvent('E006', { appId: 'A4', deviceId: 'DV03', start: '2026-10-20T22:10:00Z', end: '2026-10-20T21:50:00Z' })]);
      expect(result.total).toEqual({ minutes: 75, hasUnknownDuration: true });
    });

    it('is not flagged when everything was timed', () => {
      expect(run([e004, e005]).total).toEqual({ minutes: 75, hasUnknownDuration: false });
    });

    it('is null minutes when there was usage but none of it could be timed', () => {
      expect(run([rawEvent('E1', { end: null })]).total).toEqual({ minutes: null, hasUnknownDuration: true });
    });

    it('is 0 with no usage at all', () => {
      expect(run([])).toEqual({ apps: [], devices: [], total: { minutes: 0, hasUnknownDuration: false } });
    });
  });
});
