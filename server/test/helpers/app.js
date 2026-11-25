import request from 'supertest';
import { createApp } from '../../src/app.js';
import { SeedDataSource } from '../../src/data/SeedDataSource.js';
import { AS_OF } from './events.js';
import { loadSeed } from './seed.js';

const MINUTE_MS = 60 * 1000;

export const TEST_CONFIG = {
  asOf: AS_OF,
  appOrigin: 'http://localhost:5173',
  tokenTtlMs: 15 * MINUTE_MS,
  sessionTtlMs: 8 * 60 * MINUTE_MS,
  cookie: { name: 'sid', secure: false },
};

export const EMAILS = {
  G01: 'ruth.okafor@example.com',
  G02: 'dan.reyes@example.com',
  G03: 'priya.l@example.com',
  G04: 'erik.l@example.com',
  G05: 'jamie.brandt@example.com',
  G06: 'chris.m@example.com',
};

/**
 * A fresh app over a fresh copy of the seed data. `ds.data` can be changed
 * mid-test (e.g. to revoke a link); the app sees it on the next request.
 */
export async function buildTestApp({ data, config = TEST_CONFIG, mailer: mailerOverride } = {}) {
  const ds = data ? new SeedDataSource(data) : await loadSeed();
  const clock = { t: Date.parse('2026-10-25T12:00:00Z') };
  clock.now = () => clock.t;
  clock.advance = (ms) => {
    clock.t += ms;
  };

  const sent = [];
  const mailer = {
    async sendMagicLink(email, url) {
      sent.push({ email, url, token: decodeURIComponent(new URL(url).hash.replace(/^#token=/, '')) });
    },
  };

  const auditLines = [];
  const audit = {
    record(entry) {
      auditLines.push(entry);
    },
  };

  const app = createApp({
    dataSource: ds,
    config,
    mailer: mailerOverride ?? mailer,
    now: clock.now,
    log: () => {},
    audit,
  });

  async function requestToken(email) {
    await request(app).post('/api/auth/request-link').send({ email }).expect(202);
    return sent.at(-1).token;
  }

  /** @returns a Supertest agent holding the guardian's session cookie */
  async function loginAs(guardianId) {
    const token = await requestToken(EMAILS[guardianId]);
    const agent = request.agent(app);
    await agent.post('/api/auth/verify').send({ token }).expect(200);
    return agent;
  }

  return { app, ds, clock, sent, auditLines, requestToken, loginAs };
}

export function guardianRecord(ds, guardianId) {
  return ds.data.guardians.find((g) => g.id === guardianId);
}
