#!/usr/bin/env bash
# Health monitor for loadedout.online — alerts via ntfy.sh and auto-restarts
# the stack after repeated failures.
# Cron: */5 * * * * /home/pehlacloud/projects/loaded-out/infra/healthcheck.sh >> /home/pehlacloud/backups/loadedout/health.log 2>&1
set -u

URL="https://loadedout.online/api/v1/health"
NTFY_TOPIC="loadedout-alerts-pehlacloud-x7k2"   # subscribe at https://ntfy.sh/loadedout-alerts-pehlacloud-x7k2
STATE_FILE="/tmp/loadedout_health_failcount"
COMPOSE_DIR="/home/pehlacloud/projects/loaded-out/infra"

notify() {
  curl -s -m 10 -H "Title: LoadedOut health" -d "$1" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null || true
}

code=$(curl -s -o /dev/null -m 15 -w "%{http_code}" "$URL" || echo "000")

if [ "$code" = "200" ]; then
  # Recovered? announce once
  if [ -f "$STATE_FILE" ] && [ "$(cat "$STATE_FILE")" -ge 2 ]; then
    notify "Recovered: $URL is healthy again"
    echo "[$(date -Is)] recovered"
  fi
  rm -f "$STATE_FILE"
  exit 0
fi

fails=$(( $( [ -f "$STATE_FILE" ] && cat "$STATE_FILE" || echo 0 ) + 1 ))
echo "$fails" > "$STATE_FILE"
echo "[$(date -Is)] health check failed (HTTP $code), consecutive=$fails"

if [ "$fails" -eq 2 ]; then
  notify "DOWN: $URL returned HTTP $code twice in a row"
fi

# After 3 consecutive failures (~15 min) attempt a restart, once
if [ "$fails" -eq 3 ]; then
  notify "Attempting automatic restart of loaded-out stack"
  cd "$COMPOSE_DIR" && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d >/dev/null 2>&1
fi
