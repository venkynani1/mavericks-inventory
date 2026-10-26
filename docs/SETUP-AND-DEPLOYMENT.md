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
13. [Company single sign-on (SSO)](#13-company-single-sign-on-sso)
14. [Check a deployed site](#14-check-a-deployed-site)
15. [Appendix: SSO code reference](#15-appendix-sso-code-reference)

**In a hurry?** To put a working demo on Vercel without installing anything or opening a database, follow [6A. Vercel + Neon](#6a-vercel--neon), then [14. Check a deployed site](#14-check-a-deployed-site).

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
| | | **On Vercel with the Neon integration you set neither of these.** The integration creates `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, and the app uses `DATABASE_URL_UNPOOLED` as `DIRECT_URL` automatically (older `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` names work too). | |
| `AUTH_SECRET` | Yes | A random secret of at least 32 characters that signs sign-in sessions. Generate one (below). Changing it signs everyone out. | `x3N…` (64 random characters) |
| `BOOTSTRAP_ADMIN_EMAIL` | For a production start | Email of the first System Administrator. Only works while the database has no users. | `inventory.admin@hexaware.com` |
| `BOOTSTRAP_ADMIN_PASSWORD` | For a production start | A temporary password (10+ characters) for that first sign-in. The admin must change it straight away. | `Temp-Start-2026!` |
| `DEMO_MODE` | No | `true` shows the demo accounts on the sign-in page. Use `false` in production. | `false` |
| `SEED_PASSWORD` | No | Password given to the demo users when you load demo data. | `Mavericks@2026` |
| `SEED_DEMO_DATA` | No (Vercel only) | `true` makes the Vercel build load the demo data into an empty database. Without it, the build only creates the standard lists. It never touches a database that already has users. | `true` for a demo, unset for production |
| `APP_URL` | For SSO | The site's public address, used to build the SSO return address. | `https://inventory.example.com` |
| `SSO_*` | For SSO | Company sign-in settings, see [section 13](#13-company-single-sign-on-sso). | |
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

**On Vercel:** set `SEED_DEMO_DATA=true` and deploy. The build loads the demo data for you (see [6A](#6a-vercel--neon)); nothing to run yourself.

**Elsewhere:** from your computer, with `.env` pointing at the new database:

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

About 10 minutes, all in the browser: no database tool, no command line. Vercel creates the database, and the build creates the tables and (if you ask) loads the demo data. Check that your Vercel plan allows company use (the free Hobby plan is for non-commercial use).

#### Way 1: from your existing GitHub repository (recommended)

1. Sign in to [vercel.com](https://vercel.com) with the GitHub account that owns `mavericks-inventory`.
2. **Add New… → Project** → find `mavericks-inventory` → **Import**. Framework is detected as Next.js; leave the root directory and build settings as they are.
3. Open **Environment Variables** on the same screen and add:

   | Name | Value for a demo / UAT site | Value for production |
   | --- | --- | --- |
   | `AUTH_SECRET` | Any random text of 32+ characters, e.g. from [generate-secret.vercel.app/64](https://generate-secret.vercel.app/64) | Same |
   | `SEED_DEMO_DATA` | `true` | (leave out) |
   | `DEMO_MODE` | `true` (lists the demo accounts on the sign-in page) | `false` |
   | `BOOTSTRAP_ADMIN_EMAIL` | (not needed) | Email of the first administrator |
   | `BOOTSTRAP_ADMIN_PASSWORD` | (not needed) | A temporary password, 10+ characters |

4. Click **Deploy**. **This first build is expected to fail** with "No database is connected to this project". That's fine: the database comes next.
5. Open the project → **Storage** tab → **Create Database** → **Neon** (Serverless Postgres) → **Continue**. Choose the region **Mumbai (ap-south-1)** if offered (closest to the app's `bom1` region), the free plan is enough for a demo, give it a name (`mavericks-inventory-db`) → **Create**.
6. On the database page, **Connect Project** → choose `mavericks-inventory` and tick **Production** and **Preview** → **Connect**. This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to the project. You don't copy anything.
7. **Deployments** → the failed deployment → **⋯ → Redeploy**. Watch **Building**: you should see `All migrations have been successfully applied`, then `Seeded 43 items…` (demo) or `Reference data is in place` (production), then the site build.
8. When it says **Ready**, open the address (for example `https://mavericks-inventory.vercel.app`) and add `/api/health`. You should see `{"status":"ok","db":"ok",…}`.
9. Sign in:
   - **Demo:** the sign-in page lists the demo accounts (password `Mavericks@2026`).
   - **Production:** sign in with `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`, choose a new password, then follow [section 5](#5-load-data-production-or-demo).
10. Check the site: [section 14](#14-check-a-deployed-site).

From now on, every push to `main` redeploys automatically; new database changes are applied during the build, and demo data is never loaded twice.

#### Way 2: one-click Deploy button (for someone starting from scratch)

This copies the code into the person's own GitHub account, asks for the settings, and offers to create the Neon database in the same flow:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvenkynani1%2Fmavericks-inventory&project-name=mavericks-inventory&repository-name=mavericks-inventory&env=AUTH_SECRET,SEED_DEMO_DATA,DEMO_MODE&envDescription=AUTH_SECRET%3A%20any%20random%20text%20of%2032%2B%20characters.%20SEED_DEMO_DATA%20and%20DEMO_MODE%3A%20true%20for%20a%20demo%20with%20sample%20data%2C%20false%20for%20production.&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

If the button's database step doesn't appear (Vercel changes its marketplace from time to time), finish the deploy, then do steps 5–7 of Way 1.

#### Notes for Vercel

- **Your own address:** **Settings → Domains**, for example `inventory.mavericks.example.com`.
- **Preview deployments** (from branches other than `main`) are protected by Vercel sign-in by default. Test on the production address.
- **Large uploads:** the upload function may run up to 300 seconds (set in `vercel.json`). If Vercel rejects the deploy because your plan allows less, lower that number in `vercel.json`.
- **If you prefer your own Neon project** instead of the integration, create it as in [Option 1](#option-1-neon-simplest-works-best-with-vercel) and add `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) yourself in step 3.
- **Region:** `vercel.json` runs the app in Mumbai (`bom1`). Keep the database in the same region for speed.

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
| Vercel build: "No database is connected to this build" | No Neon database connected yet, or connected after the deployment started, or connected only to Production while this is a Preview build (the message says which) | Storage → Create Database → Neon → **Connect Project** with **Production and Preview** ticked, then Deployments → ⋯ → **Redeploy** ([6A](#6a-vercel--neon) steps 5–7). Custom prefixes in Connect Project (e.g. `STORAGE_`) are fine; the app finds them |
| Vercel build: "AUTH_SECRET is missing or shorter than 32 characters" | Setting not added | Settings → Environment Variables → add `AUTH_SECRET`, then **Redeploy** |
| Sign-in says "That email and password don't match" for the demo accounts, and the page shows **No accounts exist yet** | The database was set up by a build without `SEED_DEMO_DATA=true`, so no users were created | Set `SEED_DEMO_DATA` = `true` (Production ticked) and **Redeploy**; the build log must show "Seeded 43 items". Works as long as the database has no users |
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
- **Single sign-on:** already built in and switched off by default. Turning it on is configuration only; see [section 13](#13-company-single-sign-on-sso).
- **What the app enforces** and how each BRD requirement is met: see `docs/BRD-TRACEABILITY.md` and the README.
- **How people use it:** see `docs/USER-GUIDE.md` (illustrated, for non-technical users).

---

## 13. Company single sign-on (SSO)

Today people sign in with an email and a password that the administrator sets up. When the app moves to production, the usual requirement is to sign in with the **Hexaware work account** (Microsoft 365 / Entra ID) instead: no separate password, leavers lose access as soon as IT disables their account, and multi-factor authentication comes from the company policy.

**The code for this is already in the app and switched off.** Turning it on is configuration: register the app with the company's identity provider, add six settings, redeploy.

### 13.1 The options, and which to choose

| Option | How it works | Effort | When to choose it |
| --- | --- | --- | --- |
| **A. Built-in OpenID Connect (recommended)** | The app's own "Sign in with Microsoft" button. The app talks to Entra ID directly and maps Entra **app roles** to the four app roles. | Configuration only (code is done and tested) | Almost always. Works on Vercel, AWS, Azure and on-premises, and with any OIDC provider |
| B. Same code, another provider | Okta, Google Workspace, Ping, Keycloak, Auth0, or Azure AD B2C: set `SSO_ISSUER` to their address | Configuration only | The company uses something other than Microsoft |
| C. SAML-only identity provider | Most SAML providers (ADFS, Okta, Ping) also offer OIDC for the same app, so use option A/B. If only SAML is allowed, put a SAML-to-OIDC bridge in front, such as [BoxyHQ SAML Jackson](https://boxyhq.com/docs/jackson/overview) or Keycloak, and point `SSO_ISSUER` at it | A small extra service | IT mandates SAML |
| D. Sign-in at the platform edge | Azure App Service **Authentication** ("Easy Auth"), AWS **ALB** OIDC authentication, or Cloudflare Access check the user before the request reaches the app; the app reads the forwarded identity headers | Code change needed to trust those headers | The platform team wants every internal app behind the same gateway. Not available on Vercel |
| E. Auth.js (NextAuth) | Replace the sign-in layer with the Auth.js library and its Microsoft Entra provider | Larger code change | Only if many more sign-in methods are needed later |

The rest of this section sets up option A with Microsoft Entra ID.

### 13.2 How it works

```mermaid
sequenceDiagram
  participant U as Person (browser)
  participant A as Mavericks Inventory
  participant E as Microsoft Entra ID
  U->>A: Sign in with Microsoft
  A->>U: Redirect to Entra (state, nonce, PKCE challenge)<br/>+ short-lived signed cookie
  U->>E: Sign in (company password + MFA)
  E->>U: Redirect back with a one-time code
  U->>A: /api/auth/sso/callback?code=…&state=…
  A->>E: Exchange code (client secret + PKCE verifier)
  E->>A: ID token (signed): name, email, app roles
  A->>A: Verify signature, issuer, audience, nonce<br/>Find or create the user, sync role, audit
  A->>U: Session cookie, open the app
```

- **Who gets in:** only people Entra says have one of the app roles (`Inventory.Executive`, `Inventory.Manager`, `Inventory.Authority`, `Inventory.Admin`). Anyone else sees "You don't have access to Mavericks Inventory yet" and the attempt is written to the audit log.
- **First sign-in:** an account is created automatically with the role from Entra (`SSO_AUTO_CREATE`). People who already have an account are matched by email and linked.
- **Role changes:** if IT moves someone from Executive to Manager in Entra, the app applies it at their next sign-in (`SSO_ROLES_FROM_IDP`). Each change is in the audit log.
- **Leavers:** when IT disables the account in Entra, they can't sign in any more. Admins can also deactivate them in the app, which takes effect immediately.
- **Segregation of duties still applies:** the approval rules (no self-approval, different people at each level) don't depend on how someone signed in.
- **Safety:** authorization-code flow with PKCE, `state` and `nonce` checks, and ID-token signature, issuer, audience and expiry verification against the provider's published keys. The client secret stays on the server.

### 13.3 Set up Microsoft Entra ID (done by the IT / identity team)

You need someone with the **Application Developer** or **Cloud Application Administrator** role in Hexaware's Entra tenant.

**1. Register the app**

1. [Entra admin center](https://entra.microsoft.com) → **Identity → Applications → App registrations → New registration**.
2. Name: `Mavericks Inventory`.
3. Supported account types: **Accounts in this organizational directory only** (single tenant).
4. Redirect URI: platform **Web**, address `https://YOUR-APP-ADDRESS/api/auth/sso/callback`, for example `https://mavericks-inventory.vercel.app/api/auth/sso/callback`. Add one per environment (UAT, production) under **Authentication** later.
5. **Register**. From the **Overview** page note the **Application (client) ID** and **Directory (tenant) ID**.

**2. Create a client secret**

**Certificates & secrets → Client secrets → New client secret**, description `mavericks-inventory`, expiry 12 or 24 months. Copy the **Value** immediately (it's shown once). Put a reminder in the calendar to renew it before it expires.

**3. Create the app roles**

**App roles → Create app role**, four times:

| Display name | Allowed member types | Value | Description |
| --- | --- | --- | --- |
| Inventory Executive | Users/Groups | `Inventory.Executive` | Records stock and distributions |
| Inventory Manager | Users/Groups | `Inventory.Manager` | Approves level 1 |
| Inventory Management Authority | Users/Groups | `Inventory.Authority` | Approves level 1 or 2 |
| Inventory Administrator | Users/Groups | `Inventory.Admin` | Users, rules and master data |

Or paste this into **Manifest** under `"appRoles"` (generate new GUIDs for the `id` fields, e.g. with `New-Guid` in PowerShell):

```json
"appRoles": [
  { "allowedMemberTypes": ["User"], "displayName": "Inventory Executive", "value": "Inventory.Executive", "description": "Records stock and distributions", "isEnabled": true, "id": "00000000-0000-0000-0000-000000000001" },
  { "allowedMemberTypes": ["User"], "displayName": "Inventory Manager", "value": "Inventory.Manager", "description": "Approves level 1", "isEnabled": true, "id": "00000000-0000-0000-0000-000000000002" },
  { "allowedMemberTypes": ["User"], "displayName": "Inventory Management Authority", "value": "Inventory.Authority", "description": "Approves level 1 or 2", "isEnabled": true, "id": "00000000-0000-0000-0000-000000000003" },
  { "allowedMemberTypes": ["User"], "displayName": "Inventory Administrator", "value": "Inventory.Admin", "description": "Users, rules and master data", "isEnabled": true, "id": "00000000-0000-0000-0000-000000000004" }
]
```

**4. Make sure the email is in the token**

**Token configuration → Add optional claim → ID → `email`** (and tick "Turn on the Microsoft Graph email permission" if asked). The app also falls back to `preferred_username`, which in most tenants is the work email. Optional: to give new accounts the real employee ID, IT can add an `employeeid` claim with a [claims-mapping policy](https://learn.microsoft.com/entra/identity-platform/saml-claims-customization). Without it, new accounts get an ID like `SSO-3F9A1C2B` that an admin can edit.

**5. Assign people**

**Enterprise applications → Mavericks Inventory → Users and groups → Add user/group** → pick people or (better) security groups such as `GRP-Mavericks-Inventory-Managers`, and choose the role. Then **Properties → Assignment required? → Yes**, so nobody without a role can even start the sign-in.

**6. Hand over these values** to whoever runs the deployment: tenant ID, client ID, client secret value.

### 13.4 Switch it on in the app

Add these settings (Vercel: **Settings → Environment Variables**; AWS/Azure: the app's environment / secrets) and redeploy:

| Setting | Value | Notes |
| --- | --- | --- |
| `SSO_ISSUER` | `https://login.microsoftonline.com/<tenant-id>/v2.0` | Turns SSO on (together with the next two) |
| `SSO_CLIENT_ID` | Application (client) ID | |
| `SSO_CLIENT_SECRET` | Client secret **value** | Keep it in the secret store |
| `SSO_PROVIDER_NAME` | `Microsoft` | Text on the button: "Sign in with Microsoft" |
| `APP_URL` | `https://mavericks-inventory.vercel.app` | Must match the redirect URI registered in Entra (without `/api/auth/sso/callback`) |
| `SSO_ALLOWED_EMAIL_DOMAINS` | `hexaware.com` | Optional extra guard; comma-separated |
| `SSO_ONLY` | `false` at first, `true` once everyone has moved | Hides passwords; administrators keep a fallback (13.6) |
| `SSO_AUTO_CREATE` | `true` (default) | Create accounts on first sign-in for people with an app role |
| `SSO_ROLES_FROM_IDP` | `true` (default) | Entra is the source of truth for roles. Set `false` to manage roles in the app instead |
| `SSO_ROLE_CLAIM` | `roles` (default) | Use `groups` to map Entra group IDs instead of app roles |
| `SSO_ROLE_MAP` | default maps `Inventory.Executive/Manager/Authority/Admin` | JSON to use other names, e.g. `{"GRP-Inv-Exec":"EXECUTIVE","GRP-Inv-Mgr":"MANAGER"}` or group object IDs |
| `SSO_SIGN_OUT_EVERYWHERE` | `false` (default) | `true` also signs the person out of Microsoft when they sign out of the app. Needs `APP_URL`, and `APP_URL/login` added as a redirect URI in Entra |
| `SSO_SCOPES` | `openid profile email` (default) | Rarely needs changing |

Other providers: same settings, different `SSO_ISSUER`. Okta: `https://YOUR-ORG.okta.com/oauth2/default`; Google: `https://accounts.google.com` (Google has no app roles, so set `SSO_AUTO_CREATE=false` and create users in the app; they're linked by email on first sign-in); Keycloak: `https://HOST/realms/REALM`.

**Check it:** open the sign-in page. It now shows **Sign in with Microsoft** above the password form.

![Sign-in page with SSO](screenshots/38-sign-in-with-sso.png)

### 13.5 Roll it out safely

1. **UAT first.** Register a second redirect URI for the UAT site, switch SSO on there, and have one person per role sign in. Check **Users & roles**: SSO users show "Signs in with company SSO", and the **Audit log** shows `USER.SSO_CREATE` and sign-ins "with Microsoft".
2. **Production, both ways on** (`SSO_ONLY=false`) for a week or two. Existing users are linked by email the first time they use the button.
3. **Production, SSO only** (`SSO_ONLY=true`). The password form disappears:

   ![SSO-only sign-in](screenshots/41-sso-only-sign-in.png)

4. Remove `BOOTSTRAP_ADMIN_PASSWORD`, keep two administrators, and record the client-secret expiry date.

### 13.6 Break-glass administrator access

If Entra is down or misconfigured, administrators can still get in: on the sign-in page select **Administrator sign-in without Microsoft** (or open `/login?local=1`) and use their app password. Only System Administrators can sign in this way when `SSO_ONLY=true`; everyone else is told to use the company sign-in. Keep the administrator passwords in the company password vault.

### 13.7 Try it without Azure (mock provider)

The repository includes a test identity provider that behaves like Entra for this app, so the team can try SSO on a laptop before IT has registered anything:

```bash
npm run mock-sso          # terminal 1: provider on http://localhost:4400
# terminal 2: the app, with demo data loaded
SSO_ISSUER=http://localhost:4400 SSO_CLIENT_ID=mavericks-inventory SSO_CLIENT_SECRET=mock-secret \
SSO_PROVIDER_NAME="Mock company login" npm run dev
```

Select **Sign in with Mock company login** and pick a test person: a new executive, a new manager, an existing user (linked by email), someone whose role changed, someone with no role (refused), or someone from another domain.

![Mock identity provider](screenshots/39-identity-provider.png)

`npm run sso-check` runs 15 automatic checks against it (new user, linking, role sync, refusals, cancelled sign-in, forged and tampered callbacks, SSO-only mode, break-glass). GitHub Actions runs them on every push.

**Never use the mock provider for a real deployment.** Anyone can pick anyone on its page.

### 13.8 SSO troubleshooting

| What you see | Cause | Fix |
| --- | --- | --- |
| Microsoft shows **AADSTS50011** "redirect URI … does not match" | The address registered in Entra differs from `APP_URL` + `/api/auth/sso/callback` | Make them identical, including `https://` and no trailing slash |
| Back on sign-in with "Company sign-in couldn't be completed" and **AADSTS7000215** in the logs | Wrong or expired client secret | Create a new secret, update `SSO_CLIENT_SECRET`, redeploy |
| "You don't have access to Mavericks Inventory yet" | No app role assigned to that person (or their group) | Assign a role in Enterprise applications → Users and groups |
| Microsoft shows **AADSTS50105** "not assigned to a role" | Assignment required = Yes, and the person isn't assigned | Same as above |
| "Your company account has no email address" | No `email` / `preferred_username` claim | Add the `email` optional claim (13.3 step 4) |
| "Your email domain isn't allowed" | `SSO_ALLOWED_EMAIL_DOMAINS` doesn't include their domain | Add the domain, or remove the setting |
| "The sign-in took too long" | More than 10 minutes on the Microsoft page, or cookies blocked | Start again; allow cookies for the site |
| "Company sign-in isn't set up correctly" | `SSO_ISSUER` is wrong (tenant ID typo, missing `/v2.0`) | Open `SSO_ISSUER` + `/.well-known/openid-configuration` in a browser; it must load and show the same `issuer` |
| Role in the app doesn't follow Entra | `SSO_ROLES_FROM_IDP=false`, or the role is assigned to a group the token doesn't include | Set it to `true`; for groups set `SSO_ROLE_CLAIM=groups` and map the group IDs in `SSO_ROLE_MAP` |

### 13.9 Where the code lives

| File | What it does |
| --- | --- |
| `src/lib/server/sso.ts` | Settings, provider discovery, building the sign-in request (state, nonce, PKCE), code exchange, ID-token verification, role mapping, error messages |
| `src/app/api/auth/sso/start/route.ts` | "Sign in with …" button target: sends the browser to the provider |
| `src/app/api/auth/sso/callback/route.ts` | Return address: verifies, finds/creates/links the user, syncs the role, audits, starts the session |
| `src/app/login/page.tsx` | Shows the button, SSO-only mode, the administrator fallback link and SSO error messages |
| `src/app/actions/auth.ts` | Password sign-in refuses non-admins when `SSO_ONLY=true`; sign-out can also end the Microsoft session |
| `src/lib/server/session.ts` | The session records whether the person used SSO (SSO users are never asked to change an app password) |
| `prisma/schema.prisma` + `prisma/migrations/20261026010000_sso_subject` | `User.ssoSubject`: the permanent link to the person's identity at the provider |
| `src/middleware.ts` | Lets the two SSO addresses through before sign-in |
| `scripts/mock-oidc.mjs`, `scripts/sso-check.mjs` | Test provider and automatic checks |

The full code of the three main files is in [section 15](#15-appendix-sso-code-reference).

---

## 14. Check a deployed site

### 14.1 Quick check by hand (10 minutes, demo data)

Open the site in a normal and a private browser window so you can be two people at once.

| # | As | Do | You should see |
| --- | --- | --- | --- |
| 1 | anyone | Open `/api/health` | `"status":"ok","db":"ok"` |
| 2 | Executive | Sign in (demo account) → **Stock** → open *Bluetooth Speaker* | Its **Available** number; note it |
| 3 | Executive | **Distributions → Record a distribution**: Bluetooth Speaker, quantity 2, any recipient → **Submit for approval** | Status **In review**; the speaker's Available number hasn't changed |
| 4 | Manager (private window) | **Approvals** → open the request → **Approve and update stock** → **Approve** | Status **Approved** |
| 5 | Executive | Open *Bluetooth Speaker* again | Available is 2 lower; the **Movement ledger** shows the distribution |
| 6 | Executive | **Distributions → Upload Excel** → **Download template**, fill two rows, upload | "2 of 2 rows saved", a draft to review |
| 7 | Manager | **Reports** → any report → **Excel** and **PDF** | Both files download and open |
| 8 | Administrator | **Users & roles → Add user** | A one-time password; signing in with it asks for a new password |

### 14.2 Full automatic check from GitHub (no tools on your computer)

1. GitHub → repository → **Actions** → **Check a deployed site** → **Run workflow**.
2. Paste the site address (e.g. `https://mavericks-inventory.vercel.app`), leave **screenshots** ticked → **Run workflow**.
3. After about 5 minutes the run turns green ✓ with "All 42 checks passed" in its summary. Download **deployed-site-screenshots** at the bottom of the run to see every page as it looks on the live site.

The site must have been deployed with `SEED_DEMO_DATA=true` (the test signs in with the demo accounts). The test creates sample requests, uploads and a user on the site, so run it against a **demo/UAT** deployment, not production.

From your own computer the same check is: `npx playwright install chromium` (once), then `BASE_URL=https://your-site npm run e2e`.

---

## 15. Appendix: SSO code reference

The complete source of the three main SSO files, as they are in the repository.

### `src/lib/server/sso.ts`

```ts
import "server-only"
import { createHash, randomBytes } from "crypto"
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"
import type { Role } from "@/lib/roles"

/**
 * Company single sign-on (OpenID Connect, authorization-code flow with PKCE).
 *
 * Works with Microsoft Entra ID (Azure AD), Okta, Google Workspace, Ping, Keycloak, Auth0 —
 * anything that publishes /.well-known/openid-configuration. It is OFF unless SSO_ISSUER,
 * SSO_CLIENT_ID and SSO_CLIENT_SECRET are set. See docs/SETUP-AND-DEPLOYMENT.md §13.
 */

const DEFAULT_ROLE_MAP: Record<string, Role> = {
  "Inventory.Executive": "EXECUTIVE",
  "Inventory.Manager": "MANAGER",
  "Inventory.Authority": "AUTHORITY",
  "Inventory.Admin": "ADMIN",
}
// If someone holds several roles, the most senior one wins.
const ROLE_RANK: Role[] = ["ADMIN", "AUTHORITY", "MANAGER", "EXECUTIVE"]

export type SsoConfig = {
  issuer: string
  clientId: string
  clientSecret: string
  providerName: string
  scopes: string
  roleClaim: string
  roleMap: Record<string, Role>
  autoCreate: boolean
  rolesFromIdp: boolean
  ssoOnly: boolean
  allowedDomains: string[]
  signOutEverywhere: boolean
  appUrl: string | null
}

const bool = (v: string | undefined, dflt: boolean) => (v === undefined || v === "" ? dflt : v.toLowerCase() === "true")

export function ssoConfig(): SsoConfig | null {
  const issuer = process.env.SSO_ISSUER?.trim().replace(/\/+$/, "")
  const clientId = process.env.SSO_CLIENT_ID?.trim()
  const clientSecret = process.env.SSO_CLIENT_SECRET?.trim()
  if (!issuer || !clientId || !clientSecret) return null
  let roleMap = DEFAULT_ROLE_MAP
  if (process.env.SSO_ROLE_MAP) {
    try {
      roleMap = JSON.parse(process.env.SSO_ROLE_MAP)
    } catch {
      console.error("SSO_ROLE_MAP is not valid JSON; using the default Inventory.* role names")
    }
  }
  return {
    issuer,
    clientId,
    clientSecret,
    providerName: process.env.SSO_PROVIDER_NAME?.trim() || "Microsoft",
    scopes: process.env.SSO_SCOPES?.trim() || "openid profile email",
    roleClaim: process.env.SSO_ROLE_CLAIM?.trim() || "roles",
    roleMap,
    autoCreate: bool(process.env.SSO_AUTO_CREATE, true),
    rolesFromIdp: bool(process.env.SSO_ROLES_FROM_IDP, true),
    ssoOnly: bool(process.env.SSO_ONLY, false),
    allowedDomains: (process.env.SSO_ALLOWED_EMAIL_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean),
    signOutEverywhere: bool(process.env.SSO_SIGN_OUT_EVERYWHERE, false),
    appUrl: process.env.APP_URL?.trim().replace(/\/+$/, "") || null,
  }
}

// ---------- provider metadata (cached per server instance) ----------

type Metadata = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string; end_session_endpoint?: string }
let metaCache: { issuer: string; at: number; meta: Metadata } | null = null
let jwks: { uri: string; set: ReturnType<typeof createRemoteJWKSet> } | null = null

export async function providerMetadata(cfg: SsoConfig): Promise<Metadata> {
  if (metaCache && metaCache.issuer === cfg.issuer && Date.now() - metaCache.at < 3600_000) return metaCache.meta
  const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, { cache: "no-store" })
  if (!res.ok) throw new SsoError("provider_unreachable", `Discovery returned ${res.status}`)
  const meta = (await res.json()) as Metadata
  if (meta.issuer.replace(/\/+$/, "") !== cfg.issuer) throw new SsoError("provider_misconfigured", `Issuer mismatch: ${meta.issuer}`)
  metaCache = { issuer: cfg.issuer, at: Date.now(), meta }
  return meta
}

function keySet(uri: string) {
  if (!jwks || jwks.uri !== uri) jwks = { uri, set: createRemoteJWKSet(new URL(uri)) }
  return jwks.set
}

// ---------- the round trip ----------

export class SsoError extends Error {
  constructor(public code: string, detail?: string) {
    super(detail ?? code)
  }
}

const b64url = (b: Buffer) => b.toString("base64url")
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "")
export const SSO_COOKIE = "mi_sso"

/** Where the provider sends people back. Must match the redirect URI registered with the provider. */
export function redirectUri(cfg: SsoConfig, requestUrl: string, headers: Headers) {
  if (cfg.appUrl) return `${cfg.appUrl}/api/auth/sso/callback`
  const u = new URL(requestUrl)
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? u.host
  const proto = headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "")
  return `${proto}://${host}/api/auth/sso/callback`
}

/** Builds the provider sign-in URL and a short-lived signed cookie holding state, nonce and the PKCE verifier. */
export async function beginSignIn(cfg: SsoConfig, redirect: string, next: string) {
  const meta = await providerMetadata(cfg)
  const state = b64url(randomBytes(24))
  const nonce = b64url(randomBytes(24))
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash("sha256").update(verifier).digest())
  const cookie = await new SignJWT({ state, nonce, verifier, next, redirect })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret())
  const url = new URL(meta.authorization_endpoint)
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: redirect,
    scope: cfg.scopes,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString()
  return { url: url.toString(), cookie }
}

export type SsoIdentity = { subject: string; email: string; name: string; employeeId: string | null; role: Role | null; rawRoles: string[] }

/** Validates the callback, exchanges the code and verifies the ID token. */
export async function completeSignIn(cfg: SsoConfig, params: URLSearchParams, cookie: string | undefined): Promise<{ identity: SsoIdentity; next: string }> {
  if (params.get("error")) throw new SsoError("provider_error", `${params.get("error")}: ${params.get("error_description") ?? ""}`)
  if (!cookie) throw new SsoError("session_expired")
  let saved: JWTPayload & { state?: string; nonce?: string; verifier?: string; next?: string; redirect?: string }
  try {
    saved = (await jwtVerify(cookie, secret())).payload
  } catch {
    throw new SsoError("session_expired")
  }
  const code = params.get("code")
  if (!code || !params.get("state") || params.get("state") !== saved.state) throw new SsoError("state_mismatch")

  const meta = await providerMetadata(cfg)
  const res = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: saved.redirect!,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code_verifier: saved.verifier!,
    }),
    cache: "no-store",
  })
  const tokens = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string }
  if (!res.ok || !tokens.id_token) throw new SsoError("token_exchange_failed", `${tokens.error ?? res.status} ${tokens.error_description ?? ""}`)

  let claims: JWTPayload & Record<string, unknown>
  try {
    claims = (await jwtVerify(tokens.id_token, keySet(meta.jwks_uri), { issuer: meta.issuer, audience: cfg.clientId, clockTolerance: 60 })).payload
  } catch (e) {
    throw new SsoError("invalid_token", e instanceof Error ? e.message : undefined)
  }
  if (claims.nonce !== saved.nonce) throw new SsoError("invalid_token", "nonce mismatch")

  const email = String(claims.email ?? claims.preferred_username ?? claims.upn ?? "").trim().toLowerCase()
  if (!email.includes("@")) throw new SsoError("no_email")
  if (cfg.allowedDomains.length && !cfg.allowedDomains.includes(email.split("@")[1])) throw new SsoError("domain_not_allowed")

  const raw = claims[cfg.roleClaim]
  const rawRoles = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String)
  const mapped = rawRoles.map((r) => cfg.roleMap[r]).filter(Boolean) as Role[]
  const role = ROLE_RANK.find((r) => mapped.includes(r)) ?? null

  const name = String(claims.name ?? [claims.given_name, claims.family_name].filter(Boolean).join(" ") ?? "").trim() || email.split("@")[0]
  const employeeId = claims.employeeid ?? claims.employee_id ?? claims.employeeId
  const next = typeof saved.next === "string" && saved.next.startsWith("/") && !saved.next.startsWith("//") ? saved.next : "/"
  return {
    identity: { subject: `${meta.issuer}|${claims.sub}`, email, name, employeeId: employeeId ? String(employeeId) : null, role, rawRoles },
    next,
  }
}

export async function endSessionUrl(cfg: SsoConfig, postLogout: string) {
  if (!cfg.signOutEverywhere) return null
  const meta = await providerMetadata(cfg).catch(() => null)
  if (!meta?.end_session_endpoint) return null
  const u = new URL(meta.end_session_endpoint)
  u.searchParams.set("post_logout_redirect_uri", postLogout)
  u.searchParams.set("client_id", cfg.clientId)
  return u.toString()
}

/** Messages shown on the sign-in page for ?sso_error=… */
export const SSO_ERROR_TEXT: Record<string, string> = {
  provider_error: "Company sign-in was cancelled or refused. Try again, or contact the administrator.",
  provider_unreachable: "The company sign-in service can't be reached right now. Try again in a few minutes.",
  provider_misconfigured: "Company sign-in isn't set up correctly. Contact the administrator.",
  session_expired: "The sign-in took too long. Start again.",
  state_mismatch: "The sign-in couldn't be verified. Start again from this page.",
  token_exchange_failed: "Company sign-in couldn't be completed. Contact the administrator if this keeps happening.",
  invalid_token: "Company sign-in couldn't be verified. Contact the administrator.",
  no_email: "Your company account has no email address. Contact the administrator.",
  domain_not_allowed: "Your email domain isn't allowed to use this app.",
  no_access: "You don't have access to Mavericks Inventory yet. Ask the administrator to assign you a role.",
  inactive: "Your account is deactivated. Contact the administrator.",
  disabled: "Company sign-in isn't switched on.",
}
```

### `src/app/api/auth/sso/start/route.ts`

```ts
import { NextResponse } from "next/server"
import { SSO_COOKIE, SsoError, beginSignIn, redirectUri, ssoConfig } from "@/lib/server/sso"

export const dynamic = "force-dynamic"

/** Step 1 of company sign-in: send the browser to the identity provider. */
export async function GET(req: Request) {
  const cfg = ssoConfig()
  const login = (code: string) => NextResponse.redirect(new URL(`/login?sso_error=${code}`, req.url))
  if (!cfg) return login("disabled")
  const next = new URL(req.url).searchParams.get("next") ?? "/"
  try {
    const { url, cookie } = await beginSignIn(cfg, redirectUri(cfg, req.url, req.headers), next)
    const res = NextResponse.redirect(url)
    res.cookies.set(SSO_COOKIE, cookie, {
      httpOnly: true,
      sameSite: "lax", // the provider returns with a top-level GET, which lax cookies survive
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/sso",
      maxAge: 600,
    })
    return res
  } catch (e) {
    console.error("SSO start failed:", e)
    return login(e instanceof SsoError ? e.code : "provider_unreachable")
  }
}
```

### `src/app/api/auth/sso/callback/route.ts`

```ts
import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { audit } from "@/lib/server/audit"
import { createSession } from "@/lib/server/session"
import { SSO_COOKIE, SsoError, completeSignIn, ssoConfig, type SsoIdentity } from "@/lib/server/sso"

export const dynamic = "force-dynamic"

/**
 * Step 2 of company sign-in: the provider sends the browser back here with a one-time code.
 * We verify it, find or create the person, keep their role in step with the provider, and start a session.
 */
export async function GET(req: Request) {
  const cfg = ssoConfig()
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`/login?sso_error=${code}`, req.url))
    res.cookies.delete({ name: SSO_COOKIE, path: "/api/auth/sso" })
    return res
  }
  if (!cfg) return fail("disabled")

  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|; )${SSO_COOKIE}=([^;]+)`))?.[1]
  let identity: SsoIdentity, next: string
  try {
    ;({ identity, next } = await completeSignIn(cfg, new URL(req.url).searchParams, cookie))
  } catch (e) {
    console.error("SSO callback failed:", e instanceof Error ? e.message : e)
    return fail(e instanceof SsoError ? e.code : "token_exchange_failed")
  }

  // Find the person: first by their SSO identity, then by email (links an existing account on first SSO sign-in).
  let user =
    (await prisma.user.findUnique({ where: { ssoSubject: identity.subject } })) ??
    (await prisma.user.findFirst({ where: { email: { equals: identity.email, mode: "insensitive" } } }))

  if (!user) {
    if (!cfg.autoCreate || !identity.role) {
      await audit(prisma, { action: "USER.SSO_DENIED", entity: "User", summary: `SSO sign-in refused for ${identity.email}: no app role assigned (${identity.rawRoles.join(", ") || "none"})` })
      return fail("no_access")
    }
    user = await prisma.user.create({
      data: {
        empId: identity.employeeId ?? `SSO-${randomBytes(4).toString("hex").toUpperCase()}`,
        name: identity.name,
        email: identity.email,
        role: identity.role,
        ssoSubject: identity.subject,
        // Random, never shared: SSO users don't sign in with a password unless an admin resets one.
        passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
      },
    })
    await audit(prisma, { actorId: user.id, action: "USER.SSO_CREATE", entity: "User", entityId: user.id, summary: `Account created on first company sign-in for ${user.name} (${user.role})` })
  }
  if (!user.active) return fail("inactive")

  const updates: { ssoSubject?: string; role?: typeof user.role; lastLoginAt: Date } = { lastLoginAt: new Date() }
  if (user.ssoSubject !== identity.subject) updates.ssoSubject = identity.subject
  if (cfg.rolesFromIdp && identity.role && identity.role !== user.role) {
    await audit(prisma, { actorId: user.id, action: "USER.SSO_ROLE_SYNC", entity: "User", entityId: user.id, summary: `Role changed from ${user.role} to ${identity.role} by the identity provider`, before: { role: user.role }, after: { role: identity.role } })
    updates.role = identity.role
  }
  user = await prisma.user.update({ where: { id: user.id }, data: updates })
  await audit(prisma, { actorId: user.id, action: "USER.LOGIN", entity: "User", entityId: user.id, summary: `${user.name} signed in with ${cfg.providerName}` })

  await createSession({ id: user.id, role: user.role }, "sso")
  const res = NextResponse.redirect(new URL(next, req.url))
  res.cookies.delete({ name: SSO_COOKIE, path: "/api/auth/sso" })
  return res
}
```

### Settings to add (copy into `.env` or the platform's environment settings)

```bash
SSO_ISSUER="https://login.microsoftonline.com/<tenant-id>/v2.0"
SSO_CLIENT_ID="<application-client-id>"
SSO_CLIENT_SECRET="<client-secret-value>"
SSO_PROVIDER_NAME="Microsoft"
APP_URL="https://mavericks-inventory.vercel.app"
SSO_ALLOWED_EMAIL_DOMAINS="hexaware.com"
SSO_ONLY="false"
# Optional (defaults shown)
# SSO_AUTO_CREATE="true"
# SSO_ROLES_FROM_IDP="true"
# SSO_ROLE_CLAIM="roles"
# SSO_ROLE_MAP='{"Inventory.Executive":"EXECUTIVE","Inventory.Manager":"MANAGER","Inventory.Authority":"AUTHORITY","Inventory.Admin":"ADMIN"}'
# SSO_SIGN_OUT_EVERYWHERE="false"
```

### Database change

```sql
-- prisma/migrations/20261026010000_sso_subject/migration.sql (applied automatically on deploy)
ALTER TABLE "User" ADD COLUMN "ssoSubject" TEXT;
CREATE UNIQUE INDEX "User_ssoSubject_key" ON "User"("ssoSubject");
```
