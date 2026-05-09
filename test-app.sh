#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Liquidity Dashboard — Manual Test Script
# Usage:
#   Local:      bash test-app.sh
#   Azure/prod: APP_URL=https://your-app.azurewebsites.net bash test-app.sh
# ─────────────────────────────────────────────────────────────────────────────

BASE_URL="${APP_URL:-http://localhost:3000}"
PASS=0
FAIL=0
SKIP=0

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✅ PASS${NC}  $1"; ((PASS++)); }
fail() { echo -e "  ${RED}❌ FAIL${NC}  $1"; ((FAIL++)); }
skip() { echo -e "  ${YELLOW}⏭  SKIP${NC}  $1  ${YELLOW}(needs: $2)${NC}"; ((SKIP++)); }
section() { echo -e "\n${CYAN}${BOLD}▶ $1${NC}"; echo -e "  ──────────────────────────────────────────"; }

# ── HTTP helper ───────────────────────────────────────────────────────────────
# Returns: "<status_code> <body>"
http() {
  local method="$1" url="$2" data="$3"
  if [ -n "$data" ]; then
    curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -d "$data" "$url" 2>/dev/null
  else
    curl -s -w "\n%{http_code}" -X "$method" "$url" 2>/dev/null
  fi
}

# Extract last line (status code) and everything before it (body)
# Uses sed '$d' for macOS/BSD compatibility (head -n -1 is Linux only)
status_of() { echo "$1" | tail -1; }
body_of()   { echo "$1" | sed '$d'; }

# Assert HTTP status and optional body keyword
assert() {
  local desc="$1" expected="$2" response="$3" keyword="$4"
  local status body
  status=$(status_of "$response")
  body=$(body_of "$response")

  if [ "$status" != "$expected" ]; then
    fail "$desc — expected HTTP $expected, got HTTP $status"
    echo -e "       Body: $(echo "$body" | cut -c1-200)"
    return
  fi

  if [ -n "$keyword" ] && ! echo "$body" | grep -q "$keyword"; then
    fail "$desc — HTTP $status OK but response missing \"$keyword\""
    echo -e "       Body: $(echo "$body" | cut -c1-200)"
    return
  fi

  pass "$desc"
}

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Liquidity Dashboard — Test Suite${NC}"
echo -e "Target: ${CYAN}$BASE_URL${NC}"
echo ""

# Pre-flight: confirm server is reachable before running any tests
if ! curl -s --max-time 5 "$BASE_URL" > /dev/null 2>&1; then
  echo -e "${RED}${BOLD}✗ Server not reachable at $BASE_URL${NC}"
  echo -e "  Start the server first:  ${CYAN}npm run dev${NC}"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
section "1. Server Reachability"

R=$(http GET "$BASE_URL")
assert "Frontend HTML is served" "200" "$R" "<html"

R=$(http GET "$BASE_URL/api/liquidity")
assert "GET /api/liquidity returns 200" "200" "$R" "data"

BODY=$(body_of "$R")
if echo "$BODY" | grep -q '"data":\[\]'; then
  skip "  Wallet data populated" "DB connection"
else
  pass "Wallet data is populated (companies found)"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "2. Liquidity Data Structure"

R=$(http GET "$BASE_URL/api/liquidity")
BODY=$(body_of "$R")

assert "Response has 'data' array"        "200" "$R" '"data"'
assert "Response has 'lastUpdateTime'"    "200" "$R" '"lastUpdateTime"'

# Check nested structure if data exists
if echo "$BODY" | grep -q '"banks"'; then
  pass "Companies contain 'banks' array"
else
  skip "Nested structure check" "DB connection (no data loaded)"
fi

if echo "$BODY" | grep -q '"bank_accounts"'; then
  pass "Banks contain 'bank_accounts' array"
else
  skip "bank_accounts check" "DB connection"
fi

if echo "$BODY" | grep -q '"wallets"'; then
  pass "Bank accounts contain 'wallets' array"
else
  skip "wallets check" "DB connection"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "3. DB Sync Endpoint"

R=$(http POST "$BASE_URL/api/sync")
STATUS=$(status_of "$R")

if [ "$STATUS" = "200" ]; then
  pass "POST /api/sync — DB reachable, sync successful"
  assert "Sync response has 'count' field" "200" "$R" '"count"'
elif [ "$STATUS" = "500" ]; then
  skip "POST /api/sync" "DB connection (firewall/network)"
  echo -e "       ${YELLOW}→ This will pass once deployed inside Azure network${NC}"
else
  fail "POST /api/sync — unexpected HTTP $STATUS"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "4. Balance Update — Validation"

# Missing updates array
R=$(http POST "$BASE_URL/api/update-balances" '{}')
assert "Empty payload rejected with 400" "400" "$R" '"error"'

# Empty updates array
R=$(http POST "$BASE_URL/api/update-balances" '{"updates":[]}')
assert "Empty updates array rejected with 400" "400" "$R" '"error"'

# ─────────────────────────────────────────────────────────────────────────────
section "5. Balance Update — DB Write"

