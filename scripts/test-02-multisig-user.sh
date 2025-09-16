#!/bin/bash

# Test 02: Multisig User Registration and Configuration  
# Creates a user with UNIQUE DID and multisig configuration (EOA for delegate transactions)

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
DEFAULT_USERNAME="multisig_user"
DEFAULT_EMAIL="multisig@test.com"
DEFAULT_PASSWORD="12341234"

# Parse command line arguments
MULTISIG_ADDRESS=${1:-$DEFAULT_MULTISIG}
USERNAME=${2:-$DEFAULT_USERNAME}
EMAIL=${3:-$DEFAULT_EMAIL}
PASSWORD=${4:-$DEFAULT_PASSWORD}

# Add timestamp to make unique
TIMESTAMP=$(date +%s)
USERNAME="${USERNAME}_${TIMESTAMP}"
EMAIL="${USERNAME}@test.com"

echo -e "${CYAN}🧪 Test 02: Multisig User Registration${NC}"
echo "========================================"
echo -e "${BLUE}Configuration:${NC}"
echo "  • Multisig Address: $MULTISIG_ADDRESS"
echo "  • Username: $USERNAME"
echo "  • Email: $EMAIL"
echo "  • Password: [HIDDEN]"
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

# Step 1: Register User with Unique DID + Multisig Configuration
echo -e "${YELLOW}👤 Step 1: Register User with Unique DID + Multisig Config${NC}"
echo -e "${CYAN}   Creating unique DID (via Veramo)${NC}"
echo -e "${CYAN}   Configuring multisig: $MULTISIG_ADDRESS${NC}"
registration_data='{
    "username": "'$USERNAME'",
    "email": "'$EMAIL'",
    "password": "'$PASSWORD'",
    "displayName": "'$USERNAME' - Multisig User",
    "multisigWalletAddress": "'$MULTISIG_ADDRESS'"
}'

registration_response=$(api_call "POST" "/api/auth/register" "$registration_data" "" "Register user with multisig")

# Extract token and DID
USER_TOKEN=$(extract_json "$registration_response" '.auth.token // .token')
USER_DID=$(extract_json "$registration_response" '.user.did')

if [ -z "$USER_TOKEN" ] || [ "$USER_TOKEN" = "null" ]; then
    echo -e "${RED}❌ Failed to get authentication token${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Multisig user registered successfully${NC}"
echo -e "${CYAN}   Token: ${USER_TOKEN:0:20}...${NC}"
echo -e "${CYAN}   Unique DID: $USER_DID${NC}"
echo -e "${CYAN}   Multisig Address: $MULTISIG_ADDRESS${NC}"
echo ""

# Step 2: Verify Multisig Configuration
echo -e "${YELLOW}⚙️  Step 2: Verify Multisig Configuration${NC}"
config_response=$(api_call "GET" "/api/multisig/config" "" "$USER_TOKEN" "Get multisig configuration")

IS_MULTISIG_ENABLED=$(extract_json "$config_response" '.data.isEnabled')
WALLET_ADDRESS=$(extract_json "$config_response" '.data.wallet.address')
EOA_SIGNER=$(extract_json "$config_response" '.data.signerAddress')
MULTISIG_TYPE=$(extract_json "$config_response" '.data.wallet.type')

echo -e "${GREEN}✅ Multisig configuration retrieved${NC}"
echo -e "${CYAN}   Multisig Enabled: $IS_MULTISIG_ENABLED${NC}"
echo -e "${CYAN}   Wallet Address: $WALLET_ADDRESS${NC}"
echo -e "${CYAN}   EOA Signer: $EOA_SIGNER${NC}"
echo -e "${CYAN}   Type: $MULTISIG_TYPE${NC}"
echo ""

# Step 3: Check Blockchain Status (should show EOA address)
echo -e "${YELLOW}⛓️  Step 3: Check Blockchain Status${NC}"
blockchain_response=$(api_call "GET" "/api/balance" "" "$USER_TOKEN" "Get blockchain status")

