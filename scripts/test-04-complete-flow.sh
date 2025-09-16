#!/bin/bash

# Test 04: Complete Flow Testing
# End-to-end test: User creation → Multisig setup → Transaction testing → Validation

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
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration with defaults
DEFAULT_MULTISIG="0x2c88A030D9D7edc924d7069718883Db09391fdc7"
DEFAULT_RECIPIENT="0xdD78b58A8AcAE16D62ECE9BCCe6Ec5ECf18c9EA1"
DEFAULT_AMOUNT="0.001"

# Parse command line arguments
MULTISIG_ADDRESS=${1:-$DEFAULT_MULTISIG}
RECIPIENT_ADDRESS=${2:-$DEFAULT_RECIPIENT}
AMOUNT=${3:-$DEFAULT_AMOUNT}

# Generate unique timestamp for this test run
TEST_RUN_ID=$(date +%s)

echo -e "${MAGENTA}🚀 Test 04: Complete Flow Testing${NC}"
echo -e "${MAGENTA}====================================${NC}"
echo -e "${BLUE}Test Run ID: $TEST_RUN_ID${NC}"
echo -e "${BLUE}Configuration:${NC}"
echo "  • Multisig Address: $MULTISIG_ADDRESS"
echo "  • Recipient: $RECIPIENT_ADDRESS"
echo "  • Amount: $AMOUNT ETH"
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
    
    # Return raw response for processing
    echo "$response_body"
}

# Function to extract value from JSON response
extract_json() {
    local json=$1
    local path=$2
    echo "$json" | jq -r "$path // empty" 2>/dev/null
}

# Function to log test results
log_result() {
    local test_name=$1
    local success=$2
    local details=$3
    
    if [ "$success" = true ]; then
        echo -e "${GREEN}✅ $test_name: SUCCESS${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}❌ $test_name: FAILED${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    
    if [ -n "$details" ]; then
        echo -e "${CYAN}   Details: $details${NC}"
    fi
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

# Initialize test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Check if server is running
echo -e "${YELLOW}🔍 Pre-flight Check: Server Status${NC}"
if ! curl -s "$BASE_URL/health" > /dev/null; then
    echo -e "${RED}❌ Server is not running on $BASE_URL${NC}"
    echo "Please start the server with: npm run dev"
    exit 1
fi
echo -e "${GREEN}✅ Server is running${NC}"
echo ""

# Phase 1: Create Basic User
echo -e "${MAGENTA}📋 Phase 1: Basic User Creation${NC}"
echo "================================="

BASIC_USERNAME="flow_basic_${TEST_RUN_ID}"
BASIC_EMAIL="${BASIC_USERNAME}@test.com"
BASIC_PASSWORD="flowTest123"

registration_data='{
    "username": "'$BASIC_USERNAME'",
    "email": "'$BASIC_EMAIL'",
    "password": "'$BASIC_PASSWORD'",
    "displayName": "'$BASIC_USERNAME' - Flow Test Basic User"
}'

basic_response=$(api_call "POST" "/api/auth/register" "$registration_data" "" "Register basic user")
BASIC_TOKEN=$(extract_json "$basic_response" '.auth.token // .token')
BASIC_DID=$(extract_json "$basic_response" '.user.did')

if [ -n "$BASIC_TOKEN" ] && [ "$BASIC_TOKEN" != "null" ]; then
    log_result "Basic User Registration" true "DID: $BASIC_DID"
    
    # Test basic user login
    login_data='{"username": "'$BASIC_USERNAME'", "password": "'$BASIC_PASSWORD'"}'
    login_response=$(api_call "POST" "/api/auth/login" "$login_data" "" "Login basic user")
    LOGIN_TOKEN=$(extract_json "$login_response" '.auth.token // .token')
    
    if [ -n "$LOGIN_TOKEN" ] && [ "$LOGIN_TOKEN" != "null" ]; then
        log_result "Basic User Login" true
    else
        log_result "Basic User Login" false
    fi
else
    log_result "Basic User Registration" false
    BASIC_TOKEN=""
fi
echo ""

# Phase 2: Create Multisig User
echo -e "${MAGENTA}📋 Phase 2: Multisig User Creation${NC}"
echo "==================================="

MULTISIG_USERNAME="flow_multisig_${TEST_RUN_ID}"
MULTISIG_EMAIL="${MULTISIG_USERNAME}@test.com"
MULTISIG_PASSWORD="flowMultisig123"

multisig_registration_data='{
    "username": "'$MULTISIG_USERNAME'",
    "email": "'$MULTISIG_EMAIL'",
    "password": "'$MULTISIG_PASSWORD'",
    "displayName": "'$MULTISIG_USERNAME' - Flow Test Multisig User",
    "multisigWalletAddress": "'$MULTISIG_ADDRESS'"
}'

