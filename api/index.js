// Vercel serverless entry: the whole NestJS API runs as one function (all /api/* requests are rewritten here).
// The app is created once per warm instance and reused across requests.

// Neon's pooled connection runs through PgBouncer: tell Prisma, and keep each instance to a small pool.
const url = process.env.DATABASE_URL;
if (url && url.includes('-pooler') && !url.includes('pgbouncer=')) {
  process.env.DATABASE_URL = `${url}${url.includes('?') ? '&' : '?'}pgbouncer=true&connection_limit=3`;
}

const { createApp } = require('../apps/server/dist/bootstrap');

let server;
async function getServer() {
  if (!server) {
    const app = await createApp();
    await app.init();
    server = app.getHttpAdapter().getInstance();
  }
  return server;
}

module.exports = async (req, res) => {
  const handle = await getServer();
  return handle(req, res);
};