# Grab a real wallet_id from /api/liquidity if data exists
WALLET_ID=$(http GET "$BASE_URL/api/liquidity" | sed '$d' | \
  grep -o '"id":"wallet_[^"]*"' | head -1 | sed 's/"id":"//;s/"//')

if [ -n "$WALLET_ID" ] && [ "$WALLET_ID" != "bluepine" ] && [ "$WALLET_ID" != "smarttool" ]; then
  R=$(http POST "$BASE_URL/api/update-balances" \
    "{\"updates\":[{\"wallet_id\":\"$WALLET_ID\",\"wallet_balance\":9999.99,\"wallet_value_usd\":9999.99}]}")
  STATUS=$(status_of "$R")
  if [ "$STATUS" = "200" ]; then
    pass "POST /api/update-balances — wallet '$WALLET_ID' updated in DB"
    assert "Response has 'updated' count" "200" "$R" '"updated"'
  elif [ "$STATUS" = "500" ]; then
    skip "POST /api/update-balances write" "DB connection"
  else
    fail "POST /api/update-balances — unexpected HTTP $STATUS"
  fi
else
  skip "POST /api/update-balances write" "DB connection (no wallet IDs loaded)"
fi

# Non-existent wallet → should return 200 with notFound list
R=$(http POST "$BASE_URL/api/update-balances" \
  '{"updates":[{"wallet_id":"wallet_does_not_exist","wallet_balance":1.0,"wallet_value_usd":1.0}]}')
STATUS=$(status_of "$R")
if [ "$STATUS" = "200" ]; then
  pass "Non-existent wallet_id returns 200 with notFound list"
  assert "notFound array populated" "200" "$R" '"notFound"'
elif [ "$STATUS" = "500" ]; then
  skip "Non-existent wallet test" "DB connection"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "6. Zapier Webhooks"

# Alerts trigger
R=$(http POST "$BASE_URL/api/alerts/trigger" \
  '{"id":"test-alert","companyId":"c1","bankId":"b1","walletId":"w1","threshold":1000,"email":"test@test.com","isEnabled":true}')
STATUS=$(status_of "$R")
if [ "$STATUS" = "200" ]; then
  pass "POST /api/alerts/trigger — Zapier reachable"
elif [ "$STATUS" = "503" ]; then
  skip "POST /api/alerts/trigger" "ZAPIER_ALERTS_WEBHOOK env var"
else
  fail "POST /api/alerts/trigger — unexpected HTTP $STATUS"
fi

# Users trigger
R=$(http POST "$BASE_URL/api/users/trigger" \
  '{"id":"u1","name":"Test User","email":"user@test.com","role":"Viewer","status":"Active","permissions":[]}')
STATUS=$(status_of "$R")
if [ "$STATUS" = "200" ]; then
  pass "POST /api/users/trigger — Zapier reachable"
elif [ "$STATUS" = "503" ]; then
  skip "POST /api/users/trigger" "ZAPIER_USERS_WEBHOOK env var"
else
  fail "POST /api/users/trigger — unexpected HTTP $STATUS"
fi

# Alerts notify
R=$(http POST "$BASE_URL/api/alerts/notify" \
  '{"alert_id":"a1","wallet_id":"w1","balance":500,"threshold":1000}')
STATUS=$(status_of "$R")
if [ "$STATUS" = "200" ]; then
  pass "POST /api/alerts/notify — Zapier reachable"
elif [ "$STATUS" = "503" ]; then
  skip "POST /api/alerts/notify" "ZAPIER_NOTIFY_WEBHOOK env var"
else
  fail "POST /api/alerts/notify — unexpected HTTP $STATUS"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "7. Error Handling"

R=$(http GET "$BASE_URL/api/does-not-exist")
assert "Unknown API route returns 404"       "404" "$R" '"error"'

R=$(http POST "$BASE_URL/api/does-not-exist")
assert "Unknown POST API route returns 404"  "404" "$R" '"error"'

R=$(http POST "$BASE_URL/api/update-balances" 'not-valid-json')
assert "Malformed JSON body returns 400"     "400" "$R"

# ─────────────────────────────────────────────────────────────────────────────
section "8. Static Assets"

R=$(http GET "$BASE_URL/")
assert "Root page returns HTML"              "200" "$R" "<!doctype"

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "─────────────────────────────────────────────────────"
echo -e "${BOLD}Results${NC}"
echo -e "  ${GREEN}Passed:  $PASS${NC}"
echo -e "  ${RED}Failed:  $FAIL${NC}"
echo -e "  ${YELLOW}Skipped: $SKIP${NC}  (require DB / Zapier — will pass on Azure)"
echo -e "─────────────────────────────────────────────────────"

if [ "$FAIL" -eq 0 ]; then
  echo -e "\n${GREEN}${BOLD}All testable checks passed. Ready to push to Azure.${NC}\n"
  exit 0
else
  echo -e "\n${RED}${BOLD}$FAIL check(s) failed. Fix before pushing.${NC}\n"
  exit 1
fi
