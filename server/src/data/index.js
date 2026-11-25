import { ApiDataSource } from './ApiDataSource.js';
import { SeedDataSource } from './SeedDataSource.js';

export { DataSource } from './DataSource.js';
export { SeedDataSource, ApiDataSource };

/**
 * @param {{ type?: 'seed' | 'api', seedDir?: string, apiBaseUrl?: string }} options
 * @returns {Promise<import('./DataSource.js').DataSource>}
 */
export async function createDataSource({ type = 'seed', seedDir, apiBaseUrl } = {}) {
  switch (type) {
    case 'seed':
      if (!seedDir) throw new Error('createDataSource: seedDir is required for type "seed"');
      return SeedDataSource.load(seedDir);
    case 'api':
      return new ApiDataSource({ baseUrl: apiBaseUrl });
    default:
      throw new Error(`createDataSource: unknown type "${type}"`);
  }
}
