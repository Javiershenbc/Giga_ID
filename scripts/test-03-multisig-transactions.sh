#!/bin/bash

# Test 03: Multisig Transaction Testing
# Tests Safe transaction proposals and multisig functionality

set -e  # Exit on any error

# Configuration
BASE_URL="http://localhost:3000"
CONTENT_TYPE="Content-Type: application/json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
DEFAULT_MULTISIG="0x2c88A030D9D7edc924d7069718883Db09391fdc7"
DEFAULT_RECIPIENT="0xdD78b58A8AcAE16D62ECE9BCCe6Ec5ECf18c9EA1"
DEFAULT_AMOUNT="0.001"
DEFAULT_SIGNER_KEY="0x76b330bcae43d4c08b22ff93dfc1d1c251c76ad7efd51454d05884cecbcc8aaa"

# Parse command line arguments
MULTISIG_ADDRESS=${1:-$DEFAULT_MULTISIG}
RECIPIENT_ADDRESS=${2:-$DEFAULT_RECIPIENT}
AMOUNT=${3:-$DEFAULT_AMOUNT}
SIGNER_PRIVATE_KEY=${4:-$DEFAULT_SIGNER_KEY}

echo -e "${CYAN}🧪 Test 03: Multisig Transaction Testing${NC}"
echo "==========================================="
echo -e "${BLUE}Configuration:${NC}"
echo "  • Multisig Address: $MULTISIG_ADDRESS"
echo "  • Recipient: $RECIPIENT_ADDRESS"
echo "  • Amount: $AMOUNT ETH"
echo "  • Signer Key: ${SIGNER_PRIVATE_KEY:0:10}...[HIDDEN]"
echo ""

# Function to make API calls and show responses
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local token=$4
    local description=$5
    
    echo -e "${BLUE}📡 $description${NC}"
    echo -e "${CYAN}   $method $endpoint${NC}"
    
    if [ -n "$token" ]; then
        if [ -n "$data" ]; then
            response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
                -H "Authorization: Bearer $token" \
                -H "$CONTENT_TYPE" \
                -d "$data")
        else
            response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
                -H "Authorization: Bearer $token")
        fi
    else
        if [ -n "$data" ]; then
            response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
                -H "$CONTENT_TYPE" \
                -d "$data")
        else
            response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint")
        fi
    fi
    
    # Extract HTTP code and response body
    http_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | sed '$d')
    
    # Display result
    if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
        echo -e "${GREEN}✅ Success ($http_code)${NC}"
    else
        echo -e "${RED}❌ Error ($http_code)${NC}"
    fi
    
    # Format JSON response
    if echo "$response_body" | jq '.' >/dev/null 2>&1; then
        echo "$response_body" | jq '.' >&2
    else
        echo "$response_body" >&2
    fi
    echo "" >&2
    
    # Return raw response for processing
    echo "$response_body"
}

# Function to extract value from JSON response
extract_json() {
    local json=$1
    local path=$2
    echo "$json" | jq -r "$path // empty" 2>/dev/null
}

# Check if server is running
echo -e "${YELLOW}🔍 Checking server status...${NC}"
if ! curl -s "$BASE_URL/health" > /dev/null; then
    echo -e "${RED}❌ Server is not running on $BASE_URL${NC}"
    echo "Please start the server with: npm run dev"
    exit 1
fi
echo -e "${GREEN}✅ Server is running${NC}"
echo ""

# Step 1: Create or Login Multisig User
echo -e "${YELLOW}👤 Step 1: Setup Multisig User${NC}"

# Try to find existing test user from previous test
LATEST_USER_FILE=$(ls test_results_multisig_user_*.json 2>/dev/null | tail -n1)

if [ -n "$LATEST_USER_FILE" ] && [ -f "$LATEST_USER_FILE" ]; then
    echo -e "${CYAN}   Found existing test user: $LATEST_USER_FILE${NC}"
    USER_TOKEN=$(jq -r '.tokens.accessToken' "$LATEST_USER_FILE")
    USERNAME=$(jq -r '.user.username' "$LATEST_USER_FILE")
    
    if [ -n "$USER_TOKEN" ] && [ "$USER_TOKEN" != "null" ]; then
        echo -e "${GREEN}✅ Using existing multisig user: $USERNAME${NC}"
        echo -e "${CYAN}   Token: ${USER_TOKEN:0:20}...${NC}"
    else
        echo -e "${YELLOW}⚠️  Token not found in file, will create new user${NC}"
        USER_TOKEN=""
    fi
