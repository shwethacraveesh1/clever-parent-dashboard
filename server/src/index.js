import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDataSource } from './data/index.js';

const config = loadConfig();
const dataSource = await createDataSource(config.dataSource);
const app = createApp({ dataSource, config });

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port} (AS_OF ${config.asOf})`);
});