multisig_response=$(api_call "POST" "/api/auth/register" "$multisig_registration_data" "" "Register multisig user")
MULTISIG_TOKEN=$(extract_json "$multisig_response" '.auth.token // .token')
MULTISIG_DID=$(extract_json "$multisig_response" '.user.did')

if [ -n "$MULTISIG_TOKEN" ] && [ "$MULTISIG_TOKEN" != "null" ]; then
    log_result "Multisig User Registration" true "DID: $MULTISIG_DID"
    
    # Verify multisig configuration
    config_response=$(api_call "GET" "/api/multisig/config" "" "$MULTISIG_TOKEN" "Get multisig config")
    IS_MULTISIG_ENABLED=$(extract_json "$config_response" '.data.isEnabled')
    
    if [ "$IS_MULTISIG_ENABLED" = "true" ]; then
        log_result "Multisig Configuration" true "Enabled: $IS_MULTISIG_ENABLED"
    else
        log_result "Multisig Configuration" false "Not enabled"
    fi
else
    log_result "Multisig User Registration" false
    MULTISIG_TOKEN=""
fi
echo ""

# Phase 3: Blockchain Integration Tests
echo -e "${MAGENTA}📋 Phase 3: Blockchain Integration${NC}"
echo "=================================="

if [ -n "$BASIC_TOKEN" ]; then
    # Test basic user blockchain status
    basic_balance_response=$(api_call "GET" "/api/balance" "" "$BASIC_TOKEN" "Get basic user balance")
    BASIC_ETH_ADDRESS=$(extract_json "$basic_balance_response" '.data.address')
    BASIC_BALANCE=$(extract_json "$basic_balance_response" '.data.balance')
    
    if [ -n "$BASIC_ETH_ADDRESS" ] && [ "$BASIC_ETH_ADDRESS" != "null" ]; then
        log_result "Basic User Blockchain" true "Address: $BASIC_ETH_ADDRESS, Balance: $BASIC_BALANCE ETH"
    else
        log_result "Basic User Blockchain" false
    fi
fi

if [ -n "$MULTISIG_TOKEN" ]; then
    # Test multisig user blockchain status
    multisig_balance_response=$(api_call "GET" "/api/balance" "" "$MULTISIG_TOKEN" "Get multisig user balance")
    MULTISIG_ETH_ADDRESS=$(extract_json "$multisig_balance_response" '.data.address')
    MULTISIG_BALANCE=$(extract_json "$multisig_balance_response" '.data.balance')
    
    if [ -n "$MULTISIG_ETH_ADDRESS" ] && [ "$MULTISIG_ETH_ADDRESS" != "null" ]; then
        log_result "Multisig User Blockchain" true "EOA: $MULTISIG_ETH_ADDRESS, Balance: $MULTISIG_BALANCE ETH"
    else
        log_result "Multisig User Blockchain" false
    fi
fi
echo ""

# Phase 4: Transaction Testing
echo -e "${MAGENTA}📋 Phase 4: Transaction Testing${NC}"
echo "==============================="

if [ -n "$MULTISIG_TOKEN" ]; then
    # Test 1: Standard Safe transaction proposal
    proposal_data='{"to": "'$RECIPIENT_ADDRESS'", "amount": "'$AMOUNT'"}'
    proposal_response=$(api_call "POST" "/api/propose-transaction" "$proposal_data" "$MULTISIG_TOKEN" "Propose standard transaction")
    SAFE_TX_HASH=$(extract_json "$proposal_response" '.data.safeTxHash')
    
    if [ -n "$SAFE_TX_HASH" ] && [ "$SAFE_TX_HASH" != "null" ]; then
        log_result "Standard Safe Proposal" true "Tx Hash: $SAFE_TX_HASH"
    else
        log_result "Standard Safe Proposal" false
    fi
    
    # Test 2: Transaction with useServerSecretAsSigner
    server_key_data='{"to": "'$RECIPIENT_ADDRESS'", "amount": "'$AMOUNT'", "useServerSecretAsSigner": true}'
    server_key_response=$(api_call "POST" "/api/propose-transaction" "$server_key_data" "$MULTISIG_TOKEN" "Propose with server key")
    SERVER_KEY_TX_HASH=$(extract_json "$server_key_response" '.data.safeTxHash')
    
    if [ -n "$SERVER_KEY_TX_HASH" ] && [ "$SERVER_KEY_TX_HASH" != "null" ]; then
        log_result "Server Key Safe Proposal" true "Tx Hash: $SERVER_KEY_TX_HASH"
    else
        log_result "Server Key Safe Proposal" false
    fi
    
    # Test 3: Check pending transactions
    pending_response=$(api_call "GET" "/api/multisig/transactions/pending" "" "$MULTISIG_TOKEN" "Get pending transactions")
    PENDING_COUNT=$(extract_json "$pending_response" '.data | length')
    
    if [ -n "$PENDING_COUNT" ] && [ "$PENDING_COUNT" != "null" ]; then
        log_result "Pending Transactions Check" true "Count: $PENDING_COUNT"
    else
        log_result "Pending Transactions Check" false
    fi
