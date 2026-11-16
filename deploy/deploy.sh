#!/usr/bin/env bash
# Deploys the latest pushed commit on main to the live server. Only committed, tested code goes live.
# Production runs from its own checkout (/opt/ajaia-docs); data lives in /var/lib/ajaia-docs.
set -euo pipefail
APP_DIR=/opt/ajaia-docs
URL=https://ajaia.169-58-1-250.sslip.io

cd "$APP_DIR"
git fetch --quiet origin main
git reset --hard --quiet origin/main
echo "Deploying $(git log --oneline -1)"
npm ci --silent
npm test --silent
npm run build --silent
systemctl restart ajaia-docs
for i in {1..20}; do
  if curl -fsS "$URL/api/users" > /dev/null; then echo "Live: $URL"; exit 0; fi
  sleep 0.5
done
echo "Health check failed" >&2
journalctl -u ajaia-docs -n 20 --no-pager >&2
exit 1