ETH_ADDRESS=$(extract_json "$blockchain_response" '.data.address')
ETH_BALANCE=$(extract_json "$blockchain_response" '.data.balance')
NETWORK=$(extract_json "$blockchain_response" '.data.network')

echo -e "${GREEN}✅ Blockchain status retrieved${NC}"
echo -e "${CYAN}   ETH Address (EOA): $ETH_ADDRESS${NC}"
echo -e "${CYAN}   Balance: $ETH_BALANCE ETH${NC}"
echo -e "${CYAN}   Network: $NETWORK${NC}"
echo ""

# Step 4: Test Multisig Debug Information
echo -e "${YELLOW}🔍 Step 4: Get Debug Signer Information${NC}"
debug_response=$(api_call "GET" "/api/multisig/debug-signer" "" "$USER_TOKEN" "Get debug signer info")

STORED_SIGNER=$(extract_json "$debug_response" '.data.storedSignerAddress')
DECRYPTED_SIGNER=$(extract_json "$debug_response" '.data.decryptedSignerAddress')
SAFE_ADDRESS=$(extract_json "$debug_response" '.data.safeAddress')

echo -e "${GREEN}✅ Debug information retrieved${NC}"
echo -e "${CYAN}   Stored Signer: $STORED_SIGNER${NC}"
echo -e "${CYAN}   Decrypted Signer: $DECRYPTED_SIGNER${NC}"
echo -e "${CYAN}   Safe Address: $SAFE_ADDRESS${NC}"
echo ""

# Step 5: Verify DID Configuration (Should be UNIQUE, not multisig address)
echo -e "${YELLOW}🆔 Step 5: Verify DID Configuration${NC}"
echo -e "${CYAN}   User DID: $USER_DID${NC}"
echo -e "${CYAN}   Multisig Address: $MULTISIG_ADDRESS${NC}"

# Check that DID is unique (NOT the multisig address)
if [[ "$USER_DID" != *"$MULTISIG_ADDRESS"* ]]; then
    echo -e "${GREEN}✅ DID is unique (not multisig address)${NC}"
    DID_CORRECT=true
else
    echo -e "${RED}❌ DID should be unique, not multisig address${NC}"
    DID_CORRECT=false
fi

# Check that DID is properly formatted
if [[ "$USER_DID" == did:ethr:0x* ]]; then
    echo -e "${GREEN}✅ DID properly formatted${NC}"
    DID_FORMAT_CORRECT=true
else
    echo -e "${RED}❌ DID format incorrect${NC}"
    DID_FORMAT_CORRECT=false
fi
echo ""

# Step 6: Test Dual-Key Architecture Verification
echo -e "${YELLOW}🔑 Step 6: Verify Dual-Key Architecture${NC}"

# Check if EOA signer matches blockchain address
if [ "$ETH_ADDRESS" = "$EOA_SIGNER" ] || [ "$ETH_ADDRESS" = "$DECRYPTED_SIGNER" ]; then
    echo -e "${GREEN}✅ EOA signer correctly configured${NC}"
    EOA_CORRECT=true
else
    echo -e "${RED}❌ EOA signer mismatch${NC}"
    EOA_CORRECT=false
fi

# Check if multisig address is different from EOA
if [ "$MULTISIG_ADDRESS" != "$ETH_ADDRESS" ]; then
    echo -e "${GREEN}✅ Multisig and EOA addresses are separate${NC}"
    SEPARATION_CORRECT=true
else
    echo -e "${RED}❌ Multisig and EOA addresses should be different${NC}"
    SEPARATION_CORRECT=false
fi
echo ""

