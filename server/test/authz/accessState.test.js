import { describe, expect, it } from 'vitest';
import { accessStateFor } from '../../src/authz/accessState.js';

describe('accessStateFor', () => {
  it('returns ok whenever there is any Verified link, even with pending links or a pending account', () => {
    expect(
      accessStateFor({
        authorizedCount: 1,
        links: [
          { studentId: 'ST01', status: 'Verified' },
          { studentId: 'ST02', status: 'Pending' },
        ],
        guardian: { accountStatus: 'pending_verification' },
      }),
    ).toBe('ok');
  });

  it('returns pending for a pending_verification account with no Verified links', () => {
    expect(
      accessStateFor({
        authorizedCount: 0,
        links: [],
        guardian: { accountStatus: 'pending_verification' },
      }),
    ).toBe('pending');
  });

  it('returns pending for an active account that only has a Pending link', () => {
    expect(
      accessStateFor({
        authorizedCount: 0,
        links: [{ studentId: 'ST01', status: 'Pending' }],
        guardian: { accountStatus: 'active' },
      }),
    ).toBe('pending');
  });

  it('returns none for revoked links and for an empty active account', () => {
    expect(
      accessStateFor({
        authorizedCount: 0,
        links: [{ studentId: 'ST05', status: 'Revoked' }],
        guardian: { accountStatus: 'active' },
      }),
    ).toBe('none');
    expect(
      accessStateFor({ authorizedCount: 0, links: [], guardian: { accountStatus: 'active' } }),
    ).toBe('none');
  });
});
