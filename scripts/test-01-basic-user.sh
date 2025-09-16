#!/bin/bash

# Test 01: Basic User Registration and Authentication
# Creates a standard user (non-multisig) and tests basic functionality

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
DEFAULT_USERNAME="test_user"
DEFAULT_EMAIL="test@example.com"
DEFAULT_PASSWORD="testPassword123"

# Parse command line arguments
USERNAME=${1:-$DEFAULT_USERNAME}
EMAIL=${2:-$DEFAULT_EMAIL}
PASSWORD=${3:-$DEFAULT_PASSWORD}

# Add timestamp to make unique
TIMESTAMP=$(date +%s)
USERNAME="${USERNAME}_${TIMESTAMP}"
EMAIL="${USERNAME}@test.com"

echo -e "${CYAN}🧪 Test 01: Basic User Registration${NC}"
echo "======================================"
echo -e "${BLUE}Configuration:${NC}"
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

# Step 1: Register User
echo -e "${YELLOW}👤 Step 1: Register Standard User${NC}"
registration_data='{
    "username": "'$USERNAME'",
    "email": "'$EMAIL'",
    "password": "'$PASSWORD'",
    "displayName": "'$USERNAME' - Test User"
}'

registration_response=$(api_call "POST" "/api/auth/register" "$registration_data" "" "Register new user")

# Extract token
USER_TOKEN=$(extract_json "$registration_response" '.auth.token // .token')
USER_DID=$(extract_json "$registration_response" '.user.did')

if [ -z "$USER_TOKEN" ] || [ "$USER_TOKEN" = "null" ]; then
    echo -e "${RED}❌ Failed to get authentication token${NC}"
    exit 1
fi

echo -e "${GREEN}✅ User registered successfully${NC}"
echo -e "${CYAN}   Token: ${USER_TOKEN:0:20}...${NC}"
echo -e "${CYAN}   DID: $USER_DID${NC}"
echo ""

# Step 2: Test Login
echo -e "${YELLOW}🔐 Step 2: Test User Login${NC}"
login_data='{
    "username": "'$USERNAME'",
    "password": "'$PASSWORD'"
}'

login_response=$(api_call "POST" "/api/auth/login" "$login_data" "" "Login user")

LOGIN_TOKEN=$(extract_json "$login_response" '.auth.token // .token')
if [ -z "$LOGIN_TOKEN" ] || [ "$LOGIN_TOKEN" = "null" ]; then
    echo -e "${RED}❌ Login failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}"
echo ""

# Step 3: Check Blockchain Status
echo -e "${YELLOW}⛓️  Step 3: Check Blockchain Status${NC}"
blockchain_response=$(api_call "GET" "/api/balance" "" "$USER_TOKEN" "Get blockchain status")

ETH_ADDRESS=$(extract_json "$blockchain_response" '.data.address')
ETH_BALANCE=$(extract_json "$blockchain_response" '.data.balance')
NETWORK=$(extract_json "$blockchain_response" '.data.network')

echo -e "${GREEN}✅ Blockchain status retrieved${NC}"
echo -e "${CYAN}   ETH Address: $ETH_ADDRESS${NC}"
echo -e "${CYAN}   Balance: $ETH_BALANCE ETH${NC}"
echo -e "${CYAN}   Network: $NETWORK${NC}"
echo ""

# Step 4: Test Token Refresh
echo -e "${YELLOW}🔄 Step 4: Test Token Refresh${NC}"
refresh_response=$(api_call "POST" "/api/auth/refresh" "" "$USER_TOKEN" "Refresh authentication token")

NEW_TOKEN=$(extract_json "$refresh_response" '.auth.token')
if [ -n "$NEW_TOKEN" ] && [ "$NEW_TOKEN" != "null" ]; then
    echo -e "${GREEN}✅ Token refresh successful${NC}"
    USER_TOKEN="$NEW_TOKEN"
else
    echo -e "${YELLOW}⚠️  Token refresh failed or not needed${NC}"
fi
echo ""

# Step 5: Test Authentication Methods
echo -e "${YELLOW}🔑 Step 5: Check Authentication Methods${NC}"
auth_methods_response=$(api_call "GET" "/api/auth/methods" "" "$USER_TOKEN" "Get authentication methods")

AUTH_METHOD=$(extract_json "$auth_methods_response" '.data.authMethod')
HAS_PASSWORD=$(extract_json "$auth_methods_response" '.data.hasPassword')
HAS_WEBAUTHN=$(extract_json "$auth_methods_response" '.data.hasWebAuthn')

echo -e "${GREEN}✅ Authentication methods retrieved${NC}"
echo -e "${CYAN}   Auth Method: $AUTH_METHOD${NC}"
echo -e "${CYAN}   Has Password: $HAS_PASSWORD${NC}"
echo -e "${CYAN}   Has WebAuthn: $HAS_WEBAUTHN${NC}"
echo ""

# Final Summary
echo "========================================"
echo -e "${GREEN}🎉 Basic User Test Complete!${NC}"
echo ""
echo -e "${BLUE}📊 Test Results Summary:${NC}"
echo -e "${CYAN}User Details:${NC}"
echo "  • Username: $USERNAME"
echo "  • Email: $EMAIL"
echo "  • DID: $USER_DID"
echo "  • Auth Method: $AUTH_METHOD"
echo ""
echo -e "${CYAN}Blockchain Account:${NC}"
echo "  • Address: $ETH_ADDRESS"
echo "  • Balance: $ETH_BALANCE ETH"
echo "  • Network: $NETWORK"
echo ""
echo -e "${CYAN}Authentication:${NC}"
echo "  • Registration: ✅ Success"
echo "  • Login: ✅ Success"
echo "  • Token Refresh: $([ -n "$NEW_TOKEN" ] && echo "✅ Success" || echo "⚠️ Skipped")"
echo "  • Password Auth: $HAS_PASSWORD"
echo "  • WebAuthn: $HAS_WEBAUTHN"
echo ""

# Save test results
TEST_RESULTS_FILE="test_results_basic_user_${USERNAME}.json"
cat > "$TEST_RESULTS_FILE" << EOF
{
  "test": "01-basic-user",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "status": "success",
  "user": {
    "username": "$USERNAME",
    "email": "$EMAIL",
    "did": "$USER_DID",
    "authMethod": "$AUTH_METHOD"
  },
  "blockchain": {
    "address": "$ETH_ADDRESS",
    "balance": "$ETH_BALANCE",
    "network": "$NETWORK"
  },
  "authentication": {
    "registration": true,
    "login": true,
    "tokenRefresh": $([ -n "$NEW_TOKEN" ] && echo "true" || echo "false"),
    "hasPassword": $HAS_PASSWORD,
    "hasWebAuthn": $HAS_WEBAUTHN
  },
  "tokens": {
    "accessToken": "$USER_TOKEN"
  }
}
EOF

echo -e "${GREEN}📁 Test results saved to: $TEST_RESULTS_FILE${NC}"
echo ""
echo -e "${BLUE}🔍 Next Steps:${NC}"
echo "  1. Run Test 02: Multisig User Registration"
echo "  2. Run Test 03: Transaction Testing"
echo "  3. Run Test 04: Complete Flow Testing"
echo ""
echo -e "${CYAN}💡 Usage:${NC}"
echo "  • Use saved token for further API testing"
echo "  • Address can receive test ETH from Sepolia faucet"
echo "  • This user can now interact with the system"
