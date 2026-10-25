# Mavericks Inventory: user guide

Mavericks Inventory keeps track of the goodies, welcome kits, T-shirts, bottles and gadgets the Mavericks team hands out. It replaces the old Excel trackers. You record what came in and who received what, and a manager approves it before the stock count changes, so the numbers always match the shelf.

This guide walks through every screen and button. You don't need any technical knowledge. The pictures come from the demo version, so the names and numbers are examples.

**Contents**

- [How it works in one picture](#how-it-works-in-one-picture)
- [Who can do what](#who-can-do-what)
- [Signing in](#signing-in)
- [Finding your way around](#finding-your-way-around)
- [For Executives](#for-executives): [look up stock](#look-up-stock) · [record a distribution](#record-a-distribution) · [upload a distribution sheet](#upload-a-distribution-sheet) · [add new items](#add-new-stock-items) · [upload a stock sheet](#upload-a-stock-sheet) · [record stock inward](#record-stock-inward) · [drafts and returned requests](#drafts-and-returned-requests)
- [For Managers and the Management Authority](#for-managers-and-the-management-authority): [the approval queue](#the-approval-queue) · [approve](#approve-a-request) · [return with remarks](#return-a-request) · [two-level approval](#two-level-approval) · [approve several at once](#approve-several-at-once)
- [Reports](#reports)
- [For System Administrators](#for-system-administrators): [users](#add-and-manage-users) · [approval rules](#approval-rules) · [master data](#master-data) · [audit log](#audit-log)
- [Your profile and password](#your-profile-and-password)
- [Questions people ask](#questions-people-ask)

---

## How it works in one picture

Every change to stock goes through a **request**. A request moves through these stages:

```mermaid
flowchart LR
  D[Draft<br/>being prepared] -->|Executive submits| R[In review]
  R -->|Approver approves<br/>final level| A[Approved<br/>stock updated]
  R -->|Approver returns<br/>with remarks| X[Returned]
  X -->|Executive fixes<br/>and resubmits| R
  D -->|Executive deletes| Del[Deleted]
```

There are three kinds of request:

| Request | Used for | What approval does to stock |
| --- | --- | --- |
| **Distribution** | Goodies handed to people (onboarding, events, interns…) | Takes the quantities **off** the shelf |
| **Stock inward** | A delivery of more of something you already stock | **Adds** the quantities |
| **New stock items** | Products you've never stocked before | Creates the items with their opening quantity |

**Nothing changes in stock until the final approval.** A draft or a request in review doesn't touch the numbers.

---

## Who can do what

| Role | What they do |
| --- | --- |
| **Executive** | Adds stock items, records distributions and stock inward (one at a time or by uploading Excel), submits them, and fixes anything an approver returns |
| **Manager** | Approves or returns requests (level 1). Views reports and the audit log |
| **Management Authority** | Approves or returns requests at level 1 or level 2 (the final say when two levels are switched on) |
| **System Administrator** | Adds users and sets roles, sets the approval rules, manages the lists people pick from, views the audit log |

Two safety rules apply to everyone:

- **Nobody approves their own request.** The person who created it never sees an Approve button on it.
- **When two levels are needed, they're signed by two different people.**

---

## Signing in

![Sign-in page](screenshots/01-sign-in.png)

1. Open the address your administrator gave you.
2. Enter your **work email** and **password**, then select **Sign in**.

If your company has switched on single sign-on, the page shows **Sign in with Microsoft**. Select it and sign in with your normal Hexaware account; you don't need a separate password. If it says you don't have access yet, ask the administrator to give you a role.

- New users get a **one-time password** from the administrator. The first time you sign in you'll be asked to choose your own (see [Your profile and password](#your-profile-and-password)).
- After 5 wrong passwords the account waits 5 minutes before you can try again.
- Forgot your password? Ask a System Administrator to reset it; you'll get a new one-time password.

---

## Finding your way around

![Overview page](screenshots/02-overview.png)

**The menu on the left** takes you to each area. What you see depends on your role. The panel button at the top, next to the search box, collapses it to icons.

**Overview** is the first page after sign-in:

- **Yellow banner:** requests waiting for you (approvers) or drafts you haven't finished (executives). Select it to jump straight there.
- **On hand / Handed out / Waiting for approval / Low or out of stock:** today's key numbers.
- **Units handed out per week:** approved handovers over the last 12 weeks.
- **Where stock went:** which programmes or events used the most stock.
- **Size runs** (scroll down): every T-shirt and welcome-kit size side by side. The number is what's left; the shaded height shows the share of the original stock still on the shelf. A yellow outline means a size is low, red means it's gone. Select a size to open it.
- **Needs restocking** and **Recent decisions** are further down.

![Overview, full page](screenshots/02b-overview-full.png)

**Search (top bar).** Select the search box or press **Ctrl + K** and type part of an item name, a stock code or a request number. Select a result to open it.

![Search](screenshots/34-search.png)

**Light or dark.** The moon/sun button at the top right switches the colour scheme.

![Dark mode](screenshots/36-dark-mode.png)

**On a phone,** the menu opens from the panel button at the top left, and tables show the most important columns.

![Phone layout](screenshots/37-phone.png)

**Account menu** (your name, top right): **Profile and password** and **Sign out**.

---

## For Executives

### Look up stock

Select **Stock** in the menu.

![Stock list](screenshots/03-stock-list.png)

- Each row shows the item, its category, its variant (size, colour, brand) and **On the shelf**: available now / everything ever stocked. The bar fills with what's left: blue is fine, yellow is low, red is out.
- Use the tabs to show **All active**, **Low**, **Out** or **Awaiting approval** (new items not yet approved).
- **All categories** filters by category. The search box finds items by name, code or brand.
- **Export** downloads the list as Excel. **Upload Excel** and **Add item** are explained below.

Select an item to see its full story:

![Stock item](screenshots/04-stock-item.png)

- **Stocked so far / Handed out / In review / Available.** "In review" is stock in distributions waiting for approval; it hasn't been deducted yet.
- **Movement ledger:** every approved movement with the running balance. **Excel** downloads it.
- **Recipients:** who received this item, when and why.
- **Stock inward** and **Distribute** start a request with this item already chosen.

### Record a distribution

Use this when you hand goodies to people. Select **Distributions → Record a distribution** (or **Distribute** on an item).

![Distributions list](screenshots/03b-distributions-list.png)

![Record a distribution](screenshots/05-distribution-form.png)

1. **Request title:** something you'll recognise later, for example "Onboarding batch 21 welcome kits".
2. **Purpose, Distribution date, Location, Handed over by (POC):** these apply to every line.
3. **Remarks for the approver:** optional context.
4. Under **Items and recipients**, for each person: choose the **Item** (type to search; the number shows how many are available), the **Qty**, their **Emp ID** and **Recipient name**. Select **Add line** for the next person. The bin icon removes a line.
5. Select **Submit for approval**, or **Save draft** to finish later.

![Submitted distribution](screenshots/06-distribution-submitted.png)

After submitting, the request shows **In review**. You can't change it while it's being reviewed; if the approver returns it, you can.

**Not enough stock?** If the lines add up to more than is available, the item turns red and the request can't be submitted until you reduce the quantities.

![Over-stock warning](screenshots/10-over-stock-warning.png)

### Upload a distribution sheet

For events with many people, upload Excel instead of typing. Select **Distributions → Upload Excel**.

![Distribution upload result](screenshots/19-distribution-upload-result.png)

1. **Download template**, fill one row per handover, and save it. Your **old "Recipient" sheet works as it is**: Date of Delivery, Emp ID, Name, Base Location, Category, POC and Product Details are recognised, one unit per row.
2. **Choose a file** (or drag it onto the box).
3. Optionally give a **Request title** and **Default purpose**, then select **Validate and save as draft**.

The result shows how many rows were saved and lists each problem row with the reason, for example an item name that doesn't match any stock. **Error report** downloads those problems as Excel so you can fix and re-upload just those rows. **Review draft** opens the new draft; check it and submit it from there.

Items are matched by **Stock Code**, or by the exact **Product Details** text shown on the stock page.

### Add new stock items

For a product you've never stocked. Select **Stock → Add item**.

![Add a stock item](screenshots/14-add-stock-item.png)

1. Fill **Product**, **Category**, and **Size / Colour / Brand** if they apply.
2. **Stock name** fills itself in the old tracker style ("Product - Size - Colour - Brand"). You can change it.
3. Leave **Stock code** blank to get the next code automatically (MAV-00045…).
4. Enter the **Opening quantity** (what's on the shelf now) and a **Reorder level**: the item shows as low stock at or below this number.
5. Select **Add to draft**.

Items you add go into one draft, so you can add several and submit them together:

![Stock draft](screenshots/15-stock-draft.png)

Select **Submit for approval**. The opening quantities go into stock once it's approved.

### Upload a stock sheet

To add many new items at once, select **Stock → Upload Excel**. It works like the distribution upload. Your old **"Stock count"** sheet is recognised (Product Details, Product, Size, Color, Brand and Available).

![Stock upload result](screenshots/18-stock-upload-result.png)

Rows with problems, such as a stock code that already exists or a quantity that isn't a number, are listed and left out. The good rows become a draft.

### Record stock inward

When a delivery arrives for items you already stock, select **Stock inward → Record stock inward** (or **Stock inward** on an item page).

![Stock inward list](screenshots/03c-stock-inward-list.png)

![Record stock inward](screenshots/17-stock-inward-form.png)

Give a title, the **PO, invoice or vendor reference** and the **Received on** date, then the item and quantity for each line. Select **Submit for approval**. The quantities are added after approval. The old **"Procurement"** sheet also uploads here (**Upload Excel**).

### Drafts and returned requests

**My requests** lists everything you've created. The number next to it in the menu counts drafts and returned requests waiting for you.

![My requests](screenshots/20-my-requests.png)

Use the tabs (**Drafts**, **In review**, **Approved**, **Returned**) or the search box. **Mine / Everyone's** switches between your requests and the whole team's.

**If an approver returns a request,** it shows **Rejected** with their remarks at the top:

![Returned request](screenshots/12-returned-request.png)

1. Read the remarks.
2. Fix the request: **Edit details** changes the title, purpose or remarks; the ✎ pencil on a line edits it; the bin removes it; **Add line** adds one.
3. Select **Resubmit for approval**.

To throw away a draft, open it and select **Delete draft**. It's kept in the history as "Deleted", but it can't be submitted.

**Excel** on any request downloads its lines.

---

## For Managers and the Management Authority

### The approval queue

Select **Approvals**. The number in the menu is how many requests are waiting for you.

![Approval queue](screenshots/07-approval-queue.png)

- Oldest first. **Waiting** turns yellow after the time set by the administrator (48 hours by default).
- **Check** tells you at a glance whether there's enough stock (green) or how many items are short (red).
- You only see requests at a level your role can approve, and never your own.
- **Your recent decisions** lists what you've approved or returned.

### Approve a request

Open a request from the queue. Check the **Stock impact** box, which shows what approval will take off the shelf (`available now → after`), then the lines.

![Approve dialog](screenshots/08-approve-dialog.png)

1. Select **Approve and update stock** (final level) or **Approve level 1** (when a second level follows).
2. Add remarks if you like, then select **Approve**.

At the final level the stock changes immediately and the request shows **Approved**:

![Approved distribution](screenshots/09-distribution-approved.png)

If, between submission and approval, someone else's approval used up the stock, the app stops and tells you which item is short; nothing is half-applied.

### Return a request

Select **Reject**, write **what needs to change** (required), and select **Reject request**. The request goes back to the executive with your remarks; stock doesn't change.

![Return with remarks](screenshots/11-reject-dialog.png)

Every request keeps its full **Approval history**: who created, submitted, returned, resubmitted and approved it, when, and the remarks.

![Approval history](screenshots/13-approval-history.png)

### Two-level approval

When the administrator switches on two levels (optionally only for requests above a number of units), the request shows **In review, level 1 of 2**:

1. A **Manager** (or the Management Authority) approves level 1.
2. A **Management Authority** gives the final approval. It must be a different person from level 1.

![Level 2 approval](screenshots/16-level-2-approval.png)

### Approve several at once

In the queue, tick the requests (or the box in the header for all that can be approved) and select **Approve N selected**. Each is checked separately; if one can't be approved (for example not enough stock), the others still go through and you're told which one failed.

![Bulk approval](screenshots/21-bulk-approve.png)

---

## Reports

Select **Reports**. Every report reads from approved records only, so it matches the ledger. **Excel** at the top right downloads every matching row with your current filters (the screen shows the first 100). **PDF** gives a printable version of up to 5,000 rows.

| Report | Shows | Filters |
| --- | --- | --- |
| **Current stock availability** | Opening, received, distributed and available for every item | Category, low/out of stock, search |
| **Distributed stock** | Every approved handover: date, item, quantity, recipient, location, purpose, POC | Dates, purpose, location, item, recipient name or Emp ID |
| **Pending approval** | Requests waiting, their level and how long they've waited | — |
| **Approval history** | Every submission, approval and return, with remarks | Dates, request number or title |
| **Stock movement ledger** | Every movement in and out with the running balance | Dates, item |

![Current stock availability](screenshots/22-report-availability.png)

![Distributed stock](screenshots/23-report-distributed.png)

![Pending approval](screenshots/24-report-pending.png)

![Approval history report](screenshots/25-report-approvals.png)

![Stock movement ledger](screenshots/26-report-ledger.png)

---

## For System Administrators

### Add and manage users

Select **Users & roles**.

![Users](screenshots/30-users.png)

**Add a person:** select **Add user**, fill **Employee ID**, **Full name**, **Work email**, **Role** (the description underneath says what that role can do), and optionally department and location. Select **Create user**.

![Add user](screenshots/27-add-user.png)

You'll see a **one-time password**. Use the copy button, share it with the person privately, and select **Done**. It isn't shown again.

![One-time password](screenshots/28-one-time-password.png)

On each row:

- ✎ **Edit:** change details or role, or switch **Account active** off. A deactivated person can't sign in, but everything they did stays in the records.
- 🔑 **Reset password:** gives a new one-time password.

You can't remove your own admin access, and the app won't let the last active administrator be deactivated.

### Approval rules

Select **Approval rules**.

![Approval rules](screenshots/31-approval-rules.png)

- **One level / Two levels.** With two levels you can set **Require level 2 from this many units**: smaller requests need only level 1. Use 0 to send every request to level 2.
- **Block distributions that exceed available stock.** Keep this on. It's checked when a request is submitted and again when it's approved.
- **Flag requests waiting longer than (hours).** Older requests are highlighted for approvers.

Select **Save rules**. New submissions follow the new rules; requests already in review keep the levels they started with.

### Master data

Select **Master data** to manage the lists people pick from: **Categories**, **Purposes**, **Locations** and **Units**. Type a new value and select **Add**. The switch next to a value hides it from new entries without changing old records.

![Master data](screenshots/32-master-data.png)

### Audit log

Select **Audit log** (also available to Managers and the Management Authority). Every sign-in, change, approval, upload and export is listed with who did it and when. Where something was changed, **Show changed values** shows the before and after. Entries can't be edited or deleted.

![Audit log](screenshots/33-audit-log.png)

---

## Your profile and password

Open the account menu (your name, top right) → **Profile and password**.

![Profile](screenshots/35-profile.png)

To change your password: enter the **Current password**, a **New password** (at least 10 characters with a letter and a number) and **Confirm new password**, then select **Change password**.

**First sign-in with a one-time password:** you're taken here automatically and can't open other pages until you've chosen your own password.

![First sign-in](screenshots/29-first-sign-in.png)

---

## Questions people ask

**I recorded a distribution but the stock didn't go down.**
That's expected. Stock changes only when the request gets its final approval. Check its status under **My requests**.

**I can't see an Approve button.**
You can't approve your own requests, and at level 2 only a Management Authority who didn't approve level 1 can approve. The approval history on the request says who it's waiting for.

**The upload says "No active stock item matches this value".**
The Product Details text in that row doesn't exactly match a stock item, or the item isn't approved yet. Use the **Stock code** column instead (the template's "Stock codes" sheet lists them all), or copy the name from the Stock page.

**The upload says my file isn't valid.**
Save it as **Excel Workbook (.xlsx)**. Older .xls and .csv files aren't accepted. Files can be up to 15 MB and 50,000 rows.

**I submitted something by mistake.**
Ask the approver to **return** it; you can then fix or delete it. Approved requests can't be undone. Record a correcting request instead (for example stock inward for items that came back).

**Can I delete a stock item?**
New items in a draft can be removed. An approved item can only be deactivated by an administrator, and only if it was never used in a request, because its history must be kept.

**Where's the old Excel tracker data?**
The stock list was loaded from the Sep 25 tracker. Past handovers can be brought in by uploading the old Recipient sheet under **Distributions → Upload Excel**.
