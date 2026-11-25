import { fileURLToPath } from 'node:url';

const MINUTE_MS = 60 * 1000;

/** Reads configuration from the environment. Tests build their own object. */
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  return {
    port: Number(env.PORT ?? 3001),
    // Seed events are from Oct 19–24, 2026; production uses the real clock.
    asOf: env.AS_OF ?? '2026-10-25T00:00:00Z',
    appOrigin: env.APP_ORIGIN ?? 'http://localhost:5173',
    dataSource: {
      type: env.DATA_SOURCE ?? 'seed',
      seedDir: env.SEED_DIR ?? fileURLToPath(new URL('../../seed', import.meta.url)),
      apiBaseUrl: env.API_BASE_URL,
    },
    tokenTtlMs: 15 * MINUTE_MS,
    sessionTtlMs: 8 * 60 * MINUTE_MS,
    cookie: {
      name: 'sid',
      secure: production,
    },
  };
}
