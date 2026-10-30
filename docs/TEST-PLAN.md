# Mavericks Inventory: test plan and real-world scenarios

This document says what is tested, how, and what a business user should try before signing off (UAT). The automated suites run on every push to GitHub (`.github/workflows/ci.yml`).

**Contents**

1. [Test levels](#1-test-levels)
2. [How to run the tests](#2-how-to-run-the-tests)
3. [Automated checks](#3-automated-checks)
4. [UAT: real-world scenarios](#4-uat-real-world-scenarios)
5. [Edge cases and how the app handles them](#5-edge-cases-and-how-the-app-handles-them)
6. [Non-functional checks](#6-non-functional-checks)
7. [Sign-off sheet](#7-sign-off-sheet)

---

## 1. Test levels

| Level | Tool | What it proves | Count |
| --- | --- | --- | --- |
| Static | TypeScript (`npm run typecheck`), ESLint (`npm run lint`) | No type errors, no unsafe patterns | whole codebase |
| Unit | Vitest (`npm test`) | Points rules (cap, milestones, progress, overrides) and role permissions (who may do what, which menu each role sees) | 23 tests |
| End-to-end | Playwright (`npm run e2e`) | Every user flow through a real browser against a real database: stock, approvals, uploads, reports, administration, events, points, rewards, stock counts, the employee portal, the assistant, notifications | 73 checks |
| Single sign-on | Playwright + mock identity provider (`npm run sso-check`) | Code flow with PKCE, state and nonce; account creation and linking; role sync; employee role; refusals; SSO-only mode | 16 checks |
| Deployed site | GitHub Action "Check deployed site" | The same end-to-end checks against a live address | 73 checks |

## 2. How to run the tests

```bash
npm install
npm test                                   # unit tests, no database needed

# end-to-end: a database with demo data and a running app
cp .env.example .env                       # set DATABASE_URL, DIRECT_URL, AUTH_SECRET
npx prisma migrate deploy && npm run db:seed
npm run build && npm start                 # in one terminal
npx playwright install chromium            # once
BASE_URL=http://localhost:3000 npm run e2e # in another terminal
SCREENSHOTS=1 npm run e2e                  # also refreshes docs/screenshots (use a freshly seeded database)
```

SSO checks: see [SETUP-AND-DEPLOYMENT.md §13.7](SETUP-AND-DEPLOYMENT.md#137-try-it-without-azure-mock-provider).

## 3. Automated checks

The end-to-end suite, in order (each line is one check):

**Sign-in and access:** signed-out visitors go to sign-in · wrong password refused · APIs refuse signed-out calls with a structured error · health check · an executive can't open approvals · a manager can't create stock items.

**Stock and distributions:** home page loads · item list filters by low stock · lists open · item page shows ledger and recipients · executive submits a distribution · creator has no approve button · stock unchanged while in review · manager approves and stock drops by exactly the quantity · over-stock is blocked · rejection with remarks and resubmission · two-level approval for new items (level 2 by a different person) · stock inward adds stock.

**Excel:** templates download · stock upload saves valid rows and lists bad ones · the legacy Recipient and Procurement sheets upload without reformatting · error report downloads.

**Drafts, bulk approval, reports, administration:** drafts saved and deleted (kept in the audit trail) · four requests approved at once · all reports open and export to Excel and PDF · a request exports · admin creates a user with a one-time password · forced password change · deactivated user refused · approval rules and master data save · audit log lists events.

**Events, points and rewards:** admin adds an employee · admin adjusts points with a reason (in history) · executive creates an event · pasting IDs marks attendance, credits points, reports unknown IDs and flags milestones · marking twice is skipped · 1,900 + 400 = 2,300 · the 2,000 reward goes onto a distribution with the milestone goodie · approval issues it · removing an attendee reverses exactly their points · admin changes event-type points · leaderboard ranks people.

**Events upload, winners and prizes:** an events sheet creates upcoming events and lists bad rows · the same sheet again creates no duplicates · uploaded events show under Upcoming · a winner gets an Amazon voucher, is marked present and gets bonus points · a runner-up gets a goodie from stock · bonus points credited (1,900 + 400 + 500 = 2,800) · an employee sheet adds and updates people and lists bad rows · a winners sheet records vouchers, goodies and other prizes at once and lists bad rows · a voucher is marked issued with its order reference · a goodie prize goes out through an approved distribution and stock drops by 1 · the employee sees their prizes.

**Stock count and movements:** a count sends only the difference for approval · approval adjusts stock by the difference · the adjustment appears in stock movements · system status shows regions and latency.

**Employee portal and assistant:** one click signs in as the demo employee · employees can't open staff pages · the assistant answers an employee about their own points only · the assistant answers an executive from live stock data · the notification bell lists what needs attention.

**General:** Ctrl+K search · dark mode and phone layout.

## 4. UAT: real-world scenarios

Run these on the demo or UAT site with the demo roles. Tick each one.

| # | Scenario | Who | Steps | Expected |
| --- | --- | --- | --- | --- |
| 1 | Onboarding batch of 40 joiners | Executive, Manager | Upload a distribution sheet of 40 rows (welcome kit, T-shirt by size, bottle). Fix the rows it reports. Submit. Manager approves. | 40 lines on one request; stock drops only after approval; each joiner shows in the item's recipients |
| 2 | Not enough T-shirts in size L | Executive | Record 50 size-L T-shirts when 30 are left | Submission blocked with the item and shortfall named |
| 3 | Approver away for 3 days | Manager | Leave a request unapproved for more than the escalation time | Flagged overdue on Home, in the bell and in Approvals |
| 4 | Big purchase needs two signatures | Executive, Manager, Authority | Admin sets two levels above 100 units. Submit 150 units. | Manager approves level 1, the Authority approves level 2; the same person can't do both |
| 5 | Monthly cycle count finds 2 damaged bottles | Executive, Manager | Stock counts → New count, enter 2 fewer, reason "Damaged", submit, approve | Stock down by 2; movement shows "Count adjustment" with who approved |
| 6 | Hackathon with 120 participants | Executive | Create a Hackathon event; upload the attendance sheet from the registration form | 120 marked, +600 each; new names added as employees; milestones listed |
| 7 | Same sheet uploaded twice | Executive | Upload scenario 6's sheet again | 0 added, 120 "already marked"; nobody's points doubled |
| 8 | Wrong person marked present | Executive | Remove them with a reason | Their 600 points reversed; reason in their history; a due reward below their new total is cancelled |
| 9 | Monthly reward handout | Executive, Manager | Rewards → Due → select 25 people → Create distribution and submit → approve | One request with 25 lines; rewards Issued; goodies off the shelf; employees see "Received" |
| 9a | Hackathon results | Executive, Manager | On the event, add Winner (Amazon ₹5,000), Runner-up (smart watch), Special mention (certificate). Hand the watch out from Event prizes; mark the voucher issued with the Amazon order number | Bonus points credited; watch leaves stock after approval; voucher shows Issued with the reference; finance export lists all three |
| 9b | Next quarter's events | Executive | Upload an events sheet with 15 events, one with a misspelt type | 14 created and listed under Upcoming; the bad row named; a second upload creates nothing |
| 10 | Goodie for 18,000 not decided yet | Executive | Select someone due at 18,000 | Row asks to choose a goodie; can't submit until chosen |
| 11 | Admin changes workshop points from 400 to 450 | Administrator | Edit the event type | New attendance gets 450; past attendance unchanged; change in the audit log |
| 12 | Special recognition | Administrator | Adjust +500 points for an organiser with a reason | Balance and history updated; reward created if a milestone is crossed |
| 13 | Someone hits 20,000 | Administrator | Adjust a person near the cap by more than the gap | Stops at 20,000 with "limited by the cap" in history |
| 14 | New programme year | Administrator | Reset everyone's points (type RESET) | All at 0, cycle +1; old rewards kept; each employee's history shows the reset |
| 15 | Employee checks their progress | Employee | Sign in, open My dashboard and Goodies received | Own points, progress track, rewards and goodies; no menu items for stock or other people |
| 16 | Employee tries to see someone else | Employee | Ask Mav "How many points does Kavin have?"; type `/employees` in the address bar | Mav answers about their own points only; the address redirects to their portal |
| 17 | Manager asks the assistant | Manager | "What's waiting for my approval?" | List of requests waiting for them, with a link to Approvals |
| 18 | New joiner signs in with SSO | (IT) | Sign in with Microsoft as someone with no app role, with `SSO_DEFAULT_ROLE=EMPLOYEE` | Employee portal opens, linked to their employee record |
| 19 | Executive leaves the company | Administrator | Deactivate the user | They can't sign in; their history stays |
| 20 | Audit question: who gave out the smart watches? | Manager | Reports → Distributed stock, filter the item; open the request | Recipients, dates, maker and approver with remarks |

## 5. Edge cases and how the app handles them

| Situation | Behaviour |
| --- | --- |
| Two approvers approve the same request at the same moment | Row lock: one succeeds, the other is told it's already decided |
| Two executives mark attendance for the same person at the same moment | Employee row is locked; both credits apply exactly once per event (unique key) |
| Stock changed between a count and its approval | Only the counted difference is applied, so the other movement isn't lost |
| Approving would take stock below zero | Refused (with the stock guard on), naming the items |
| Excel with merged headers, extra columns, zero-width characters or Excel date numbers | Headers matched by name and common aliases; values cleaned; bad rows reported with row number and reason |
| Points adjustment would go below zero | Stops at 0 |
| Event cancelled after people were marked | Not allowed until attendees are removed (so points are reversed first) |
| Reward draft deleted or its line removed | Reward goes back to Due |
| Demo account password change on the public demo | Refused, so the shared demo keeps working |
| Database unreachable | `/api/health` returns 503 with a clear code; pages show a friendly error |
| Assistant asked about something outside the app | Politely declines |

## 6. Non-functional checks

| Area | Check | Target |
| --- | --- | --- |
| Speed | System status round trip; page load on a laptop over office Wi-Fi | Under 10 ms in the same region; pages under 1 second |
| Security | All changes are server actions that check the role; session cookie is HttpOnly, SameSite=Lax, Secure in production; passwords hashed with bcrypt; login throttled after 5 failures; SSO uses PKCE, state and nonce | As listed |
| Accessibility | Keyboard-only use (Tab, Enter, Esc, Ctrl+K); visible focus ring; labels on every field; reduced-motion respected (3D mascot stops moving) | Usable without a mouse |
| Browsers | Latest Chrome, Edge, Safari, Firefox; phone width 390 px | Layout intact, no horizontal scroll |
| Data integrity | Ledger and points history are insert-only; every change in the audit log with before and after | Nothing editable after the fact |

## 7. Sign-off sheet

| Area | Tested by | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| Stock and distributions | | | | |
| Approvals | | | | |
| Uploads | | | | |
| Events and attendance | | | | |
| Points and rewards | | | | |
| Employee portal | | | | |
| Assistant | | | | |
| Reports | | | | |
| Administration | | | | |
| SSO | | | | |
