import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { LINK_SENT_MESSAGE } from '../../src/auth/authRoutes.js';
import { EMAILS, TEST_CONFIG, buildTestApp } from '../helpers/app.js';

const MINUTE_MS = 60 * 1000;

function sessionCookie(res) {
  return res.headers['set-cookie']?.find((c) => c.startsWith('sid='));
}

describe('auth routes', () => {
  let t;
  beforeEach(async () => {
    t = await buildTestApp();
  });

  describe('POST /api/auth/request-link', () => {
    it('gives known and unknown emails the identical response, and only emails known ones', async () => {
      const known = await request(t.app).post('/api/auth/request-link').send({ email: EMAILS.G01 });
      const unknown = await request(t.app).post('/api/auth/request-link').send({ email: 'nobody@example.com' });

      expect(known.status).toBe(202);
      expect(unknown.status).toBe(202);
      expect(unknown.body).toEqual(known.body);
      expect(known.body).toEqual({ message: LINK_SENT_MESSAGE });
      expect(t.sent.map((m) => m.email)).toEqual([EMAILS.G01]);
    });

    it('sends the link to the address on file, with the token in the URL fragment', async () => {
      await request(t.app).post('/api/auth/request-link').send({ email: '  RUTH.okafor@example.com' });
      const [mail] = t.sent;
      expect(mail.email).toBe(EMAILS.G01);
      expect(mail.url).toMatch(/^http:\/\/localhost:5173\/verify#token=[A-Za-z0-9_-]+$/);
    });

    it('lets revoked and pending guardians log in (no revealing error)', async () => {
      for (const email of [EMAILS.G05, EMAILS.G06]) {
        await request(t.app).post('/api/auth/request-link').send({ email }).expect(202);
      }
      expect(t.sent).toHaveLength(2);
    });

    it('rejects a missing, non-string or oversized email with 400', async () => {
      for (const body of [{}, { email: '' }, { email: ['a@b.c'] }, { email: `${'a'.repeat(250)}@x.com` }]) {
        await request(t.app).post('/api/auth/request-link').send(body).expect(400);
      }
    });

    it('requires a JSON body (blocks cross-site form posts)', async () => {
      await request(t.app)
        .post('/api/auth/request-link')
        .type('form')
        .send({ email: EMAILS.G01 })
        .expect(415);
      expect(t.sent).toHaveLength(0);
    });

    it('still answers 202 if the mailer fails, so failures do not reveal known emails', async () => {
      const broken = await buildTestApp({
        mailer: {
          async sendMagicLink() {
            throw new Error('SMTP down');
          },
        },
      });
      const res = await request(broken.app).post('/api/auth/request-link').send({ email: EMAILS.G01 });
      expect(res.status).toBe(202);
      expect(res.body).toEqual({ message: LINK_SENT_MESSAGE });
    });
  });

  describe('POST /api/auth/verify', () => {
    it('creates a session with an httpOnly, SameSite=Lax cookie', async () => {
      const token = await t.requestToken(EMAILS.G01);
      const res = await request(t.app).post('/api/auth/verify').send({ token }).expect(200);

      expect(res.body).toEqual({ guardian: { name: 'Ruth Okafor', email: EMAILS.G01 } });
      const cookie = sessionCookie(res);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\//);
      expect(cookie).not.toMatch(/Secure/i);
    });

    it('sets Secure when configured for production', async () => {
      const prod = await buildTestApp({
        config: { ...TEST_CONFIG, cookie: { ...TEST_CONFIG.cookie, secure: true } },
      });
      const token = await prod.requestToken(EMAILS.G01);
      const res = await request(prod.app).post('/api/auth/verify').send({ token }).expect(200);
      expect(sessionCookie(res)).toMatch(/Secure/i);
    });

    it('rejects a reused token', async () => {
      const token = await t.requestToken(EMAILS.G01);
      await request(t.app).post('/api/auth/verify').send({ token }).expect(200);
      const reuse = await request(t.app).post('/api/auth/verify').send({ token }).expect(401);
      expect(reuse.body).toEqual({ error: 'invalid_or_expired_link' });
      expect(sessionCookie(reuse)).toBeUndefined();
    });

    it('accepts a token just before 15 minutes and rejects it at 15 minutes', async () => {
      const fresh = await t.requestToken(EMAILS.G01);
      const stale = await t.requestToken(EMAILS.G01);
      t.clock.advance(15 * MINUTE_MS - 1);
      await request(t.app).post('/api/auth/verify').send({ token: fresh }).expect(200);
      t.clock.advance(1);
      await request(t.app).post('/api/auth/verify').send({ token: stale }).expect(401);
    });

    it('rejects missing, forged and non-string tokens', async () => {
      for (const body of [{}, { token: 'forged' }, { token: { $gt: '' } }]) {
        await request(t.app).post('/api/auth/verify').send(body).expect(401);
      }
    });

    it('replaces any existing session instead of reusing it', async () => {
      const agent = await t.loginAs('G02');
      const token = await t.requestToken(EMAILS.G01);
      await agent.post('/api/auth/verify').send({ token }).expect(200);

      const me = await agent.get('/api/auth/me').expect(200);
      expect(me.body.guardian.name).toBe('Ruth Okafor');
    });

    it('issues a new session ID on verify (no session fixation)', async () => {
      const planted = 'planted-session-id-should-not-be-kept';
      const token = await t.requestToken(EMAILS.G01);
      const res = await request(t.app)
        .post('/api/auth/verify')
        .set('Cookie', `sid=${planted}`)
        .send({ token })
        .expect(200);

      const cookie = sessionCookie(res);
      const newSid = cookie.match(/^sid=([^;]+)/)[1];
      expect(newSid).toBeTruthy();
      expect(decodeURIComponent(newSid)).not.toBe(planted);

      // The planted cookie must not authenticate anyone.
      await request(t.app).get('/api/auth/me').set('Cookie', `sid=${planted}`).expect(401);
      await request(t.app).get('/api/auth/me').set('Cookie', `sid=${newSid}`).expect(200);
    });
  });

  describe('sessions', () => {
    it('GET /api/auth/me returns 401 without a session', async () => {
      await request(t.app).get('/api/auth/me').expect(401);
    });

    it('expire after 8 hours', async () => {
      const agent = await t.loginAs('G01');
      t.clock.advance(8 * 60 * MINUTE_MS - 1);
      await agent.get('/api/auth/me').expect(200);
      t.clock.advance(1);
      await agent.get('/api/auth/me').expect(401);
      await agent.get('/api/students').expect(401);
    });

    it('rejects a forged session cookie', async () => {
      await request(t.app).get('/api/students').set('Cookie', 'sid=forged').expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('destroys the server session, so replaying the old cookie fails', async () => {
      const token = await t.requestToken(EMAILS.G01);
      const login = await request(t.app).post('/api/auth/verify').send({ token });
      const cookie = sessionCookie(login).split(';')[0];

      await request(t.app).get('/api/students').set('Cookie', cookie).expect(200);

      const out = await request(t.app).post('/api/auth/logout').set('Cookie', cookie).send({}).expect(204);
      expect(sessionCookie(out)).toMatch(/sid=;/);

      await request(t.app).get('/api/students').set('Cookie', cookie).expect(401);
      await request(t.app).get('/api/auth/me').set('Cookie', cookie).expect(401);
    });

    it('only ends the caller’s session', async () => {
      const ruth = await t.loginAs('G01');
      const dan = await t.loginAs('G02');
      await ruth.post('/api/auth/logout').send({}).expect(204);
      await dan.get('/api/auth/me').expect(200);
    });

    it('is safe to call without a session', async () => {
      await request(t.app).post('/api/auth/logout').send({}).expect(204);
    });
  });

  it('marks API responses as uncacheable', async () => {
    const res = await request(t.app).get('/api/auth/me');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('Cache-Control: no-store on /api', () => {
  it('is set on auth, student list, dashboard, and opaque 404 responses', async () => {
    const t = await buildTestApp();
    const agent = await t.loginAs('G01');

    const cases = [
      await request(t.app).get('/api/auth/me'),
      await request(t.app).post('/api/auth/request-link').send({ email: EMAILS.G01 }),
      await agent.get('/api/students'),
      await agent.get('/api/students/ST01/dashboard'),
      await agent.get('/api/students/ST03/dashboard'),
      await request(t.app).get('/api/no-such-route'),
    ];

    for (const res of cases) {
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });
});

