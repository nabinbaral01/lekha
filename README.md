# पाथीभरा लेखा प्रणाली — Pathibhara Accounting System

Government cash-basis accounting (म.ले.प. Form 203, Bank-Cash Book, Budget Statement, TDS) for
पाथीभरा क्षेत्र विकास समिति, ताप्लेजुङ. One voucher entry drives every book: books are always
computed from approved voucher lines, never typed twice and never stored separately.

## Layout

| Path | What |
|---|---|
| `packages/core` | Shared accounting core: integer-paisa money, TDS engine, Bikram Sambat calendar, amount-in-words, voucher rules. Used by both server and browser so previews match the server exactly. |
| `apps/server` | NestJS + Prisma + PostgreSQL API. Also serves the built web app. |
| `apps/web` | React + TypeScript + Tailwind UI (नेपाली / English, light/dark, offline fonts). |

## Development

Requires Node.js 22+ (tested on 24). No PostgreSQL install is needed for development; `embedded-postgres` runs a real PostgreSQL.

```bash
npm install
npm run build:core
copy apps\server\.env.example apps\server\.env   # first time only (cp on macOS/Linux)
cd apps/server
npm run db:dev            # terminal 1: starts PostgreSQL on :5544 (UTF8)
npx prisma migrate deploy
npm run db:seed:demo      # DEMO data: admin/Admin12345, lekha/Lekha12345, auditor/Audit12345
npm run start:dev         # terminal 2: API on :3000
cd ../web && npm run dev  # terminal 3: UI on :5173 (proxies /api)
```

Tests (fresh database every run):

```bash
npm test                  # from repo root: core unit tests + server end-to-end acceptance tests
```

## Office installation (LAN)

1. On the server PC install PostgreSQL 16+ and create the database **with UTF8 encoding**
   (`CREATE DATABASE pathibhara ENCODING 'UTF8' TEMPLATE template0;`). The server refuses to start on a non-UTF8 database, because Devanagari text would be corrupted.
2. Set `apps/server/.env`: `DATABASE_URL=postgresql://USER:PASS@localhost:5432/pathibhara`.
3. `npm install && npm run build:core && npm run build -w @pa/web && npm run build -w @pa/server`
4. `cd apps/server && npx prisma migrate deploy && npm run db:seed` (prints a one-time Super Admin password).
5. `npm start` → the other office PCs open `http://<server-pc-name>:3000`.

## Public demo link (cloud, Render)

`render.yaml` deploys the whole system (website + PostgreSQL) to Render's Singapore region, giving a permanent link such as `https://pathibhara-accounts.onrender.com` that works when the office PC is off.

1. Push this repository to GitHub (private repository is fine).
2. On https://render.com sign in with GitHub → **New → Blueprint** → choose the repository → Render reads `render.yaml`.
3. Type the three passwords it asks for (`DEMO_ADMIN_PASSWORD`, `DEMO_LEKHA_PASSWORD`, `DEMO_AUDITOR_PASSWORD`; ≥ 8 characters, letters and digits) → **Apply**.
4. After the first build (~5–10 min) the link is shown at the top of the service page. Users: `admin`, `lekha`, `auditor` with those passwords.

Free plan limits: the site sleeps after ~15 minutes without visitors (next visit takes about a minute to wake), and the free database expires after 30 days. For real office accounts use the LAN installation above or a paid plan.

## Accounting rules enforced (server-side, re-validated on every save)

- Money is BIGINT paisa end-to-end; exact decimal strings over JSON; no floating point anywhere.
- Dr = Cr on every voucher (also a DB CHECK that amounts are positive and gross − TDS = net).
- Budget overspend blocked; Super Admin may override with a written reason (logged).
- Shared bank account can never go negative (checked across all 4 funds).
- Voucher numbers: assigned on approval, sequential per fund + fiscal year, gap-free, approvals in date order. The starting number can be set once when moving from paper books.
- Capital heads only in पूँजीगत funds, recurrent heads only in चालु funds.
- Dates must be in an open fiscal year and in an unlocked month.
- PAN must be 9 digits; bank account required for EFT; VAT may be ticked only for VAT-registered payees; duplicate bill/amount needs explicit confirmation; TDS override/exemption needs a reason.
- Audit log is append-only (DB trigger blocks UPDATE/DELETE/TRUNCATE) and hash-chained (tamper check in the UI).

## Status (delivery plan §13)

| Phase | Status |
|---|---|
| 1. Schema, master data, roles/login, audit trail | Done |
| 2. Home navigation (आन्तरिक/अनुदान → पूँजीगत/चालु) | Done |
| 3. Voucher entry (Form 203) + tax engine + approval workflow | Done |
| 4. Bank-Cash Book + Budget Statement + print | Done (browser print / Save as PDF; Excel export pending) |
| 5. Advance (पेस्की), TDS register by payee & IRD monthly report, bank reconciliation, trial balance, other reports | TDS pending + कर जम्मा done; others pending |
| 6. Dashboard | Per-fund and home dashboards done; charts pending |
| 7. Bilingual polish, backup/restore, licensing | Bilingual done; backup/restore and licensing pending |
| 8. Acceptance tests | All client figures in §12 pass |

**Must be verified before go-live:** expense-head economic codes and activity numbers (seeded provisionally) and all TDS rates (verify with a Chartered Accountant).
