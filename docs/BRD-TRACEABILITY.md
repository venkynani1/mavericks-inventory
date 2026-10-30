# BRD traceability

How each requirement in the *Mavericks Inventory BRD* is met.

| BRD § | Requirement | Where it lives |
| --- | --- | --- |
| 3.1, 6.1 | Stock master upload via predefined Excel template | Stock → Upload Excel · `src/lib/server/imports.ts` (`importStockMaster`, `templateWorkbook`) |
| 6.1 | Mandatory column, data type and duplicate stock code checks | `importStockMaster` — missing columns stop the upload; per-row type, range and duplicate checks (within the file and against the database) |
| 6.1 | Valid records saved in Draft; invalid rejected with downloadable error report | Valid rows → `STOCK_MASTER` request in `DRAFT`; `UploadBatch.errors` → `GET /api/upload-errors/[id]` (.xlsx) |
| 6.1 | Key attributes: stock code (unique), name, category, unit, opening qty, location | `StockItem` in `prisma/schema.prisma` (`code @unique`) |
| 6.2 | Single item creation, update, soft delete, view available qty | Stock → Add item / Edit / Remove · `src/app/actions/stock.ts` |
| 6.2 | Prevent deletion of stock with transaction history | `deleteStockItem` refuses when distribution or inward lines exist |
| 6.3 | Single and bulk distribution entry capturing item, qty, date, recipient/location, purpose | Distributions → Record / Upload Excel · `DistributionLine` |
| 6.3 | Status flow Draft → Submitted → Approved / Rejected | `RequestStatus` enum · `src/lib/server/workflow.ts` |
| 6.4 | Minimum one approval level, optional configurable second level | Admin → Approval rules (`approvalLevels`, `level2Threshold`) · `levelsFor()` |
| 6.4 | Approve; reject with mandatory remarks; rejected returns to executive | `approveRequest`, `rejectRequest` (remarks required); editable again in `REJECTED` |
| 6.4 | Strict maker–checker separation | Creator can't approve or reject; approvers can't create requests; same person can't approve two levels; role per level (`rolesForLevel`) |
| 6.5 | Stock updates only after final approval; rejection has no impact | `postToStock()` runs only at the final level, in the approval transaction |
| 6.5 | Prevent distribution exceeding available stock (configurable) | `preventNegativeStock` — checked at submit and again at approval with a conditional `UPDATE … WHERE availableQty >= qty` under a row lock |
| 6.6 | Edit distribution: Draft, Rejected · Delete: Draft only · Edit master: Draft / admin override · Qty only via approved transaction | `loadEditableRequest`, `cancelRequest`, `updateStockItem` (admin override audited), quantities never editable on approved items |
| 7 | Created / submitted / approved-by, dates, remarks, full approval history | `ApprovalEvent` (insert-only) shown as a timeline on every request |
| 7 | Stock movement ledger per item | `LedgerEntry` with running balance · item page and Ledger report |
| 7, 9.4 | No hard deletes of transactional data; complete change logs | Drafts are *cancelled*, items *deactivated*; `AuditLog` stores before/after JSON for every write |
| 8 | Current Stock Availability, Distributed Stock, Pending Approval, Approval History, Stock Movement Ledger | Reports page · `src/lib/server/reports.ts` |
| 8 | Export to Excel and PDF | `GET /api/reports/[report]?format=xlsx|pdf` |
| 9.1 | RBAC, segregation of duties, secure uploads, controlled audit access | `src/lib/roles.ts` permission matrix; checks in every page, action and route; uploads limited to signed .xlsx ZIP files ≤15 MB |
| 9.2 | Excel uploads up to 50,000 rows | `MAX_ROWS = 50_000`, batched `createMany` in chunks of 5,000 |
| 9.2 | Approval actions within 3 seconds | Single transaction per approval with aggregated per-item updates (one `UPDATE` per item, not per line) |
| 9.3 | 99.5% uptime | Stateless app + managed PostgreSQL; `/api/health` for load balancers; multi-instance guidance in SETUP-AND-DEPLOYMENT.md |
| 11 | Approval delays → escalation | `escalationHours` flags overdue requests on the dashboard, approval queue and Pending Approval report |

## Beyond the BRD

- Stock inward requests (replenishing existing items) with the same approval flow.
- Legacy tracker compatibility: the existing Stock count, Recipient and Procurement sheets upload without reformatting.
- Size-run view for apparel and welcome kits.
- Bulk approval from the queue, with per-request stock checks.
- Global search (Ctrl K) across items and requests.
- Light and dark themes, keyboard navigation, mobile layout.
- Production start without demo accounts: the first administrator is created from a one-time bootstrap sign-in, and one-time passwords must be replaced before anything else.
- Automated tests: 62 end-to-end checks in a real browser, 23 unit tests and 16 SSO checks, run by GitHub Actions on every push.
- Illustrated user guide and a step-by-step setup and deployment guide for Vercel, AWS, Azure and self-hosting.
- Company single sign-on (Microsoft Entra ID / any OpenID Connect provider) with role mapping from app roles, SSO-only mode and an administrator fallback; tested against a bundled mock provider.
- Vercel deployment that creates the database tables and optional demo data during the build, plus a GitHub workflow that runs the full test against a live site.
- Employee engagement: events with points per event type (admin-configurable), attendance by paste or Excel, points credited instantly with a full history, a goodie at every 2,000 points up to 20,000 (step and cap configurable), rewards fulfilled through the approved distribution flow, adjust and reset with reasons, leaderboard.
- Employee portal (role Employee, also via SSO `Inventory.Employee` or `SSO_DEFAULT_ROLE`): own points, progress, rewards, goodies and events only.
- "Ask Mav" assistant limited to the user's role, with built-in answers or Claude.
- Enterprise inventory views: reserved and free-to-promise stock, days of cover, stock movements ledger page, cycle counts with approval.
- Notifications bell, system status page with region and latency diagnostics, one-click demo sign-in, 3D mascot.