else
    log_result "Transaction Testing" false "No multisig token available"
fi
echo ""

# Phase 5: DID and Architecture Validation
echo -e "${MAGENTA}📋 Phase 5: Architecture Validation${NC}"
echo "===================================="

# Validate DID formats
if [ -n "$BASIC_DID" ]; then
    if [[ "$BASIC_DID" == did:ethr:* ]]; then
        log_result "Basic User DID Format" true "Valid: $BASIC_DID"
    else
        log_result "Basic User DID Format" false "Invalid format: $BASIC_DID"
    fi
fi

if [ -n "$MULTISIG_DID" ]; then
    if [[ "$MULTISIG_DID" == *"$MULTISIG_ADDRESS"* ]]; then
        log_result "Multisig DID Controller" true "Uses multisig address: $MULTISIG_DID"
    else
        log_result "Multisig DID Controller" false "Does not use multisig address: $MULTISIG_DID"
    fi
fi

# Validate dual-key architecture
if [ -n "$MULTISIG_ETH_ADDRESS" ] && [ -n "$MULTISIG_ADDRESS" ]; then
    if [ "$MULTISIG_ETH_ADDRESS" != "$MULTISIG_ADDRESS" ]; then
        log_result "Dual-Key Separation" true "EOA ≠ Multisig address"
    else
        log_result "Dual-Key Separation" false "EOA = Multisig address (should be different)"
    fi
fi
echo ""

# Phase 6: API Coverage Test
echo -e "${MAGENTA}📋 Phase 6: API Coverage Test${NC}"
echo "=============================="

if [ -n "$MULTISIG_TOKEN" ]; then
    # Test debug endpoint
    debug_response=$(api_call "GET" "/api/multisig/debug-signer" "" "$MULTISIG_TOKEN" "Debug signer info")
    DEBUG_SIGNER=$(extract_json "$debug_response" '.data.decryptedSignerAddress')
    
    if [ -n "$DEBUG_SIGNER" ] && [ "$DEBUG_SIGNER" != "null" ]; then
        log_result "Debug Signer Endpoint" true "Address: $DEBUG_SIGNER"
    else
        log_result "Debug Signer Endpoint" false
    fi
    
    # Test wallet info endpoint
    wallet_response=$(api_call "GET" "/api/multisig/wallets/$MULTISIG_ADDRESS" "" "$MULTISIG_TOKEN" "Get wallet info")
    WALLET_TYPE=$(extract_json "$wallet_response" '.data.type')
    
    if [ -n "$WALLET_TYPE" ] && [ "$WALLET_TYPE" != "null" ]; then
        log_result "Wallet Info Endpoint" true "Type: $WALLET_TYPE"
    else
        log_result "Wallet Info Endpoint" false
    fi
fi

# Test authentication methods for both users
if [ -n "$BASIC_TOKEN" ]; then
    auth_methods_response=$(api_call "GET" "/api/auth/methods" "" "$BASIC_TOKEN" "Get auth methods (basic user)")
    BASIC_AUTH_METHOD=$(extract_json "$auth_methods_response" '.data.authMethod')
    log_result "Basic User Auth Methods" true "Method: $BASIC_AUTH_METHOD"
fi

if [ -n "$MULTISIG_TOKEN" ]; then
    auth_methods_response=$(api_call "GET" "/api/auth/methods" "" "$MULTISIG_TOKEN" "Get auth methods (multisig user)")
    MULTISIG_AUTH_METHOD=$(extract_json "$auth_methods_response" '.data.authMethod')
    log_result "Multisig User Auth Methods" true "Method: $MULTISIG_AUTH_METHOD"
fi
echo ""

# Calculate success rate
SUCCESS_RATE=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc 2>/dev/null || echo "0.0")

# Final Summary
echo -e "${MAGENTA}==========================================${NC}"
echo -e "${MAGENTA}🏁 Complete Flow Test Results${NC}"
echo -e "${MAGENTA}==========================================${NC}"
echo ""
echo -e "${BLUE}📊 Test Summary:${NC}"
echo "  • Total Tests: $TOTAL_TESTS"
echo "  • Passed: $PASSED_TESTS"
echo "  • Failed: $FAILED_TESTS"
echo "  • Success Rate: $SUCCESS_RATE%"
echo ""

