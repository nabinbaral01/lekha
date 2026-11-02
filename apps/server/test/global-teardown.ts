export default async function () {
  const pg = (globalThis as unknown as { __PG__?: { stop: () => Promise<void> } }).__PG__;
  await pg?.stop();
}
