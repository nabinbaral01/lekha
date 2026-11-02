import { createConnection } from 'net';
import { existsSync } from 'fs';
import { join } from 'path';
import { createApp } from './bootstrap';

// Load apps/server/.env before anything reads process.env (Prisma would otherwise load it lazily).
const envFile = join(__dirname, '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const portOpen = (port: number) =>
  new Promise<boolean>((done) => {
    const s = createConnection({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), done(true)));
    s.once('error', () => done(false));
  });

/**
 * Single-PC / demo mode (EMBEDDED_PG=1 in .env): the website starts its own PostgreSQL, so there is
 * one process and no separate database window to close by accident. Production uses a normal
 * PostgreSQL service and leaves EMBEDDED_PG unset.
 */
async function ensureEmbeddedDb() {
  if (process.env.EMBEDDED_PG !== '1') return;
  const url = new URL(process.env.DATABASE_URL ?? '');
  const port = Number(url.port || 5432);
  // Dev-only dependency, loaded only in this mode.
  const { startEmbeddedPg } = await import('./dev/embedded-pg');
  let pg: { stop: () => Promise<void> } | null = null;
  let starting = false;
  const boot = async () => {
    if (starting || (await portOpen(port))) return; // running already (ours, or started by db:dev)
    starting = true;
    try {
      pg = (await startEmbeddedPg(join(__dirname, '..', '.pgdata'), port, url.pathname.slice(1))).pg;
      console.log(`Embedded PostgreSQL started on port ${port}`);
    } catch (e) {
      console.error('Could not start embedded PostgreSQL:', e instanceof Error ? e.message : e);
    } finally {
      starting = false;
    }
  };
  await boot();
  // Self-healing: if the database is stopped (window closed, crash), bring it back.
  setInterval(() => void boot(), 10000).unref();
  const stop = async () => {
    await pg?.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

(async () => {
  await ensureEmbeddedDb();
  const app = await createApp();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0'); // reachable from other PCs on the office LAN
  console.log(`Pathibhara Accounts API on http://0.0.0.0:${port}/api`);
})();
