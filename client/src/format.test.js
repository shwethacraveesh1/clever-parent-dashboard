import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deviceLabel,
  firstNameOf,
  formatMinutes,
  formatWindowRange,
  hasUntimedOrInvalidSessions,
} from './format.js';

describe('formatWindowRange', () => {
  it('uses AS_OF as an exclusive end', () => {
    assert.equal(
      formatWindowRange({ from: '2026-10-18T00:00:00.000Z', to: '2026-10-25T00:00:00.000Z' }),
      'Oct 18 – Oct 24, 2026 (UTC)',
    );
  });
});

describe('firstNameOf', () => {
  it('takes the first token', () => {
    assert.equal(firstNameOf('Leo Okafor'), 'Leo');
  });
});

describe('formatMinutes', () => {
  it('handles known, unknown, and partial durations', () => {
    assert.equal(formatMinutes({ minutes: 75, hasUnknownDuration: false }), '75 min');
    assert.equal(formatMinutes({ minutes: 90, hasUnknownDuration: true }), 'at least 90 min');
    assert.equal(formatMinutes({ minutes: null, hasUnknownDuration: true }), 'duration unknown');
  });
});

describe('deviceLabel', () => {
  it('builds school/home labels without IDs or paren notes', () => {
    assert.equal(deviceLabel({ type: 'Chromebook', managedBySchool: true }), 'School Chromebook');
    assert.equal(
      deviceLabel({ type: 'Home laptop (browser extension)', managedBySchool: false }),
      'Home laptop',
    );
  });
});

describe('hasUntimedOrInvalidSessions', () => {
  it('is true only for missingEnd / invalidTimeRange', () => {
    assert.equal(hasUntimedOrInvalidSessions({ duplicatesRemoved: 1, missingEnd: 0, invalidTimeRange: 0 }), false);
    assert.equal(hasUntimedOrInvalidSessions({ missingEnd: 1 }), true);
    assert.equal(hasUntimedOrInvalidSessions({ invalidTimeRange: 2 }), true);
  });
});
