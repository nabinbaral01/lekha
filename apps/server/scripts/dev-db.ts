import { join } from 'path';
import { startEmbeddedPg } from '../src/dev/embedded-pg';

// Runs PostgreSQL for development until Ctrl+C.
(async () => {
  const { pg, url } = await startEmbeddedPg(join(__dirname, '..', '.pgdata'), 5544, 'pathibhara');
  console.log(`PostgreSQL running: ${url}`);
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})();
