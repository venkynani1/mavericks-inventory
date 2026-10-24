#!/bin/sh
set -e
# Apply pending migrations before starting (safe to run on every boot).
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node node_modules/prisma/build/index.js migrate deploy
fi
exec node server.js
