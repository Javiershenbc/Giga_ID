#!/usr/bin/env bash

# Associate current user with a multisig wallet
# - Auth via Bearer token or username/password (password auth)
# - By default generates a new EOA signer; or pass --signer-private-key to set your own
#
# Usage:
#   ./scripts/associate-user-with-multisig.sh <MULTISIG_ADDRESS> [--token TOKEN]
#   ./scripts/associate-user-with-multisig.sh <MULTISIG_ADDRESS> --username USER --password PASS
#   ./scripts/associate-user-with-multisig.sh <MULTISIG_ADDRESS> --token TOKEN --signer-private-key 0x...
#   ./scripts/associate-user-with-multisig.sh <MULTISIG_ADDRESS> --username USER --password PASS --no-generate
#
set -euo pipefail

BASE_URL=${BASE_URL:-"http://localhost:3000"}
CONTENT_TYPE="Content-Type: application/json"

usage() {
  echo "Usage: $0 <MULTISIG_ADDRESS> [--token TOKEN | --username USER --password PASS] [--signer-private-key HEX] [--no-generate]" >&2
  exit 1
}

if [[ $# -lt 1 ]]; then usage; fi

MULTISIG_ADDRESS="$1"; shift || true

TOKEN=""
USERNAME="giga_admin"
PASSWORD="12341234"
SIGNER_PRIV=""
GENERATE_SIGNER=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)
      TOKEN="${2:-}"; shift 2 || usage ;;
    --username)
      USERNAME="${2:-}"; shift 2 || usage ;;
    --password)
      PASSWORD="${2:-}"; shift 2 || usage ;;
    --signer-private-key)
      SIGNER_PRIV="${2:-}"; shift 2 || usage ;;
    --no-generate)
      GENERATE_SIGNER=false; shift ;;
    *)
      echo "Unknown arg: $1" >&2; usage ;;
  esac
done

# Basic validation
if ! [[ "$MULTISIG_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "Invalid multisig address: $MULTISIG_ADDRESS" >&2
  exit 2
fi

if [[ -z "$TOKEN" && ( -z "$USERNAME" || -z "$PASSWORD" ) ]]; then
  echo "Provide either --token or --username and --password" >&2
  usage
fi

# Check server
if ! curl -fsS "$BASE_URL/health" >/dev/null; then
  echo "Server not reachable at $BASE_URL" >&2
  exit 3
fi

# Obtain token via login if needed
if [[ -z "$TOKEN" ]]; then
  LOGIN_BODY=$(jq -n --arg u "$USERNAME" --arg p "$PASSWORD" '{username:$u, password:$p}')
  RESP=$(curl -fsS -H "$CONTENT_TYPE" -X POST "$BASE_URL/api/auth/login" -d "$LOGIN_BODY")
  TOKEN=$(echo "$RESP" | jq -r '.auth.token // empty')
  if [[ -z "$TOKEN" ]]; then
    echo "Failed to obtain token via login" >&2
    echo "$RESP" | jq . >&2 || true
    exit 4
  fi
fi

# Build associate payload
if [[ -n "$SIGNER_PRIV" ]]; then
  PAYLOAD=$(jq -n \
    --arg addr "$MULTISIG_ADDRESS" \
    --arg key "$SIGNER_PRIV" \
    '{multisigWalletAddress:$addr, signerPrivateKey:$key}')
else
  if [[ "$GENERATE_SIGNER" == true ]]; then
    PAYLOAD=$(jq -n --arg addr "$MULTISIG_ADDRESS" '{multisigWalletAddress:$addr, generateSigner:true}')
  else
    PAYLOAD=$(jq -n --arg addr "$MULTISIG_ADDRESS" '{multisigWalletAddress:$addr, generateSigner:false}')
  fi
fi

# Call associate endpoint
ASSOC=$(curl -s -w "\n%{http_code}" -H "$CONTENT_TYPE" -H "Authorization: Bearer $TOKEN" \
  -X POST "$BASE_URL/api/multisig/associate" -d "$PAYLOAD")

HTTP_CODE=$(echo "$ASSOC" | tail -n1)
BODY=$(echo "$ASSOC" | sed '$d')

if [[ "$HTTP_CODE" != 200 ]]; then
  echo "Associate failed ($HTTP_CODE)" >&2
  echo "$BODY" | jq . >&2 || echo "$BODY" >&2
  exit 5
fi

echo "$BODY" | jq .