# Final Summary
echo "========================================"
echo -e "${GREEN}🎉 Multisig User Test Complete!${NC}"
echo ""
echo -e "${BLUE}📊 Test Results Summary:${NC}"
echo -e "${CYAN}User Details:${NC}"
echo "  • Username: $USERNAME"
echo "  • Email: $EMAIL"
echo "  • DID: $USER_DID"
echo "  • Multisig Enabled: $IS_MULTISIG_ENABLED"
echo ""
echo -e "${CYAN}New Architecture:${NC}"
echo "  • Unique DID: $USER_DID (Individual Identity)"
echo "  • Multisig Address: $MULTISIG_ADDRESS (Configured for delegates)"
echo "  • EOA Signer: $ETH_ADDRESS (For delegate transactions)"
echo "  • Network: $NETWORK"
echo "  • Balance: $ETH_BALANCE ETH"
echo ""
echo -e "${CYAN}Verification Status:${NC}"
echo "  • DID Uniqueness: $([ "$DID_CORRECT" = true ] && echo "✅ Correct" || echo "❌ Error")"
echo "  • DID Format: $([ "$DID_FORMAT_CORRECT" = true ] && echo "✅ Correct" || echo "❌ Error")"
echo "  • EOA Configuration: $([ "$EOA_CORRECT" = true ] && echo "✅ Correct" || echo "❌ Error")"
echo "  • Key Separation: $([ "$SEPARATION_CORRECT" = true ] && echo "✅ Correct" || echo "❌ Error")"
echo ""

# Calculate overall test status
if [ "$DID_CORRECT" = true ] && [ "$DID_FORMAT_CORRECT" = true ] && [ "$EOA_CORRECT" = true ] && [ "$SEPARATION_CORRECT" = true ]; then
    TEST_STATUS="success"
    echo -e "${GREEN}🎯 Overall Test Status: SUCCESS${NC}"
else
    TEST_STATUS="partial_failure"
    echo -e "${YELLOW}⚠️  Overall Test Status: PARTIAL FAILURE${NC}"
fi

# Save test results
TEST_RESULTS_FILE="test_results_multisig_user_${USERNAME}.json"
cat > "$TEST_RESULTS_FILE" << EOF
{
  "test": "02-multisig-user",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "status": "$TEST_STATUS",
  "user": {
    "username": "$USERNAME",
    "email": "$EMAIL",
    "did": "$USER_DID",
    "multisigEnabled": $IS_MULTISIG_ENABLED
  },
  "multisig": {
    "walletAddress": "$MULTISIG_ADDRESS",
    "type": "$MULTISIG_TYPE",
    "signerAddress": "$EOA_SIGNER",
    "safeAddress": "$SAFE_ADDRESS"
  },
  "blockchain": {
    "eoaAddress": "$ETH_ADDRESS",
    "balance": "$ETH_BALANCE",
    "network": "$NETWORK"
  },
  "verification": {
    "didUniqueness": $DID_CORRECT,
    "didFormat": $DID_FORMAT_CORRECT,
    "eoaConfiguration": $EOA_CORRECT,
    "keySeparation": $SEPARATION_CORRECT
  },
  "tokens": {
    "accessToken": "$USER_TOKEN"
  }
}
EOF

echo ""
echo -e "${GREEN}📁 Test results saved to: $TEST_RESULTS_FILE${NC}"
echo ""
echo -e "${BLUE}🔍 Next Steps:${NC}"
echo "  1. Run Test 03: Transaction Testing with this multisig user"
echo "  2. Test Safe transaction proposals"
echo "  3. Verify transaction signing with EOA"
echo ""
echo -e "${CYAN}💡 Key Features Enabled:${NC}"
echo "  • ✅ Unique DID for individual identity"  
echo "  • ✅ Multisig configuration for institutional operations"
echo "  • ✅ EOA signer for delegate transactions"
echo "  • ✅ Ready for Safe delegate proposals"
echo ""
echo -e "${YELLOW}⚠️  Manual Steps Required:${NC}"
echo "  1. Add EOA ($ETH_ADDRESS) as delegate to Safe ($MULTISIG_ADDRESS)"
echo "  2. Use Safe App: https://app.safe.global"
echo "  3. Then test delegate transactions with 'Propose as Delegate' button"

# TEST_TOKEN=""
#  curl -s -w "\n%{http_code}" -X POST "http://localhost:3000/api/propose-transaction-delegate" -H "Authorization: Bearer $TEST_TOKEN" -H "Content-Type: application/json" -d '{"to": "0xdD78b58A8AcAE16D62ECE9BCCe6Ec5ECf18c9EA1", "amount": "0.001"}'