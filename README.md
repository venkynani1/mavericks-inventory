# Mavericks Inventory

Approval-driven stock management for Hexaware Mavericks goodies — T-shirts, welcome kits, smart watches, bottles and event merchandise. It replaces the "Stock count / Recipient / Procurement" Excel trackers with one system where nothing leaves the shelf until a manager approves it, and every movement is on an immutable ledger.

Built from the *Mavericks Inventory BRD* and the two reference trackers (`Updated stock details - Sep 25.xlsx`, `Mavericks inventory application - Tracker reference - Apr 26.xlsx`).

## What it does

| Area | Highlights |
| --- | --- |
| **Stock master** | Add items one at a time or upload Excel (up to 50,000 rows). Mandatory-column, data-type and duplicate-code checks; valid rows become a **Draft** request, invalid rows come back as a downloadable error report. Legacy "Stock count" sheets are recognised as-is. |
| **Distributions** | Single entry form with live availability, or bulk upload of the legacy "Recipient" sheet (Date of Delivery, Emp ID, Name, Base Location, Category, POC, Product Details). |
| **Stock inward** | Replenish existing items (PO / invoice reference), also approval-gated. |
| **Maker–checker** | Draft → Submitted → Approved / Rejected. Level 1 (Manager or Management Authority) is mandatory; level 2 (Management Authority) is configurable, optionally only above a unit threshold. Creators can't approve their own requests, and one person can't approve both levels. Rejections need remarks and return the request to the executive for correction. |
| **Stock adjustment** | Quantities change **only at final approval**, inside one database transaction with a row lock and a conditional decrement, so two approvals can't oversell. Negative stock is blocked (configurable). |
| **Audit** | Immutable approval history per request, a stock movement ledger per item, and a data-change log with before/after values for every write, sign-in and export. No hard deletes of transactional data. |
| **Reports** | Current Stock Availability, Distributed Stock, Pending Approval (with overdue flag), Approval History, Stock Movement Ledger — each filterable and exportable to **Excel** and **PDF**. |
| **Dashboard** | On-hand stock, 30-day handouts, approvals waiting, low stock, weekly trend, where stock went by purpose, and **size runs** for apparel and kits so you can plan the next onboarding batch. |
| **Admin** | Users and roles (one-time passwords, forced change on first sign-in), approval rules, master data (categories, purposes, locations, units). |

### Roles

| Role | Can |
| --- | --- |
| Executive | Upload/add stock items, record distributions and stock inward, submit, edit drafts and returned requests |
| Manager | Approve or reject at level 1, view reports and audit trail |
| Management Authority | Approve or reject at level 1 or 2 (final authority) |
| System Administrator | Users, roles, approval rules, master data, audit logs, override details of approved items |

## Tech stack

- **Next.js 15** (App Router, Server Components, Server Actions) + **TypeScript**
- **PostgreSQL** via **Prisma 6** — portable across Neon/Vercel Postgres, AWS RDS/Aurora and Azure Database for PostgreSQL
- **shadcn/ui** (Radix) + **Tailwind CSS v4**, Recharts, lucide icons, light and dark themes
- **ExcelJS** for templates, uploads and exports; **jsPDF** for PDF reports
- Auth: bcrypt password hashes + signed, httpOnly JWT session cookie (`jose`), role checks on every page, action and API route

## Run locally

Requirements: Node 20+, PostgreSQL 14+ (or Docker).

```bash
cp .env.example .env            # set DATABASE_URL, DIRECT_URL and AUTH_SECRET
npm install
npx prisma migrate deploy       # create tables
npm run db:seed                 # load the Sep 25 stock list + demo data
npm run dev                     # http://localhost:3000
```

Or the whole stack in containers: `docker compose up --build`.

### Demo accounts

All use the password in `SEED_PASSWORD` (default `Mavericks@2026`). Set `DEMO_MODE="true"` to show them on the sign-in page.

| Email | Role |
| --- | --- |
| executive@mavericks.demo, executive2@mavericks.demo | Executive |
| manager@mavericks.demo | Manager |
| authority@mavericks.demo | Management Authority |
| admin@mavericks.demo | System Administrator |

**Change or deactivate these accounts before going live.**

### About the seed data

- The 43 items and their procured / distributed / available quantities come from *Updated stock details – Sep 25*. Stock balances reconcile exactly with the ledger.
- Distribution history is regenerated to match each item's distributed quantity, with **generated recipient names and IDs** — no real employee data is stored in this repository. To bring in real history, upload the original Recipient sheet on **Distributions → Upload Excel**.
- The Sep 25 sheet shows *Plastic Pin Badges* as 1,000 procured, 0 available and none distributed. That gap can't be explained from the file, so the seed loads the 1,000 procured; reconcile it in the app.
- New items from the *Apr 26* tracker (RGB headphones, wireless mouse, laptop stickers, black coffee mug) are seeded as a stock-master request waiting for approval.

## Deploy

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for step-by-step guides:

- **Vercel + Neon** (fastest)
- **AWS** — App Runner or ECS Fargate + RDS PostgreSQL
- **Azure** — App Service for Containers or Container Apps + Azure Database for PostgreSQL

BRD-to-implementation traceability is in **[docs/BRD-TRACEABILITY.md](docs/BRD-TRACEABILITY.md)**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run vercel-build` | Generate client, apply migrations, build (used by Vercel) |
| `npm run db:migrate` | Create a new migration after editing `prisma/schema.prisma` |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Load seed data into an empty database |
| `npm run db:reset` | Drop, re-migrate and re-seed (development only) |
| `npm run typecheck` / `npm run lint` | Static checks |

## Project layout

```
prisma/                 schema, migrations, seed + Sep 25 stock data
src/app/(app)/          signed-in pages (dashboard, stock, distributions, approvals, reports, admin)
src/app/api/            uploads, templates, report exports, request export, health check
src/app/actions/        server actions (stock, requests/workflow, admin, auth, search)
src/lib/server/         workflow engine, Excel import/export, reports, PDF, session, audit
src/components/app/     product components (size runs, stock gauge, approval queue, upload flow…)
src/components/ui/      shadcn/ui primitives
```
