import { randomToken, sha256 } from './crypto.js';

/**
 * Magic-link tokens: random, single-use, short-lived. Only the SHA-256 hash
 * is stored, so a leaked store can't be replayed as login links.
 *
 * In memory: tokens are lost on restart and not shared across instances.
 *
 * @param {{ ttlMs: number, now?: () => number }} options
 */
export function createTokenStore({ ttlMs, now = Date.now }) {
  const tokens = new Map();

  function prune() {
    const t = now();
    for (const [hash, entry] of tokens) {
      if (entry.expiresAt <= t) tokens.delete(hash);
    }
  }

  return {
    /** @returns {string} the plaintext token, to be emailed and never stored */
    issue(guardianId) {
      prune();
      const token = randomToken();
      tokens.set(sha256(token), { guardianId, expiresAt: now() + ttlMs });
      return token;
    },

    /**
     * Deletes the token whatever the outcome, so it can't be tried twice.
     * @returns {string | null} the guardian ID, or null if unknown, used or expired
     */
    consume(token) {
      if (typeof token !== 'string' || token === '') return null;
      const hash = sha256(token);
      const entry = tokens.get(hash);
      tokens.delete(hash);
      if (!entry || entry.expiresAt <= now()) return null;
      return entry.guardianId;
    },
  };
}