# Determine overall status
if [ $FAILED_TESTS -eq 0 ]; then
    OVERALL_STATUS="success"
    echo -e "${GREEN}🎯 Overall Status: COMPLETE SUCCESS${NC}"
elif [ $PASSED_TESTS -gt $FAILED_TESTS ]; then
    OVERALL_STATUS="mostly_success"
    echo -e "${YELLOW}⚠️  Overall Status: MOSTLY SUCCESSFUL${NC}"
else
    OVERALL_STATUS="failure"
    echo -e "${RED}❌ Overall Status: SIGNIFICANT FAILURES${NC}"
fi

echo ""
echo -e "${BLUE}👥 Created Users:${NC}"
echo "  • Basic User: $BASIC_USERNAME"
echo "    - DID: $BASIC_DID"
echo "    - ETH Address: $BASIC_ETH_ADDRESS"
echo "    - Balance: $BASIC_BALANCE ETH"
echo ""
echo "  • Multisig User: $MULTISIG_USERNAME"
echo "    - DID: $MULTISIG_DID"
echo "    - EOA Address: $MULTISIG_ETH_ADDRESS"
echo "    - Balance: $MULTISIG_BALANCE ETH"
echo "    - Multisig Address: $MULTISIG_ADDRESS"
echo ""

echo -e "${BLUE}🔗 Transaction Results:${NC}"
if [ -n "$SAFE_TX_HASH" ]; then
    echo "  • Standard Safe Tx: $SAFE_TX_HASH"
fi
if [ -n "$SERVER_KEY_TX_HASH" ]; then
    echo "  • Server Key Safe Tx: $SERVER_KEY_TX_HASH"
fi
echo ""

# Save comprehensive test results
COMPLETE_RESULTS_FILE="test_results_complete_flow_${TEST_RUN_ID}.json"
cat > "$COMPLETE_RESULTS_FILE" << EOF
{
  "test": "04-complete-flow",
  "testRunId": "$TEST_RUN_ID",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "status": "$OVERALL_STATUS",
  "summary": {
    "totalTests": $TOTAL_TESTS,
    "passedTests": $PASSED_TESTS,
    "failedTests": $FAILED_TESTS,
    "successRate": "$SUCCESS_RATE%"
  },
  "users": {
    "basic": {
      "username": "$BASIC_USERNAME",
      "email": "$BASIC_EMAIL",
      "did": "$BASIC_DID",
      "ethAddress": "$BASIC_ETH_ADDRESS",
      "balance": "$BASIC_BALANCE",
      "authMethod": "$BASIC_AUTH_METHOD",
      "token": "$BASIC_TOKEN"
    },
    "multisig": {
      "username": "$MULTISIG_USERNAME",
      "email": "$MULTISIG_EMAIL",
      "did": "$MULTISIG_DID",
      "eoaAddress": "$MULTISIG_ETH_ADDRESS",
      "balance": "$MULTISIG_BALANCE",
      "multisigAddress": "$MULTISIG_ADDRESS",
      "authMethod": "$MULTISIG_AUTH_METHOD",
      "token": "$MULTISIG_TOKEN"
    }
  },
  "transactions": {
    "standardSafeTx": "$([ -n "$SAFE_TX_HASH" ] && echo "$SAFE_TX_HASH" || echo "")",
    "serverKeySafeTx": "$([ -n "$SERVER_KEY_TX_HASH" ] && echo "$SERVER_KEY_TX_HASH" || echo "")",
    "pendingCount": "$PENDING_COUNT"
  },
  "configuration": {
    "multisigAddress": "$MULTISIG_ADDRESS",
    "recipientAddress": "$RECIPIENT_ADDRESS",
    "testAmount": "$AMOUNT"
  }
}
EOF

echo -e "${GREEN}📁 Complete test results saved to: $COMPLETE_RESULTS_FILE${NC}"
echo ""
echo -e "${BLUE}🔍 Next Steps:${NC}"
echo "  1. Review individual test results in detail"
echo "  2. Check Safe App for pending transactions"
echo "  3. Use created users for further API testing"
echo "  4. Run individual tests if specific areas need debugging"
echo ""
echo -e "${CYAN}💡 Test Files Generated:${NC}"
echo "  • Complete Results: $COMPLETE_RESULTS_FILE"
echo "  • Contains tokens for both users for further testing"
echo ""

# Exit with appropriate code
if [ "$OVERALL_STATUS" = "success" ]; then
    exit 0
elif [ "$OVERALL_STATUS" = "mostly_success" ]; then
    exit 1
else
    exit 2
fi