else
    echo -e "${YELLOW}⚠️  No previous test results found, will create new user${NC}"
    USER_TOKEN=""
fi

# Create new user if no token available
if [ -z "$USER_TOKEN" ] || [ "$USER_TOKEN" = "null" ]; then
    TIMESTAMP=$(date +%s)
    USERNAME="tx_test_user_${TIMESTAMP}"
    EMAIL="${USERNAME}@test.com"
    PASSWORD="testPass123"
    
    echo -e "${CYAN}   Creating new multisig user: $USERNAME${NC}"
    
    registration_data='{
        "username": "'$USERNAME'",
        "email": "'$EMAIL'",
        "password": "'$PASSWORD'",
        "displayName": "'$USERNAME' - Transaction Test User",
        "multisigWalletAddress": "'$MULTISIG_ADDRESS'"
    }'
    
    registration_response=$(api_call "POST" "/api/auth/register" "$registration_data" "" "Register multisig user")
    USER_TOKEN=$(extract_json "$registration_response" '.auth.token // .token')
    
    if [ -z "$USER_TOKEN" ] || [ "$USER_TOKEN" = "null" ]; then
        echo -e "${RED}❌ Failed to create or authenticate user${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ New multisig user created${NC}"
fi
echo ""

# Step 2: Verify User is Multisig-Enabled
echo -e "${YELLOW}⚙️  Step 2: Verify Multisig Configuration${NC}"
config_response=$(api_call "GET" "/api/multisig/config" "" "$USER_TOKEN" "Get multisig config")

IS_MULTISIG_ENABLED=$(extract_json "$config_response" '.data.isEnabled')
WALLET_ADDRESS=$(extract_json "$config_response" '.data.wallet.address')

if [ "$IS_MULTISIG_ENABLED" != "true" ]; then
    echo -e "${RED}❌ User is not multisig-enabled${NC}"
    exit 1
fi

echo -e "${GREEN}✅ User is multisig-enabled${NC}"
echo -e "${CYAN}   Wallet Address: $WALLET_ADDRESS${NC}"
echo ""

# Step 3: Check Current Balance
echo -e "${YELLOW}💰 Step 3: Check Current Balance${NC}"
balance_response=$(api_call "GET" "/api/balance" "" "$USER_TOKEN" "Get current balance")

ETH_ADDRESS=$(extract_json "$balance_response" '.data.address')
ETH_BALANCE=$(extract_json "$balance_response" '.data.balance')
NETWORK=$(extract_json "$balance_response" '.data.network')

echo -e "${GREEN}✅ Balance information retrieved${NC}"
echo -e "${CYAN}   EOA Address: $ETH_ADDRESS${NC}"
echo -e "${CYAN}   Balance: $ETH_BALANCE ETH${NC}"
echo -e "${CYAN}   Network: $NETWORK${NC}"
echo ""

# Step 4: Test Standard Transaction Proposal
echo -e "${YELLOW}📤 Step 4: Test Standard Safe Transaction Proposal${NC}"
proposal_data='{
    "to": "'$RECIPIENT_ADDRESS'",
    "amount": "'$AMOUNT'"
}'

proposal_response=$(api_call "POST" "/api/propose-transaction" "$proposal_data" "$USER_TOKEN" "Propose Safe transaction")

SAFE_TX_HASH=$(extract_json "$proposal_response" '.data.safeTxHash')
SAFE_ADDRESS=$(extract_json "$proposal_response" '.data.safeAddress')

if [ -n "$SAFE_TX_HASH" ] && [ "$SAFE_TX_HASH" != "null" ]; then
    echo -e "${GREEN}✅ Standard proposal successful${NC}"
    echo -e "${CYAN}   Safe Tx Hash: $SAFE_TX_HASH${NC}"
    echo -e "${CYAN}   Safe Address: $SAFE_ADDRESS${NC}"
    STANDARD_PROPOSAL_SUCCESS=true
else
    echo -e "${RED}❌ Standard proposal failed${NC}"
    STANDARD_PROPOSAL_SUCCESS=false
fi
echo ""

# Step 5: Test Transaction Proposal with Override Signer
echo -e "${YELLOW}🔐 Step 5: Test Proposal with Override Signer${NC}"
override_data='{
    "to": "'$RECIPIENT_ADDRESS'",
    "amount": "'$AMOUNT'",
    "overrideSignerPrivateKey": "'$SIGNER_PRIVATE_KEY'"
}'

override_response=$(api_call "POST" "/api/propose-transaction" "$override_data" "$USER_TOKEN" "Propose with override signer")

