#!/usr/bin/env bash
# Generate starter plans for beta testers via local dev API. Requires `npm run dev` running.
set -u
BASE="http://localhost:3000"
declare -A PLANS=(
  ["jeand.duno@gmail.com"]="run-only"
  ["kathy@jasmiamimethod.com"]="run-only"
  ["jas@jasmiamimethod.com"]="olympic"
  ["juliaburtseva@gmail.com"]="run-only"
  ["arlenramirez0425@gmail.com"]="run-only"
  ["m@jasmiamimethod.com"]="run-only"
)
for email in "${!PLANS[@]}"; do
  jar=$(mktemp)
  login=$(curl -s -c "$jar" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$email\",\"password\":\"demo1234\"}")
  if ! echo "$login" | grep -q '"ok":true'; then echo "LOGIN FAIL $email: $login"; rm -f "$jar"; continue; fi
  gen=$(curl -s -b "$jar" -X POST "$BASE/api/plan/generate" -H "Content-Type: application/json" -d "{\"distance\":\"${PLANS[$email]}\",\"weeks\":12}")
  planid=$(echo "$gen" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('plan',{}).get('id') or d.get('id') or 'ERR')" 2>/dev/null)
  echo "$email -> ${PLANS[$email]} plan=$planid"
  rm -f "$jar"
done
