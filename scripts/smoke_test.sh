#!/usr/bin/env bash
# End-to-end smoke test for loadedout.online (or any deployment).
# Creates a throwaway user, exercises every critical flow, reports pass/fail.
#
# Usage:
#   ./scripts/smoke_test.sh                       # against production
#   BASE=http://localhost:8086 ./scripts/smoke_test.sh   # against staging
#   SKIP_AI=1 ./scripts/smoke_test.sh             # skip slow AI calls
#
# Cleanup of the throwaway user (run on the VM):
#   docker exec infra-db-1 psql -U lifeplan_user -d lifeplan_db -c \
#     "DELETE FROM meal_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'smoke_%');
#      DELETE FROM workout_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'smoke_%');
#      DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'smoke_%');
#      DELETE FROM users WHERE username LIKE 'smoke_%';"
set -u

BASE="${BASE:-https://loadedout.online}"
API="$BASE/api/v1"
TS=$(date +%s)
USER="smoke_$TS"
PASS_COUNT=0
FAIL_COUNT=0
TOKEN=""

check() { # check <name> <expected_code> <actual_code> [body]
  if [ "$2" = "$3" ]; then
    PASS_COUNT=$((PASS_COUNT+1)); echo "PASS  $1"
  else
    FAIL_COUNT=$((FAIL_COUNT+1)); echo "FAIL  $1 (expected HTTP $2, got $3) ${4:-}" | head -c 300; echo
  fi
}

req() { # req <method> <path> <data-or-empty> -> sets CODE and BODY
  local auth=()
  [ -n "$TOKEN" ] && auth=(-H "Authorization: Bearer $TOKEN")
  if [ -n "$3" ]; then
    BODY=$(curl -s -X "$1" "$API$2" -H 'Content-Type: application/json' "${auth[@]}" -d "$3" -w $'\n%{http_code}')
  else
    BODY=$(curl -s -X "$1" "$API$2" "${auth[@]}" -w $'\n%{http_code}')
  fi
  CODE=$(echo "$BODY" | tail -1)
  BODY=$(echo "$BODY" | sed '$d')
}

json() { echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }

echo "== Smoke test against $BASE =="

req GET /health ""
check "health endpoint" 200 "$CODE"

req POST /auth/register "{\"username\":\"$USER\",\"email\":\"$USER@test.local\",\"password\":\"Smoke1234\"}"
check "register" 200 "$CODE" "$BODY"
TOKEN=$(json "['access_token']")
REFRESH=$(json "['refresh_token']")
[ -n "$TOKEN" ] || { echo "ABORT: no token"; exit 1; }

req POST /auth/login "{\"username\":\"$USER\",\"password\":\"wrong\"}"
check "login rejects bad password" 401 "$CODE"

req POST /auth/refresh "{\"refresh_token\":\"$REFRESH\"}"
check "refresh rotation" 200 "$CODE"
TOKEN=$(json "['access_token']")

req GET /user/profile ""
check "profile" 200 "$CODE"

TODAY=$(date +%F)
req POST /meals/log "{\"name\":\"Smoke meal\",\"meal_type\":\"lunch\",\"calories\":500,\"protein_g\":40,\"date\":\"$TODAY\"}"
check "log meal with date" 200 "$CODE" "$BODY"

req GET "/meals/today?date=$TODAY" ""
check "meals today by date" 200 "$CODE"
COUNT=$(json "['totals']['meals_count']")
check "meal visible in today" 1 "${COUNT:-0}"

req POST /workout/ "{\"workout_type\":\"strength\",\"duration_minutes\":45,\"intensity\":\"moderate\",\"date\":\"$TODAY\",\"details\":{\"exercises\":[{\"name\":\"Bench Press\",\"sets\":[{\"reps\":8,\"weight_kg\":80}]}]}}"
check "save workout with details" 200 "$CODE" "$BODY"

req GET "/workout/?days=7" ""
check "list workouts" 200 "$CODE"

req POST /workout/prs "{\"exercise_name\":\"Bench Press\",\"weight_kg\":80,\"reps\":8,\"date\":\"$TODAY\"}"
check "upsert PR" 200 "$CODE"

req GET "/food/search?q=banana" ""
check "food search" 200 "$CODE"

req GET "/food/barcode/3017620422003" ""
check "barcode lookup (nutella)" 200 "$CODE"

if [ -z "${SKIP_AI:-}" ]; then
  req POST /meals/log-manual "{\"description\":\"2 eggs and toast\",\"meal_type\":\"breakfast\"}"
  check "AI macro estimation" 200 "$CODE" "$BODY"

  req POST /workout/analyze "{\"workout_type\":\"running\",\"duration_minutes\":30,\"intensity\":\"light\",\"description\":\"easy jog\"}"
  check "AI workout analysis" 200 "$CODE" "$BODY"

  req POST /ai/chat "{\"message\":\"Quick high protein snack idea, one line\"}"
  check "AI chat" 200 "$CODE" "$BODY"
fi

echo
echo "== $PASS_COUNT passed, $FAIL_COUNT failed (test user: $USER) =="
exit $([ "$FAIL_COUNT" -eq 0 ] && echo 0 || echo 1)
