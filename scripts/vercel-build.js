// Build step for Vercel: core + web + server, then bring the database schema up to date and load the demo data.
// Migrations need a direct (unpooled) connection; Neon's Vercel integration provides DATABASE_URL_UNPOOLED.
const { execSync } = require('child_process');

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
const direct = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!direct) {
  console.error('DATABASE_URL is not set. Connect a Postgres database (Vercel → Storage → Neon) and redeploy.');
  process.exit(1);
}

run('npm run build:core');
run('npx prisma generate --schema apps/server/prisma/schema.prisma');
run('npm run build -w @pa/server');
run('npm run build -w @pa/web');
run('npx prisma migrate deploy --schema apps/server/prisma/schema.prisma', { DATABASE_URL: direct });
run('npx ts-node --transpile-only apps/server/prisma/seed-demo.ts', { DATABASE_URL: direct });
