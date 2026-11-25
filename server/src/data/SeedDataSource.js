import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DataSource } from './DataSource.js';

/**
 * In-memory seed files. Constructor keeps a reference to `data` so tests can
 * mutate links mid-session. Getters return deep copies.
 */
export class SeedDataSource extends DataSource {
  constructor(data) {
    super();
    this.data = data;
  }

  static async load(seedDir) {
    const readJson = async (file) =>
      JSON.parse(await readFile(path.join(seedDir, file), 'utf8'));

    const [districts, students, guardians, apps, devices, events] = await Promise.all([
      readJson('districts.json'),
      readJson('students.json'),
      readJson('guardians.json'),
      readJson('apps.json'),
      readJson('devices.json'),
      readJson('usage_events.json'),
    ]);

    return new SeedDataSource({ districts, students, guardians, apps, devices, events });
  }

  async getGuardianByEmail(email) {
    if (typeof email !== 'string') return null;
    const wanted = normalizeEmail(email);
    return profileOf(this.data.guardians.find((g) => normalizeEmail(g.email) === wanted));
  }

  async getGuardian(guardianId) {
    return profileOf(this.data.guardians.find((g) => g.id === guardianId));
  }

  async getGuardianLinks(guardianId) {
    const guardian = this.data.guardians.find((g) => g.id === guardianId);
    return copy(guardian?.links ?? []);
  }

  async getStudent(studentId) {
    return copy(this.data.students.find((s) => s.id === studentId) ?? null);
  }

  async getDistrict(districtId) {
    return copy(this.data.districts.find((d) => d.id === districtId) ?? null);
  }

  async getApps(appIds) {
    const wanted = new Set(appIds);
    return copy(this.data.apps.filter((a) => wanted.has(a.id)));
  }

  async getDevicesForStudent(studentId) {
    return copy(this.data.devices.filter((d) => d.studentId === studentId));
  }

  async getEventsForStudent(studentId, from, to) {
    const fromMs = from == null ? -Infinity : Date.parse(from);
    const toMs = to == null ? Infinity : Date.parse(to);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      throw new Error(`Invalid event range: from=${from} to=${to}`);
    }

    return copy(
      this.data.events.filter((e) => {
        if (e.studentId !== studentId) return false;
        const startMs = Date.parse(e.start);
        // Unparseable starts always return so cleaning can count them.
        if (Number.isNaN(startMs)) return true;
        return startMs >= fromMs && startMs < toMs;
      }),
    );
  }
}

function profileOf(guardian) {
  if (!guardian) return null;
  const { links: _links, ...profile } = guardian;
  return copy(profile);
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function copy(value) {
  return structuredClone(value);
}
