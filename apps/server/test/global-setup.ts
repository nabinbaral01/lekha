import { execSync } from 'child_process';
import { rmSync } from 'fs';
import { join } from 'path';
import { startEmbeddedPg } from '../src/dev/embedded-pg';

/** Fresh PostgreSQL (UTF8) for every test run, migrated with the real migrations. */
export default async function () {
  const dir = join(__dirname, '..', '.pgtest');
  rmSync(dir, { recursive: true, force: true });
  const { pg, url } = await startEmbeddedPg(dir, 5545, 'pa_test');
  process.env.DATABASE_URL = url;
  execSync('npx prisma migrate deploy', { cwd: join(__dirname, '..'), env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
  (globalThis as unknown as { __PG__: unknown }).__PG__ = pg;
}
