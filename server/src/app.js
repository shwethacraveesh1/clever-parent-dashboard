import cookieParser from 'cookie-parser';
import express from 'express';
import { createAuditLogger } from './audit/logger.js';
import { authRoutes } from './auth/authRoutes.js';
import { createConsoleMailer } from './auth/mailer.js';
import { requireSession } from './auth/requireSession.js';
import { createSessionStore } from './auth/sessionStore.js';
import { createTokenStore } from './auth/tokenStore.js';
import { studentRoutes } from './routes/studentRoutes.js';

/**
 * Builds the Express app without listening, so tests can drive it with
 * Supertest. `now` drives token and session expiry. `audit` is injectable
 * so tests can assert on access log lines.
 */
export function createApp({
  dataSource,
  config,
  mailer = createConsoleMailer(),
  now = Date.now,
  log = console.error,
  audit = createAuditLogger({ now }),
} = {}) {
  const tokenStore = createTokenStore({ ttlMs: config.tokenTtlMs, now });
  const sessionStore = createSessionStore({ ttlMs: config.sessionTtlMs, now });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  // Every /api response is uncacheable: student dashboards must not linger in
  // shared caches or the browser back-forward cache after logout.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // Writes must be JSON: cross-site HTML forms can't send application/json.
    if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) {
      res.status(415).json({ error: 'json_required' });
      return;
    }
    next();
  });

  app.use('/api/auth', authRoutes({ dataSource, tokenStore, sessionStore, mailer, config, log }));
  app.use(
    '/api/students',
    requireSession({ sessionStore, cookieName: config.cookie.name }),
    studentRoutes({ dataSource, config, audit }),
  );

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((err, req, res, _next) => {
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) log(err);
    res.status(status).json({ error: status === 500 ? 'internal_error' : 'bad_request' });
  });

  return app;
}
