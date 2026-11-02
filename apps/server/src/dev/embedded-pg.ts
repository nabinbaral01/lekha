// Dev/test-only dependency; its package exposes ESM-only type exports, so types are not resolved under CommonJS.
// @ts-ignore
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'fs';
import { join } from 'path';

/** Starts a real PostgreSQL from the embedded-postgres binaries (dev/test only; production uses a normal PostgreSQL service). */
export async function startEmbeddedPg(dir: string, port: number, database: string) {
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} });
  if (!existsSync(join(dir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(database);
  } catch {
    /* already exists */
  }
  return { pg, url: `postgresql://postgres:postgres@localhost:${port}/${database}` };
}
