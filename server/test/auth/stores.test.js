import { describe, expect, it } from 'vitest';
import { createSessionStore } from '../../src/auth/sessionStore.js';
import { createTokenStore } from '../../src/auth/tokenStore.js';

function fakeClock() {
  const clock = { t: 0 };
  clock.now = () => clock.t;
  return clock;
}

describe('tokenStore', () => {
  it('issues random URL-safe tokens and redeems each once', () => {
    const store = createTokenStore({ ttlMs: 1000, now: fakeClock().now });
    const a = store.issue('G01');
    const b = store.issue('G01');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.consume(a)).toBe('G01');
    expect(store.consume(a)).toBeNull();
    expect(store.consume(b)).toBe('G01');
  });

  it('expires at exactly ttlMs, and an expired token stays dead', () => {
    const clock = fakeClock();
    const store = createTokenStore({ ttlMs: 1000, now: clock.now });
    const early = store.issue('G01');
    const late = store.issue('G01');
    clock.t = 999;
    expect(store.consume(early)).toBe('G01');
    clock.t = 1000;
    expect(store.consume(late)).toBeNull();
    clock.t = 0;
    expect(store.consume(late)).toBeNull();
  });

  it('rejects unknown and non-string tokens', () => {
    const store = createTokenStore({ ttlMs: 1000 });
    expect(store.consume('nope')).toBeNull();
    expect(store.consume(undefined)).toBeNull();
    expect(store.consume({ token: 'x' })).toBeNull();
    expect(store.consume('')).toBeNull();
  });
});

describe('sessionStore', () => {
  it('returns only the guardian ID for a live session', () => {
    const store = createSessionStore({ ttlMs: 1000, now: fakeClock().now });
    const sid = store.create('G01');
    expect(store.get(sid)).toEqual({ guardianId: 'G01' });
  });

  it('expires sessions at a fixed time (not sliding)', () => {
    const clock = fakeClock();
    const store = createSessionStore({ ttlMs: 1000, now: clock.now });
    const sid = store.create('G01');
    clock.t = 999;
    expect(store.get(sid)).not.toBeNull();
    clock.t = 1000;
    expect(store.get(sid)).toBeNull();
  });

  it('destroy removes the session server-side', () => {
    const store = createSessionStore({ ttlMs: 1000 });
    const sid = store.create('G01');
    store.destroy(sid);
    expect(store.get(sid)).toBeNull();
  });

  it('rejects unknown and non-string session IDs', () => {
    const store = createSessionStore({ ttlMs: 1000 });
    expect(store.get('forged')).toBeNull();
    expect(store.get(undefined)).toBeNull();
    expect(() => store.destroy(undefined)).not.toThrow();
  });
});
