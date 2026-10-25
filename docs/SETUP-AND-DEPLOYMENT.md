# Mavericks Inventory: setup and deployment guide

This guide is for whoever hosts the application, whether that's on Vercel, AWS, Azure or a server inside Hexaware. It assumes no knowledge of the code. Follow the parts that match your platform; every step says what it does and how to check it worked.

**Contents**

1. [What you are deploying](#1-what-you-are-deploying)
2. [Before you start](#2-before-you-start)
3. [Settings (environment variables)](#3-settings-environment-variables)
4. [Set up the database](#4-set-up-the-database)
5. [Load data: production or demo](#5-load-data-production-or-demo)
6. [Deploy the application](#6-deploy-the-application)
   - [6A. Vercel + Neon](#6a-vercel--neon)
   - [6B. AWS](#6b-aws)
   - [6C. Azure](#6c-azure)
   - [6D. Your own server or Hexaware VM (Docker)](#6d-your-own-server-or-hexaware-vm-docker)
7. [After go-live checklist](#7-after-go-live-checklist)
8. [Backups and restore](#8-backups-and-restore)
9. [Updating to a new version](#9-updating-to-a-new-version)
10. [Monitoring and logs](#10-monitoring-and-logs)
11. [Troubleshooting](#11-troubleshooting)
12. [Handover notes](#12-handover-notes)

---

## 1. What you are deploying

Mavericks Inventory has exactly two parts:

```mermaid
flowchart LR
  U[People in a browser] -->|HTTPS| A[Mavericks Inventory<br/>Next.js web app<br/>port 3000]
  A -->|SQL over TLS| D[(PostgreSQL 14+<br/>database)]
```

| Part | What it is | Where it can run |
| --- | --- | --- |
| **Web app** | One Node.js 20+ process (Next.js). It serves the pages, the Excel uploads and the report downloads. It keeps no files on disk, so you can run one copy or several. | Vercel, AWS App Runner or ECS, Azure App Service or Container Apps, any server with Docker |
| **Database** | PostgreSQL 14 or newer. Holds stock, requests, approvals, the ledger, users and the audit log. | Neon, Vercel Postgres, Amazon RDS / Aurora, Azure Database for PostgreSQL, a self-managed PostgreSQL |

Nothing else is required: no email server, no file storage, no queue. Uploaded Excel files are read in memory and not stored.

**Time zone.** Dates on screen and in exports are shown in India time (Asia/Kolkata), whatever region the servers are in.

---

## 2. Before you start

You need:

- [ ] Access to the GitHub repository `venkynani1/mavericks-inventory` (or a copy of it)
- [ ] An account on the platform you'll host on (Vercel, AWS or Azure), with permission to create a database and an app
- [ ] For command-line steps: [Node.js 20 or newer](https://nodejs.org) and [Git](https://git-scm.com) on your computer. For AWS/Azure container steps, also [Docker](https://www.docker.com/products/docker-desktop/) and the [AWS CLI](https://aws.amazon.com/cli/) or [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- [ ] The email address of the person who will be the first System Administrator

Get the code onto your computer once:

```bash
git clone https://github.com/venkynani1/mavericks-inventory.git
cd mavericks-inventory
npm install
```

---

## 3. Settings (environment variables)

The app is configured only through these settings. On Vercel/AWS/Azure you enter them in the platform's console; on your own machine they go in a file called `.env` (copy `.env.example` to `.env` and fill it in).

| Setting | Required | What to put | Example |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | Connection string the app uses at runtime. If your provider offers a **pooled** string (Neon, Supabase, PgBouncer), use that here. | `postgresql://mav_app:••••@db.example.com:5432/mavericks?sslmode=require` |
| `DIRECT_URL` | Yes | A **direct** (non-pooled) connection string, used only to create and update tables. If there is no pooler, use the same value as `DATABASE_URL`. | same as above |
| `AUTH_SECRET` | Yes | A random secret of at least 32 characters that signs sign-in sessions. Generate one (below). Changing it signs everyone out. | `x3N…` (64 random characters) |
| `BOOTSTRAP_ADMIN_EMAIL` | For a production start | Email of the first System Administrator. Only works while the database has no users. | `inventory.admin@hexaware.com` |
| `BOOTSTRAP_ADMIN_PASSWORD` | For a production start | A temporary password (10+ characters) for that first sign-in. The admin must change it straight away. | `Temp-Start-2026!` |
| `DEMO_MODE` | No | `true` shows the demo accounts on the sign-in page. Use `false` in production. | `false` |
| `SEED_PASSWORD` | No | Password given to the demo users when you load demo data. | `Mavericks@2026` |
| `RUN_MIGRATIONS` | No (Docker only) | `true` (default) creates or updates tables when the container starts. Set `false` if you prefer to run migrations yourself. | `true` |

**Generate `AUTH_SECRET`** with any of these:

```bash
openssl rand -base64 48
# or
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Keep `AUTH_SECRET`, the database password and `BOOTSTRAP_ADMIN_PASSWORD` in your platform's secret store (Vercel environment variables, AWS Secrets Manager, Azure Key Vault). Never commit them to Git; `.env` is already excluded.

---

## 4. Set up the database

Pick **one** of the options below. Each ends with a connection string to put in `DATABASE_URL` / `DIRECT_URL`.

### Connection string format

```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

- If the password contains special characters such as `@ : / ? # %`, [percent-encode](https://www.urlencoder.org/) it (for example `@` becomes `%40`).
- Keep `?sslmode=require` for any cloud database. Leave it off only for a database on the same machine.

### Option 1: Neon (simplest, works best with Vercel)

1. Sign up at [neon.tech](https://neon.tech) and create a project. Choose the region **AWS Asia Pacific (Mumbai)** (`ap-south-1`) or the one closest to your users.
2. On the project dashboard, click **Connect**.
3. Copy the connection string with **Connection pooling ON** (host contains `-pooler`) → this is `DATABASE_URL`.
4. Turn **Connection pooling OFF** and copy again → this is `DIRECT_URL`.

### Option 2: Amazon RDS for PostgreSQL

1. AWS console → **RDS** → **Create database** → **Standard create** → **PostgreSQL**, version **16**.
2. Template: **Production** (Multi-AZ) for the live system, **Dev/Test** otherwise.
3. Settings: DB instance identifier `mavericks-inventory`, master username `postgres`, set a strong password.
4. Instance: `db.t4g.small` is plenty to start (about 50 users); storage 20 GB gp3 with autoscaling.
5. Connectivity: put it in the **same VPC** as the app, **Public access: No**. Create a security group `mavericks-db` that allows port **5432** only from the app's security group.
6. Additional configuration: Initial database name **`mavericks`**, enable automated backups (7+ days) and encryption.
7. When status is **Available**, copy the **Endpoint**. Your string is:
   `postgresql://postgres:PASSWORD@ENDPOINT:5432/mavericks?sslmode=require`

Aurora PostgreSQL works the same way; use the cluster's **writer** endpoint.

### Option 3: Azure Database for PostgreSQL (Flexible Server)

1. Azure portal → **Create a resource** → **Azure Database for PostgreSQL – Flexible Server**.
2. Resource group `rg-mavericks`, server name `mavericks-db`, region **Central India**, PostgreSQL **16**.
3. Workload type: **Production (Small/Medium)**, or **Development** for testing. Burstable B1ms/B2s is enough to start.
4. Authentication: **PostgreSQL authentication**; set the admin user (for example `mavadmin`) and password.
5. Networking: **Private access (VNet integration)** if the app will run in the same VNet (recommended). Otherwise **Public access** and add a firewall rule for the app's outbound IP addresses. Do not allow `0.0.0.0 – 255.255.255.255`.
6. After it's created: **Databases** → **Add** → name `mavericks`.
7. Your string is:
   `postgresql://mavadmin:PASSWORD@mavericks-db.postgres.database.azure.com:5432/mavericks?sslmode=require`

### Option 4: PostgreSQL on your own server or laptop

Install PostgreSQL 16 ([downloads](https://www.postgresql.org/download/)) or run it in Docker:

```bash
docker run -d --name mavericks-db -e POSTGRES_USER=mav -e POSTGRES_PASSWORD=mav \
  -e POSTGRES_DB=mavericks -p 5432:5432 -v mavericks-pg:/var/lib/postgresql/data postgres:16
```

String: `postgresql://mav:mav@localhost:5432/mavericks`

### Recommended: a separate login for the app

The admin login of a cloud database can do anything. Give the app its own login that can only use the `mavericks` database. Connect with any SQL tool (psql, pgAdmin, DBeaver, Azure Data Studio) as the admin and run:

```sql
CREATE ROLE mav_app LOGIN PASSWORD 'choose-a-strong-password';
GRANT CONNECT, TEMPORARY ON DATABASE mavericks TO mav_app;
\c mavericks
GRANT USAGE, CREATE ON SCHEMA public TO mav_app;   -- CREATE is needed to create tables on first deploy
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mav_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO mav_app;
```

Then use `mav_app` in `DATABASE_URL` and `DIRECT_URL`.

### Create the tables

The tables are created by the app's **migrations**. On Vercel and in the Docker image this happens automatically during deploy. To do it yourself from your computer (with `.env` filled in):

```bash
npx prisma migrate deploy
```

**Check it worked:** the command ends with `All migrations have been successfully applied.` You can also open the database and see tables such as `StockItem`, `Request` and `AuditLog`.

---

## 5. Load data: production or demo

Choose one.

### Production start (no demo data)

1. Set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` on your platform and deploy.
2. Open the site and sign in with those two values. Because the database has no users yet, this **creates the first System Administrator** and the standard lists (categories, purposes, locations, units, default approval rules).
3. You'll be taken to **Profile** to choose a new password. Do that now.
4. Go to **Users & roles** and add the real Executives, Managers and Management Authority. Each gets a one-time password to share with them.
5. Remove `BOOTSTRAP_ADMIN_PASSWORD` from the platform settings (it no longer works once a user exists, but there's no reason to keep it).
6. Load your stock: an Executive uses **Stock → Upload Excel** with the current stock sheet; a Manager approves it.

Optional: to create the standard lists before anyone signs in, run `npm run db:setup` from your computer with `.env` pointing at the database.

### Demo / UAT start (with sample data)

From your computer, with `.env` pointing at the new database:

```bash
npx prisma migrate deploy   # if tables don't exist yet
npm run db:seed
```

This loads the 43 items from the Sep 25 stock sheet, about 2,400 historical handovers with **made-up recipient names**, some requests in each state, and five demo users (password `Mavericks@2026` unless you set `SEED_PASSWORD`):

| Email | Role |
| --- | --- |
| executive@mavericks.demo, executive2@mavericks.demo | Executive |
| manager@mavericks.demo | Manager |
| authority@mavericks.demo | Management Authority |
| admin@mavericks.demo | System Administrator |

The seed only runs on an empty database. **Never load demo data into the production database.** If you did by mistake, create a fresh database and start again.

---

## 6. Deploy the application

Every option ends with the same check: open `https://YOUR-ADDRESS/api/health`. It should show:

```json
{"status":"ok","db":"ok","time":"…"}
```

If `db` is not `ok`, see [Troubleshooting](#11-troubleshooting).

### 6A. Vercel + Neon

Fastest option, about 15 minutes. Good for demos, UAT and small teams. Check that your Vercel plan allows company use (the free Hobby plan is for non-commercial use).

1. Create the database with [Option 1: Neon](#option-1-neon-simplest-works-best-with-vercel).
2. Sign in to [vercel.com](https://vercel.com) with GitHub → **Add New… → Project** → **Import** `mavericks-inventory`. Framework is detected as Next.js; leave the root directory and build settings alone.
3. Open **Environment Variables** and add `DATABASE_URL` (pooled), `DIRECT_URL` (direct), `AUTH_SECRET`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, and `DEMO_MODE=false`.
4. Click **Deploy**. The build runs `npm run vercel-build`, which creates/updates the tables and then builds the site. `vercel.json` places the app in the Mumbai region (`bom1`).
5. Open the site address Vercel shows, then `/api/health`.
6. Continue with [section 5](#5-load-data-production-or-demo).

Optional: **Settings → Domains** to add your own address, for example `inventory.mavericks.example.com`.

Large uploads: the upload function is allowed up to 300 seconds (set in `vercel.json`). If Vercel rejects the deploy because your plan allows less, lower that number in `vercel.json` to your plan's limit.

### 6B. AWS

Two ways to run the app on AWS. Both use the same Docker image and an RDS database ([Option 2](#option-2-amazon-rds-for-postgresql)).

#### Build and push the image (both ways)

Run in the project folder. Replace `123456789012` with your AWS account number.

```bash
REGION=ap-south-1
ACCOUNT=123456789012
REPO=mavericks-inventory

aws ecr create-repository --repository-name $REPO --region $REGION
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com
docker build --platform linux/amd64 -t $REPO .
docker tag $REPO:latest $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:latest
docker push $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:latest
```

#### Store the secrets

AWS console → **Secrets Manager** → **Store a new secret** → **Other type of secret**, one key/value per setting: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`. Name it `mavericks-inventory/prod`.

#### Way 1: App Runner (simplest)

1. AWS console → **App Runner** → **Create service** → **Container registry** → **Amazon ECR** → choose the image, deployment trigger **Automatic**.
2. Service settings: port **3000**, CPU 1 vCPU, memory 2 GB.
3. **Environment variables**: add each setting, choosing **Secrets Manager** as the source for the secret ones. Add `DEMO_MODE=false` as plain text.
4. **Health check**: protocol HTTP, path **`/api/health`**.
5. **Networking → Outgoing traffic**: **Custom VPC**, and create a VPC connector in the database's VPC/subnets with a security group the database allows.
6. **Create & deploy**. When it says **Running**, open the default domain + `/api/health`.

The container creates/updates the tables each time it starts, so there's no separate migration step.

#### Way 2: ECS Fargate behind a load balancer (more control)

1. **ECS** → **Clusters** → **Create cluster** (Fargate).
2. **Task definitions** → **Create**: launch type Fargate, 1 vCPU / 2 GB, container image from ECR, port **3000**. Under environment, reference each secret from Secrets Manager (`valueFrom` the secret ARN + key). Give the task execution role permission to read that secret.
3. **Create service**: desired tasks **2** (one per Availability Zone), private subnets, security group allowing 3000 from the load balancer only.
4. Load balancing: **Application Load Balancer**, HTTPS listener on 443 with an **ACM certificate** for your domain, target group port 3000, health check path **`/api/health`**.
5. Point your domain (Route 53 or company DNS) at the load balancer.

Two tasks across zones plus Multi-AZ RDS meets the BRD's 99.5% availability target.

### 6C. Azure

Uses the same Docker image and Azure Database for PostgreSQL ([Option 3](#option-3-azure-database-for-postgresql-flexible-server)).

#### Build the image in Azure Container Registry

```bash
az login
az group create -n rg-mavericks -l centralindia
az acr create -g rg-mavericks -n mavericksacr --sku Basic
az acr build -r mavericksacr -t mavericks-inventory:latest .
```

(`az acr build` builds in Azure, so you don't need Docker on your computer.)

#### Keep secrets in Key Vault

```bash
az keyvault create -g rg-mavericks -n mavericks-kv -l centralindia
az keyvault secret set --vault-name mavericks-kv -n DATABASE-URL --value "postgresql://…?sslmode=require"
az keyvault secret set --vault-name mavericks-kv -n AUTH-SECRET  --value "$(openssl rand -base64 48)"
```

#### Way 1: App Service for Containers

```bash
az appservice plan create -g rg-mavericks -n plan-mavericks --is-linux --sku P1v3
az webapp create -g rg-mavericks -p plan-mavericks -n mavericks-inventory \
  --container-image-name mavericksacr.azurecr.io/mavericks-inventory:latest
az webapp identity assign -g rg-mavericks -n mavericks-inventory
```

Then in the portal:

1. **Container registry**: allow the app to pull from `mavericksacr` (Deployment Center → Registry settings → Managed identity, or enable the ACR admin user).
2. **Key Vault → Access control (IAM)**: give the web app's managed identity the **Key Vault Secrets User** role.
3. **Web app → Configuration → Application settings**:
   - `WEBSITES_PORT` = `3000`
   - `DATABASE_URL` = `@Microsoft.KeyVault(VaultName=mavericks-kv;SecretName=DATABASE-URL)`
   - `DIRECT_URL` = the same reference
   - `AUTH_SECRET` = `@Microsoft.KeyVault(VaultName=mavericks-kv;SecretName=AUTH-SECRET)`
   - `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `DEMO_MODE=false`
4. **Health check**: path `/api/health`.
5. **Networking → VNet integration** into the database's VNet (if you chose private access).
6. **Custom domains** + a managed certificate. For internet exposure, put **Azure Front Door** (with WAF) in front; for internal use, restrict access to the corporate network.
7. Scale out to 2 instances for availability.

#### Way 2: Container Apps

```bash
az containerapp env create -g rg-mavericks -n mavericks-env -l centralindia
az containerapp create -g rg-mavericks -n mavericks-inventory --environment mavericks-env \
  --image mavericksacr.azurecr.io/mavericks-inventory:latest --registry-server mavericksacr.azurecr.io \
  --target-port 3000 --ingress external --min-replicas 1 --max-replicas 3 \
  --secrets database-url="postgresql://…" auth-secret="…" \
  --env-vars DATABASE_URL=secretref:database-url DIRECT_URL=secretref:database-url AUTH_SECRET=secretref:auth-secret DEMO_MODE=false
```

Add a health probe on `/api/health` in **Containers → Health probes**. Keep `--min-replicas 1` so the first visitor of the day doesn't wait for a cold start.

### 6D. Your own server or Hexaware VM (Docker)

Any Linux server with Docker can run the app.

**App and database together** (pilot or small team):

```bash
git clone https://github.com/venkynani1/mavericks-inventory.git
cd mavericks-inventory
# edit docker-compose.yml: set AUTH_SECRET, DEMO_MODE and add BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD
docker compose up -d --build
```

Open `http://SERVER:3000/api/health`. The database data lives in the `pgdata` Docker volume; back it up ([section 8](#8-backups-and-restore)).

**App only, database elsewhere:**

```bash
docker build -t mavericks-inventory .
docker run -d --name mavericks --restart unless-stopped -p 3000:3000 \
  -e DATABASE_URL="postgresql://…" -e DIRECT_URL="postgresql://…" \
  -e AUTH_SECRET="…" -e BOOTSTRAP_ADMIN_EMAIL="…" -e BOOTSTRAP_ADMIN_PASSWORD="…" -e DEMO_MODE=false \
  mavericks-inventory
```

Put a reverse proxy (Nginx, IIS ARR, or the company load balancer) in front to serve HTTPS. Example Nginx block:

```nginx
server {
  listen 443 ssl;
  server_name inventory.example.com;
  ssl_certificate     /etc/ssl/inventory.crt;
  ssl_certificate_key /etc/ssl/inventory.key;
  client_max_body_size 20m;            # Excel uploads up to 15 MB
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;           # large uploads can take a few minutes
  }
}
```

**Without Docker** (Node.js 20+ installed on the server):

```bash
npm ci
npx prisma migrate deploy
npm run build
npm start                              # listens on port 3000; use PM2 or a systemd service to keep it running
```

---

## 7. After go-live checklist

- [ ] `/api/health` returns `"status":"ok"`
- [ ] `DEMO_MODE` is `false` (the sign-in page shows no demo accounts)
- [ ] The first administrator has changed their password, and `BOOTSTRAP_ADMIN_PASSWORD` is removed from settings
- [ ] There are at least **two** active System Administrators (so nobody gets locked out)
- [ ] Real users are created with the right roles. Executives create requests; Managers and the Management Authority approve them
- [ ] **Approval rules** reviewed (one or two levels; stock guard on)
- [ ] Site is HTTPS only; access limited to the company network or behind single sign-on/WAF if internet-facing
- [ ] Database backups switched on and a restore tested once ([section 8](#8-backups-and-restore))
- [ ] Opening stock uploaded and approved; the **Current stock availability** report matches the physical count

---

## 8. Backups and restore

Everything lives in the database, so backing up the database backs up the whole system.

| Platform | Backups | Restore |
| --- | --- | --- |
| Neon | Point-in-time restore (history window depends on plan) | Console → **Branches** → restore to a time, or create a branch from a past time |
| Amazon RDS | Automated backups (set 7–35 days) + manual snapshots | **Restore to point in time** creates a new instance; point `DATABASE_URL` at it |
| Azure Flexible Server | Automatic backups (7–35 days), optionally geo-redundant | **Restore** creates a new server at the chosen time |
| Self-managed / Docker | Schedule `pg_dump` (below) | `pg_restore` (below) |

Manual backup and restore with standard PostgreSQL tools:

```bash
# Backup (one file, compressed)
pg_dump "postgresql://USER:PASS@HOST:5432/mavericks?sslmode=require" -Fc -f mavericks-$(date +%F).dump

# Restore into an EMPTY database
pg_restore --no-owner -d "postgresql://USER:PASS@HOST:5432/mavericks_restored?sslmode=require" mavericks-2026-10-25.dump
```

For Docker Compose, run the backup inside the database container:

```bash
docker compose exec -T db pg_dump -U mav -Fc mavericks > mavericks-$(date +%F).dump
```

Test a restore into a spare database at least once before go-live.

---

## 9. Updating to a new version

1. Developers push changes to GitHub (the CI check must be green; see [Troubleshooting](#11-troubleshooting) for what it runs).
2. Take a database backup or snapshot.
3. Deploy:
   - **Vercel:** automatic on every push to `main`. Tables are updated during the build.
   - **App Runner (automatic trigger):** push a new image to ECR; App Runner redeploys.
   - **ECS / App Service / Container Apps / Docker:** build and push a new image, then restart or redeploy the service. The container applies any new migrations when it starts.
4. Check `/api/health` and sign in.

Database changes are always applied with `prisma migrate deploy`, which only runs migrations that haven't been applied yet. It never drops your data. Don't use `prisma migrate reset` or `npm run db:reset` against a real database: they delete everything.

---

## 10. Monitoring and logs

- **Health check:** `GET /api/health` returns HTTP 200 with `{"status":"ok","db":"ok"}`, or **503** if the database can't be reached. Point your uptime monitor or load balancer at it.
- **Logs:** the app writes errors to standard output. Find them in Vercel → **Logs**, AWS → **CloudWatch Logs** (App Runner/ECS), Azure → **Log stream** or **Application Insights**, or `docker logs mavericks`.
- **Inside the app:** System Administrators, Managers and the Management Authority can see the **Audit log**: every sign-in, change, approval and export, with who and when.
- **Overdue approvals:** requests waiting longer than the hours set in **Approval rules** (default 48) are flagged on the overview, the approval queue and the Pending approval report.

---

## 11. Troubleshooting

| What you see | Likely cause | Fix |
| --- | --- | --- |
| `/api/health` shows `"db":"unreachable"` or error **P1001** "Can't reach database server" | Wrong host/port, or a firewall/security group blocks the app | Check `DATABASE_URL`; allow port 5432 from the app (RDS security group, Azure firewall/VNet, Neon IP allow list) |
| **P1000** "Authentication failed" | Wrong user or password | Re-copy the connection string; percent-encode special characters in the password |
| "SSL connection is required" / "no pg_hba.conf entry … no encryption" | Missing TLS | Add `?sslmode=require` to the connection string |
| Build fails at `prisma migrate deploy` with "permission denied for schema public" | The database user can't create tables | Run the grants in [section 4](#recommended-a-separate-login-for-the-app), or run the first migration with the admin user |
| Error page: "AUTH_SECRET must be set (32+ characters)" | Setting missing or too short | Add `AUTH_SECRET` (see [section 3](#3-settings-environment-variables)) and redeploy |
| Everyone is signed out after a deploy | `AUTH_SECRET` changed | Expected. Keep it the same across deploys |
| "That email and password don't match" for the bootstrap admin | Users already exist, or the values differ from the settings | Bootstrap only works on an empty user table. Sign in as an existing admin, or check for typos and spaces in the settings |
| Sign-in loops back to the sign-in page | Site served over plain HTTP in production (the session cookie is HTTPS-only) | Serve the site over HTTPS |
| "Too many attempts. Wait a few minutes" | 5 wrong passwords for that email | Wait 5 minutes, or have an admin reset the password |
| Upload fails or times out on big files | Proxy body-size or timeout limits | Allow 20 MB bodies and a 300-second timeout (see the Nginx example); on Vercel see [6A](#6a-vercel--neon) |
| "Upload an .xlsx file" | File is `.xls` or `.csv` | Open it in Excel → **Save As → Excel Workbook (.xlsx)** |
| Container exits at start with a Prisma "query engine" error | Image built for the wrong CPU type | Build with `--platform linux/amd64` (as in [6B](#6b-aws)) |
| `prisma migrate deploy` reports a "failed migration" | A previous migration stopped halfway | Restore the latest backup into a fresh database, or ask a developer to resolve it with `prisma migrate resolve`. Don't reset a production database |

**For developers.** Every push runs `.github/workflows/ci.yml`: install, create tables, load demo data, type check, lint, build, then `npm run e2e`, which drives every role and flow in a real browser (41 checks). To run the same check on your machine:

```bash
npm run build && npm start &          # needs a database loaded with npm run db:seed
npx playwright install chromium       # once
npm run e2e                           # or: npm run screenshots  (also refreshes docs/screenshots)
```

---

## 12. Handover notes

- **Owner of the code:** GitHub repository `venkynani1/mavericks-inventory`.
- **Where to change things:** approval rules, users, roles and the lists (categories, purposes, locations, units) are all changed inside the app by a System Administrator, with no code change or redeploy needed.
- **Single sign-on later:** sign-in is handled in one place (`src/app/actions/auth.ts` and `src/lib/server/session.ts`). To use Microsoft Entra ID (Azure AD), replace the password check with an OpenID Connect callback that creates the same session cookie and maps Entra groups to the four roles. Nothing else in the app needs to change.
- **What the app enforces** and how each BRD requirement is met: see `docs/BRD-TRACEABILITY.md` and the README.
- **How people use it:** see `docs/USER-GUIDE.md` (illustrated, for non-technical users).