OVERRIDE_TX_HASH=$(extract_json "$override_response" '.data.safeTxHash')
OVERRIDE_SAFE_ADDRESS=$(extract_json "$override_response" '.data.safeAddress')

if [ -n "$OVERRIDE_TX_HASH" ] && [ "$OVERRIDE_TX_HASH" != "null" ]; then
    echo -e "${GREEN}✅ Override signer proposal successful${NC}"
    echo -e "${CYAN}   Safe Tx Hash: $OVERRIDE_TX_HASH${NC}"
    echo -e "${CYAN}   Safe Address: $OVERRIDE_SAFE_ADDRESS${NC}"
    OVERRIDE_PROPOSAL_SUCCESS=true
else
    echo -e "${RED}❌ Override signer proposal failed${NC}"
    OVERRIDE_PROPOSAL_SUCCESS=false
fi
echo ""

# Step 6: Test Server Secret Key Proposal
echo -e "${YELLOW}🗝️  Step 6: Test Proposal with Server Secret Key${NC}"
server_key_data='{
    "to": "'$RECIPIENT_ADDRESS'",
    "amount": "'$AMOUNT'",
    "useServerSecretAsSigner": true
}'

server_key_response=$(api_call "POST" "/api/propose-transaction" "$server_key_data" "$USER_TOKEN" "Propose with server secret key")

SERVER_KEY_TX_HASH=$(extract_json "$server_key_response" '.data.safeTxHash')
SERVER_KEY_SAFE_ADDRESS=$(extract_json "$server_key_response" '.data.safeAddress')

if [ -n "$SERVER_KEY_TX_HASH" ] && [ "$SERVER_KEY_TX_HASH" != "null" ]; then
    echo -e "${GREEN}✅ Server secret key proposal successful${NC}"
    echo -e "${CYAN}   Safe Tx Hash: $SERVER_KEY_TX_HASH${NC}"
    echo -e "${CYAN}   Safe Address: $SERVER_KEY_SAFE_ADDRESS${NC}"
    SERVER_KEY_PROPOSAL_SUCCESS=true
else
    echo -e "${RED}❌ Server secret key proposal failed${NC}"
    SERVER_KEY_PROPOSAL_SUCCESS=false
fi
echo ""

# Step 7: Check Pending Transactions
echo -e "${YELLOW}📋 Step 7: Check Pending Transactions${NC}"
pending_response=$(api_call "GET" "/api/multisig/transactions/pending" "" "$USER_TOKEN" "Get pending transactions")

PENDING_COUNT=$(extract_json "$pending_response" '.data | length')
echo -e "${GREEN}✅ Pending transactions retrieved${NC}"
echo -e "${CYAN}   Pending Count: $PENDING_COUNT${NC}"
echo ""

# Step 8: Verify Safe Wallet Information
echo -e "${YELLOW}🏦 Step 8: Get Safe Wallet Details${NC}"
wallet_response=$(api_call "GET" "/api/multisig/wallets/$MULTISIG_ADDRESS" "" "$USER_TOKEN" "Get wallet details")

WALLET_TYPE=$(extract_json "$wallet_response" '.data.type')
WALLET_OWNERS=$(extract_json "$wallet_response" '.data.owners')
WALLET_THRESHOLD=$(extract_json "$wallet_response" '.data.threshold')

echo -e "${GREEN}✅ Wallet information retrieved${NC}"
echo -e "${CYAN}   Type: $WALLET_TYPE${NC}"
echo -e "${CYAN}   Threshold: $WALLET_THRESHOLD${NC}"
echo -e "${CYAN}   Owners: $WALLET_OWNERS${NC}"
echo ""

# Calculate overall test results
SUCCESS_COUNT=0
TOTAL_TESTS=3

if [ "$STANDARD_PROPOSAL_SUCCESS" = true ]; then
    ((SUCCESS_COUNT++))
fi

if [ "$OVERRIDE_PROPOSAL_SUCCESS" = true ]; then
    ((SUCCESS_COUNT++))
fi

if [ "$SERVER_KEY_PROPOSAL_SUCCESS" = true ]; then
    ((SUCCESS_COUNT++))
fi

