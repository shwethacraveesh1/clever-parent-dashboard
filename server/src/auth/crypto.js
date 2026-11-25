import { createHash, randomBytes } from 'node:crypto';

/** 256 bits of randomness, URL-safe. */
export function randomToken() {
  return randomBytes(32).toString('base64url');
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
