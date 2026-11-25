import { fileURLToPath } from 'node:url';
import { SeedDataSource } from '../../src/data/SeedDataSource.js';

export const SEED_DIR = fileURLToPath(new URL('../../../seed', import.meta.url));

export function loadSeed() {
  return SeedDataSource.load(SEED_DIR);
}
