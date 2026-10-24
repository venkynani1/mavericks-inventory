# Deploying Mavericks Inventory

The app is a standard Next.js server plus a PostgreSQL database. Pick the platform the business prefers; the code is the same.

| Setting | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string (pooled, if your provider offers pooling) |
| `DIRECT_URL` | Yes | Direct, non-pooled connection used for migrations. Same as `DATABASE_URL` when there's no pooler |
| `AUTH_SECRET` | Yes | 32+ random characters: `openssl rand -base64 48`. Changing it signs everyone out |
| `DEMO_MODE` | No | `true` shows demo accounts on the sign-in page. Keep `false` in production |
| `SEED_PASSWORD` | No | Password for seeded demo users |

After the first deploy, load data once from any machine that can reach the database:

```bash
DATABASE_URL="…" DIRECT_URL="…" npm run db:seed
```

Health check for load balancers and monitors: `GET /api/health` (returns 503 if the database is unreachable).

---

## Option 1 — Vercel + Neon

1. Create a Neon project (region **AWS ap-south-1 / Mumbai**). Copy the **pooled** and **direct** connection strings.
2. In Vercel, **Add New → Project → Import** the `mavericks-inventory` GitHub repository. Framework is detected as Next.js.
3. Add the environment variables above (`DATABASE_URL` = pooled, `DIRECT_URL` = direct).
4. Deploy. `vercel.json` runs `npm run vercel-build`, which applies migrations before building, and pins functions to the Mumbai region (`bom1`).
5. Run the seed once (see above), sign in, and change the demo passwords.

Vercel Postgres works the same way (it's Neon underneath).

---

## Option 2 — AWS

### Database
Create **Amazon RDS for PostgreSQL 16** (or Aurora PostgreSQL) in `ap-south-1`, private subnets, encryption on, automated backups 7+ days. Use the same URL for `DATABASE_URL` and `DIRECT_URL` with `?sslmode=require`.

### App — App Runner (simplest)
```bash
aws ecr create-repository --repository-name mavericks-inventory
docker build -t mavericks-inventory .
docker tag mavericks-inventory:latest <account>.dkr.ecr.ap-south-1.amazonaws.com/mavericks-inventory:latest
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.ap-south-1.amazonaws.com
docker push <account>.dkr.ecr.ap-south-1.amazonaws.com/mavericks-inventory:latest
```
Create an App Runner service from the image: port **3000**, health check path `/api/health`, a **VPC connector** to reach RDS, and the environment variables (store `AUTH_SECRET` and `DATABASE_URL` in **Secrets Manager**). Migrations run automatically on container start (`RUN_MIGRATIONS=true` by default).

### App — ECS Fargate (more control)
Same image in ECR; task definition with port 3000, secrets from Secrets Manager, an Application Load Balancer target group with health check `/api/health`, and an ACM certificate on the HTTPS listener. Run at least 2 tasks across AZs for the 99.5% availability target.

---

## Option 3 — Azure

### Database
Create **Azure Database for PostgreSQL – Flexible Server** (16) in Central India, with private access (VNet) or firewall rules, and high availability if required. Connection string ends with `?sslmode=require`.

### App — App Service for Containers
```bash
az acr create -g rg-mavericks -n mavericksacr --sku Basic
az acr build -r mavericksacr -t mavericks-inventory:latest .
az appservice plan create -g rg-mavericks -n plan-mavericks --is-linux --sku P1v3
az webapp create -g rg-mavericks -p plan-mavericks -n mavericks-inventory \
  --deployment-container-image-name mavericksacr.azurecr.io/mavericks-inventory:latest
az webapp config appsettings set -g rg-mavericks -n mavericks-inventory --settings \
  WEBSITES_PORT=3000 DATABASE_URL="…" DIRECT_URL="…" AUTH_SECRET="@Microsoft.KeyVault(SecretUri=…)"
az webapp config set -g rg-mavericks -n mavericks-inventory --generic-configurations '{"healthCheckPath": "/api/health"}'
```
Keep secrets in **Key Vault** with Key Vault references, enable VNet integration to reach the private database, and put **Front Door** or Application Gateway (WAF) in front for internet exposure.

### App — Container Apps
`az containerapp up --source . --target-port 3000 --ingress external` with the same environment variables; add a health probe on `/api/health` and set min replicas to 1 so there's no cold start.

---

## Hexaware environment / on-premises

Any host that runs Docker can run the image. Point it at an internal PostgreSQL, terminate TLS at your reverse proxy, and restrict the URL to the corporate network or VPN. For SSO (Azure AD / Entra ID), the session layer in `src/lib/server/session.ts` is the single place to swap credentials sign-in for OIDC.

## Production checklist

- [ ] `DEMO_MODE=false`, demo users deactivated or passwords changed
- [ ] Strong `AUTH_SECRET` from a secret store
- [ ] Database backups and point-in-time restore enabled
- [ ] HTTPS only; WAF or rate limiting in front of `/login`
- [ ] At least one real System Administrator account created
- [ ] Approval rules reviewed (Admin → Approval rules)
