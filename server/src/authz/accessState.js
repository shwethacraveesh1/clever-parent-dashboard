/**
 * accessState for GET /api/students (docs/DECISIONS.md §4). First match wins:
 *   ok      any Verified link
 *   pending account pending_verification, or any Pending link
 *   none    everything else, revoked included; never reveal "revoked"
 *
 * @param {{ authorizedCount: number, links: { status: string }[], guardian: { accountStatus?: string } | null }} input
 * @returns {'ok' | 'pending' | 'none'}
 */
export function accessStateFor({ authorizedCount, links, guardian }) {
  if (authorizedCount > 0) return 'ok';
  if (guardian?.accountStatus === 'pending_verification') return 'pending';
  if (links.some((l) => l.status === 'Pending')) return 'pending';
  return 'none';
}
