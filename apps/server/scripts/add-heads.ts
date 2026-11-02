/**
 * Adds any expense heads from SEED_HEADS that an existing installation does not have yet.
 * Goes through the API as the Super Admin, so every addition is in the audit trail.
 * Usage (website running):  npx ts-node --transpile-only scripts/add-heads.ts <admin-username> <password>
 */
import { SEED_HEADS } from '../src/seed/seed';

const BASE = process.env.API ?? 'http://localhost:3000/api';

(async () => {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) throw new Error('usage: add-heads.ts <admin-username> <password>');
  const login = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const { token } = (await login.json()) as { token: string };
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const existing = (await (await fetch(`${BASE}/accounts?kind=EXPENSE`, { headers: auth })).json()) as { code: string; activityNo: string }[];
  const have = new Set(existing.map((a) => `${a.code}/${a.activityNo}`));
  let added = 0;
  for (const [i, h] of SEED_HEADS.entries()) {
    if (have.has(`${h.code}/${h.act}`)) continue;
    const r = await fetch(`${BASE}/accounts`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ kind: 'EXPENSE', code: h.code, activityNo: h.act, nameNe: h.ne, nameEn: h.en, nature: h.nature, folioNo: String(i + 1), sortOrder: i + 1 }),
    });
    if (!r.ok) throw new Error(`${h.code}/${h.act} ${h.ne}: ${r.status} ${await r.text()}`);
    console.log(`+ ${h.nature === 'CAPITAL' ? 'पूँजीगत' : 'चालु   '}  ${h.code}/${h.act}  ${h.ne}`);
    added++;
  }
  console.log(`${added} head(s) added, ${SEED_HEADS.length - added} already present.`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
