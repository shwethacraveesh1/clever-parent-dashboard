import { DataSource } from './DataSource.js';

/**
 * Placeholder for a real backend (Clever API or a district SIS feed).
 * It implements the same contract as SeedDataSource; until it exists, every
 * method throws via the DataSource base class.
 */
export class ApiDataSource extends DataSource {
  /** @param {{ baseUrl: string }} options */
  constructor({ baseUrl } = {}) {
    super();
    if (!baseUrl) throw new Error('ApiDataSource requires a baseUrl');
    this.baseUrl = baseUrl;
  }
}
