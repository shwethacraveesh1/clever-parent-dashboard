export const AS_OF = '2026-10-25T00:00:00Z';
export const WINDOW_START = '2026-10-18T00:00:00Z';

/** A raw UsageEvent with sensible defaults inside the window. */
export function rawEvent(eventId, overrides = {}) {
  return {
    eventId,
    studentId: 'ST01',
    deviceId: 'DV01',
    appId: 'A1',
    start: '2026-10-20T14:00:00Z',
    end: '2026-10-20T14:30:00Z',
    ...overrides,
  };
}
