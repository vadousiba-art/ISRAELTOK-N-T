#!/usr/bin/env bash
# Restart the local demo-mode server on :3200 with a fresh embedded database.
cd "$(dirname "$0")/../.."
for p in $(pgrep -f "next-server"); do kill "$p"; done
sleep 2
rm -rf .data-promo03
DEMO_MODE=true DEMO_DATA_DIR=.data-promo03 ANTHROPIC_API_KEY= nohup npx next start -p 3200 > /tmp/yoru-promo03-server.log 2>&1 &
for i in $(seq 1 60); do curl -sf localhost:3200/api/health >/dev/null && break; sleep 1; done
curl -s localhost:3200/api/health; echo