# Final Summary
echo "==========================================="
echo -e "${GREEN}🎉 Multisig Transaction Test Complete!${NC}"
echo ""
echo -e "${BLUE}📊 Test Results Summary:${NC}"
echo -e "${CYAN}User Configuration:${NC}"
echo "  • Username: $USERNAME"
echo "  • Multisig Address: $MULTISIG_ADDRESS"
echo "  • EOA Address: $ETH_ADDRESS"
echo "  • Balance: $ETH_BALANCE ETH"
echo ""
echo -e "${CYAN}Transaction Tests:${NC}"
echo "  • Standard Proposal: $([ "$STANDARD_PROPOSAL_SUCCESS" = true ] && echo "✅ Success" || echo "❌ Failed")"
echo "  • Override Signer: $([ "$OVERRIDE_PROPOSAL_SUCCESS" = true ] && echo "✅ Success" || echo "❌ Failed")"
echo "  • Server Secret Key: $([ "$SERVER_KEY_PROPOSAL_SUCCESS" = true ] && echo "✅ Success" || echo "❌ Failed")"
echo "  • Success Rate: $SUCCESS_COUNT/$TOTAL_TESTS"
echo ""
echo -e "${CYAN}Safe Wallet Information:${NC}"
echo "  • Type: $WALLET_TYPE"
echo "  • Threshold: $WALLET_THRESHOLD"
echo "  • Pending Transactions: $PENDING_COUNT"
echo ""

# Determine overall status
if [ $SUCCESS_COUNT -eq $TOTAL_TESTS ]; then
    TEST_STATUS="success"
    echo -e "${GREEN}🎯 Overall Test Status: SUCCESS${NC}"
elif [ $SUCCESS_COUNT -gt 0 ]; then
    TEST_STATUS="partial_success"
    echo -e "${YELLOW}⚠️  Overall Test Status: PARTIAL SUCCESS${NC}"
else
    TEST_STATUS="failure"
    echo -e "${RED}❌ Overall Test Status: FAILURE${NC}"
fi

# Save test results
TEST_RESULTS_FILE="test_results_multisig_transactions_$(date +%s).json"
cat > "$TEST_RESULTS_FILE" << EOF
{
  "test": "03-multisig-transactions",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "status": "$TEST_STATUS",
  "user": {
    "username": "$USERNAME",
    "eoaAddress": "$ETH_ADDRESS",
    "balance": "$ETH_BALANCE",
    "network": "$NETWORK"
  },
  "multisig": {
    "address": "$MULTISIG_ADDRESS",
    "type": "$WALLET_TYPE",
    "threshold": "$WALLET_THRESHOLD",
    "pendingTransactions": "$PENDING_COUNT"
  },
  "tests": {
    "standardProposal": {
      "success": $STANDARD_PROPOSAL_SUCCESS,
      "safeTxHash": "$([ "$STANDARD_PROPOSAL_SUCCESS" = true ] && echo "$SAFE_TX_HASH" || echo "")"
    },
    "overrideSigner": {
      "success": $OVERRIDE_PROPOSAL_SUCCESS,
      "safeTxHash": "$([ "$OVERRIDE_PROPOSAL_SUCCESS" = true ] && echo "$OVERRIDE_TX_HASH" || echo "")"
    },
    "serverSecretKey": {
      "success": $SERVER_KEY_PROPOSAL_SUCCESS,
      "safeTxHash": "$([ "$SERVER_KEY_PROPOSAL_SUCCESS" = true ] && echo "$SERVER_KEY_TX_HASH" || echo "")"
    }
  },
  "summary": {
    "successCount": $SUCCESS_COUNT,
    "totalTests": $TOTAL_TESTS,
    "successRate": "$(echo "scale=2; $SUCCESS_COUNT * 100 / $TOTAL_TESTS" | bc)%"
  }
}
EOF

echo ""
echo -e "${GREEN}📁 Test results saved to: $TEST_RESULTS_FILE${NC}"
echo ""
echo -e "${BLUE}🔍 Next Steps:${NC}"
echo "  1. Review Safe transactions in Safe App: https://app.safe.global"
echo "  2. Approve transactions using Safe wallet interface"
echo "  3. Run Test 04: Complete Flow Testing"
echo ""
echo -e "${CYAN}💡 Transaction URLs:${NC}"
if [ "$STANDARD_PROPOSAL_SUCCESS" = true ]; then
    echo "  • Standard: Check Safe App for transaction: $SAFE_TX_HASH"
fi
if [ "$OVERRIDE_PROPOSAL_SUCCESS" = true ]; then
    echo "  • Override: Check Safe App for transaction: $OVERRIDE_TX_HASH"
fi
if [ "$SERVER_KEY_PROPOSAL_SUCCESS" = true ]; then
    echo "  • Server Key: Check Safe App for transaction: $SERVER_KEY_TX_HASH"
fi
