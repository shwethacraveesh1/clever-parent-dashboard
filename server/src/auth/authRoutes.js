import { Router } from 'express';
import { requireSession } from './requireSession.js';

export const LINK_SENT_MESSAGE = 'If that email is on file, we sent a sign-in link.';
const MAX_EMAIL_LENGTH = 254;

/**
 * POST /api/auth/request-link  { email }  → 202, same body for known and unknown emails
 * POST /api/auth/verify        { token }  → 200 + session cookie, or 401
 * POST /api/auth/logout                   → 204, destroys the server session
 * GET  /api/auth/me                       → { guardian: { name, email } }
 *
 * The emailed link carries the token in the URL fragment, which browsers
 * don't send to servers or in Referer headers. The client page reads it and
 * POSTs it to /verify, so link-preview bots that only GET can't use it up.
 */
export function authRoutes({ dataSource, tokenStore, sessionStore, mailer, config, log = console.error }) {
  const router = Router();
  const { name: cookieName, secure } = config.cookie;

  router.post('/request-link', async (req, res) => {
    const email = req.body?.email;
    if (typeof email !== 'string' || email.trim() === '' || email.length > MAX_EMAIL_LENGTH) {
      res.status(400).json({ error: 'invalid_email' });
      return;
    }

    const guardian = await dataSource.getGuardianByEmail(email);
    if (guardian) {
      const token = tokenStore.issue(guardian.id);
      const url = `${config.appOrigin}/verify#token=${encodeURIComponent(token)}`;
      try {
        await mailer.sendMagicLink(guardian.email, url);
      } catch (err) {
        log('Failed to send magic link', err);
      }
    }
    res.status(202).json({ message: LINK_SENT_MESSAGE });
  });

  router.post('/verify', async (req, res) => {
    const guardianId = tokenStore.consume(req.body?.token);
    const guardian = guardianId && (await dataSource.getGuardian(guardianId));
    if (!guardian) {
      res.status(401).json({ error: 'invalid_or_expired_link' });
      return;
    }

    sessionStore.destroy(req.cookies?.[cookieName]);
    const sessionId = sessionStore.create(guardian.id);
    res.cookie(cookieName, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: config.sessionTtlMs,
    });
    res.json({ guardian: publicGuardian(guardian) });
  });

  router.post('/logout', (req, res) => {
    sessionStore.destroy(req.cookies?.[cookieName]);
    res.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
    res.status(204).end();
  });

  router.get('/me', requireSession({ sessionStore, cookieName }), async (req, res) => {
    const guardian = await dataSource.getGuardian(req.guardianId);
    if (!guardian) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    res.json({ guardian: publicGuardian(guardian) });
  });

  return router;
}

function publicGuardian(guardian) {
  return { name: guardian.name, email: guardian.email };
}
