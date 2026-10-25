#!/bin/sh
set -e
# Create or update tables before starting. Only pending migrations run; existing data is never dropped.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma
fi
exec node server.js
