#!/usr/bin/env bash

# Check signer addresses against a Safe (Gnosis) wallet
# - Fetches server-side stored and decrypted signer
# - Fetches Safe owners from the Safe Transaction Service
# - Compares an optional expected signer address
#
# Usage:
#   ./scripts/check-signer-vs-safe.sh <SAFE_ADDRESS> \
#       [--token TOKEN | --username USER --password PASS] \
#       [--signer 0xEXPECTED] [--network sepolia|mainnet]
#
set -euo pipefail

BASE_URL=${BASE_URL:-"http://localhost:3000"}
NETWORK=${NETWORK:-"sepolia"}
CONTENT_TYPE="Content-Type: application/json"

usage() {
  echo "Usage: $0 <SAFE_ADDRESS> [--token TOKEN | --username USER --password PASS] [--signer 0xEXPECTED] [--network sepolia|mainnet]" >&2
  exit 1
}

if [[ $# -lt 1 ]]; then usage; fi

SAFE_ADDR="$1"; shift || true

TOKEN=""
USERNAME=""
PASSWORD=""
EXPECTED_SIGNER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token) TOKEN="${2:-}"; shift 2 ;;
    --username) USERNAME="${2:-}"; shift 2 ;;
    --password) PASSWORD="${2:-}"; shift 2 ;;
    --signer) EXPECTED_SIGNER="${2:-}"; shift 2 ;;
    --network) NETWORK="${2:-}"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; usage ;;
  esac
done

if ! [[ "$SAFE_ADDR" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "Invalid Safe address: $SAFE_ADDR" >&2; exit 2
fi
if [[ -n "$EXPECTED_SIGNER" ]] && ! [[ "$EXPECTED_SIGNER" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "Invalid expected signer address: $EXPECTED_SIGNER" >&2; exit 2
fi

if ! curl -fsS "$BASE_URL/health" >/dev/null; then
  echo "Server not reachable at $BASE_URL" >&2; exit 3
fi

# Obtain token via login if needed
if [[ -z "$TOKEN" && -n "$USERNAME" && -n "$PASSWORD" ]]; then
  LOGIN_BODY=$(jq -n --arg u "$USERNAME" --arg p "$PASSWORD" '{username:$u, password:$p}')
  RESP=$(curl -fsS -H "$CONTENT_TYPE" -X POST "$BASE_URL/api/auth/login" -d "$LOGIN_BODY")
  TOKEN=$(echo "$RESP" | jq -r '.auth.token // empty')
fi

if [[ -z "$TOKEN" ]]; then
  echo "A valid --token or --username/--password is required" >&2; exit 4
fi

# Server-side debug data
DEBUG_JSON=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/multisig/debug-signer" || echo '{}')

SERVER_STORED=$(echo "$DEBUG_JSON" | jq -r '.data.storedSignerAddress // empty')
SERVER_DECRYPTED=$(echo "$DEBUG_JSON" | jq -r '.data.decryptedSignerAddress // empty')
SERVER_SAFE=$(echo "$DEBUG_JSON" | jq -r '.data.safeAddress // empty')

# Safe Transaction Service URL
if [[ "$NETWORK" == "mainnet" ]]; then
  SAFE_TS="https://safe-transaction-mainnet.safe.global"
else
  SAFE_TS="https://safe-transaction-sepolia.safe.global"
fi

# Fetch Safe owners
SAFE_INFO=$(curl -fsS "$SAFE_TS/api/v1/safes/$SAFE_ADDR" || echo '{}')
OWNERS_JSON=$(python3 - << 'PY'
import json,sys
import urllib.request
import os
addr=os.environ.get('SAFE_ADDR')
net=os.environ.get('NETWORK')
base='https://safe-transaction-mainnet.safe.global' if net=='mainnet' else 'https://safe-transaction-sepolia.safe.global'
data=json.loads(urllib.request.urlopen(f"{base}/api/v1/safes/{addr}", timeout=10).read().decode())
print(json.dumps(data.get('owners', [])))
PY)

IN_OWNERS() {
  local addr_lc=$(echo "$1" | tr 'A-Z' 'a-z')
  echo "$OWNERS_JSON" | jq -r '.[]' | tr 'A-Z' 'a-z' | grep -q "^$addr_lc$" && echo "yes" || echo "no"
}

# Report
jq -n \
  --arg safe "$SAFE_ADDR" \
  --arg network "$NETWORK" \
  --arg expected "$EXPECTED_SIGNER" \
  --arg stored "${SERVER_STORED:-}" \
  --arg decrypted "${SERVER_DECRYPTED:-}" \
  --arg serverSafe "${SERVER_SAFE:-}" \
  --argjson owners "$OWNERS_JSON" \
  '{
    safe: $safe,
    network: $network,
    expectedSigner: ($expected // null),
    server: {
      storedSignerAddress: ($stored // null),
      decryptedSignerAddress: ($decrypted // null),
      userLinkedSafe: ($serverSafe // null)
    },
    safeOwners: $owners
  }' | tee /tmp/check-signer.json >/dev/null

# Print membership checks
echo "\nChecks:" >&2
if [[ -n "$EXPECTED_SIGNER" ]]; then
  echo "  - expectedSigner in owners: $(IN_OWNERS "$EXPECTED_SIGNER")" >&2
fi
if [[ -n "$SERVER_STORED" ]]; then
  echo "  - storedSignerAddress in owners: $(IN_OWNERS "$SERVER_STORED")" >&2
fi
if [[ -n "$SERVER_DECRYPTED" ]]; then
  echo "  - decryptedSignerAddress in owners: $(IN_OWNERS "$SERVER_DECRYPTED")" >&2
fi

echo "\nResult JSON written to /tmp/check-signer.json" >&2


