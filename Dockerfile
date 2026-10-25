# Mavericks Inventory — production image for AWS (App Runner / ECS Fargate), Azure (App Service / Container Apps)
# or any Docker host. Build: docker build --platform linux/amd64 -t mavericks-inventory .
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV STANDALONE=true NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

# The trimmed server bundle doesn't include the Prisma CLI's own dependencies,
# so the migration tool gets a complete install of its own.
FROM base AS prisma-cli
WORKDIR /opt/prisma-cli
COPY package.json /tmp/app-package.json
RUN npm init -y >/dev/null && npm install --no-audit --no-fund "prisma@$(node -p "require('/tmp/app-package.json').dependencies.prisma")"

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd -g 1001 app && useradd -u 1001 -g app -m app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=prisma-cli --chown=app:app /opt/prisma-cli /opt/prisma-cli
COPY --chown=app:app docker-entrypoint.sh ./
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
