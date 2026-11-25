/**
 * Contract for every data source (seed files today, district/Clever API later).
 *
 * Methods return raw records only. They do not check link status, apply
 * district visibility, or clean usage events — that all lives in the service
 * layer so swapping the source can't change any rule. Every method is async
 * so callers don't change when a source becomes a network call.
 *
 * Lookups that find nothing resolve to null (single record) or [] (lists);
 * they don't throw.
 *
 * @typedef {'Verified' | 'Pending' | 'Revoked'} LinkStatus
 * @typedef {'apps' | 'screenTime' | 'devices' | 'contentRatings' | 'dataSharing'} Category
 *
 * @typedef {'active' | 'pending_verification'} AccountStatus
 *
 * @typedef {{ id: string, name: string, email: string, accountStatus: AccountStatus }} Guardian
 * @typedef {{ studentId: string, status: LinkStatus }} GuardianLink
 * @typedef {{ id: string, name: string, grade: number, districtId: string }} Student
 * @typedef {{ id: string, name: string, studentCount: number, visibleCategories: Category[] }} District
 * @typedef {{ id: string, name: string, category: string, ageRating: number, dataReceived: string[] }} App
 * @typedef {{ id: string, studentId: string, type: string, managedBySchool: boolean }} Device
 *
 * Usage events are unvalidated: `start` and `end` are ISO-8601 strings as
 * received, and either may be null, malformed, reversed or in the future.
 * @typedef {{
 *   eventId: string, studentId: string, deviceId: string, appId: string,
 *   start: string | null, end: string | null
 * }} UsageEvent
 */
export class DataSource {
  /** @returns {Promise<Guardian | null>} */
  async getGuardianByEmail(_email) {
    throw notImplemented(this, 'getGuardianByEmail');
  }

  /** @returns {Promise<Guardian | null>} */
  async getGuardian(_guardianId) {
    throw notImplemented(this, 'getGuardian');
  }

  /** @returns {Promise<GuardianLink[]>} every link, whatever its status */
  async getGuardianLinks(_guardianId) {
    throw notImplemented(this, 'getGuardianLinks');
  }

  /** @returns {Promise<Student | null>} */
  async getStudent(_studentId) {
    throw notImplemented(this, 'getStudent');
  }

  /** @returns {Promise<District | null>} */
  async getDistrict(_districtId) {
    throw notImplemented(this, 'getDistrict');
  }

  /** @returns {Promise<App[]>} known apps only; unknown IDs are omitted */
  async getApps(_appIds) {
    throw notImplemented(this, 'getApps');
  }

  /** @returns {Promise<Device[]>} */
  async getDevicesForStudent(_studentId) {
    throw notImplemented(this, 'getDevicesForStudent');
  }

  /**
   * Coarse fetch by start time: `from` inclusive, `to` exclusive, both
   * optional ISO strings. Events whose start can't be parsed are always
   * included so the cleaning layer can see and count them. The dashboard
   * passes only `from`; future-dated events must reach cleaning rule 1.
   *
   * @returns {Promise<UsageEvent[]>}
   */
  async getEventsForStudent(_studentId, _from, _to) {
    throw notImplemented(this, 'getEventsForStudent');
  }
}

function notImplemented(source, method) {
  return new Error(`${source.constructor.name}.${method} is not implemented`);
}
