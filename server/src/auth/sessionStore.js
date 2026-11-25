import { randomToken, sha256 } from './crypto.js';

/**
 * Server-side sessions with a fixed (non-sliding) expiry. A session holds
 * only the guardian ID: links are re-read on every request so revocation is
 * immediate. Session IDs are stored hashed, like magic-link tokens.
 *
 * In memory: sessions are lost on restart and not shared across instances.
 *
 * @param {{ ttlMs: number, now?: () => number }} options
 */
export function createSessionStore({ ttlMs, now = Date.now }) {
  const sessions = new Map();

  return {
    /** @returns {string} the session ID for the cookie */
    create(guardianId) {
      const sessionId = randomToken();
      sessions.set(sha256(sessionId), { guardianId, expiresAt: now() + ttlMs });
      return sessionId;
    },

    /** @returns {{ guardianId: string } | null} */
    get(sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return null;
      const hash = sha256(sessionId);
      const entry = sessions.get(hash);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        sessions.delete(hash);
        return null;
      }
      return { guardianId: entry.guardianId };
    },

    destroy(sessionId) {
      if (typeof sessionId === 'string') sessions.delete(sha256(sessionId));
    },
  };
}
