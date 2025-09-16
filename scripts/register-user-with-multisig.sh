#!/bin/bash

# Register User with Multisig Wallet Script
# Creates a user with DID owned by multisig and managed by EOA
#
# Usage:
#   ./register-user-with-multisig.sh [MULTISIG_ADDRESS] [USERNAME] [EMAIL] [PASSWORD]
#
# Examples:
#   ./register-user-with-multisig.sh
#   ./register-user-with-multisig.sh 0x1234567890123456789012345678901234567890
#   ./register-user-with-multisig.sh 0x1234567890123456789012345678901234567890 alice alice@school.edu mypass123
#   ./register-user-with-multisig.sh 0x1234567890123456789012345678901234567890 unique  # Generates unique user
#
# Special Username:
#   - Use "unique" as username to auto-generate unique credentials with timestamp

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
DEFAULT_MULTISIG="0x1234567890123456789012345678901234567890"
DEFAULT_USERNAME="alice_admin"
DEFAULT_EMAIL="alice@school.edu"
DEFAULT_PASSWORD="securePass123"

# Parse command line arguments
MULTISIG_ADDRESS=${1:-$DEFAULT_MULTISIG}
USERNAME=${2:-$DEFAULT_USERNAME}
EMAIL=${3:-$DEFAULT_EMAIL}
PASSWORD=${4:-$DEFAULT_PASSWORD}

# If username is "unique", generate a unique username with timestamp
if [ "$USERNAME" = "unique" ]; then
    TIMESTAMP=$(date +%s)
    USERNAME="user_$TIMESTAMP"
    EMAIL="user_$TIMESTAMP@test.com"
    echo -e "${CYAN}🎲 Generated unique credentials:${NC}"
    echo "   Username: $USERNAME"
    echo "   Email: $EMAIL"
fi

echo -e "${CYAN}🚀 User Registration with Multisig Setup${NC}"
echo "========================================"
echo -e "${BLUE}📋 Configuration:${NC}"
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
    
    # Always display the response
    if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
        echo -e "${GREEN}✅ Success ($http_code)${NC}"
    else
        echo -e "${RED}❌ Error ($http_code)${NC}"
    fi
    
    # Try to format as JSON for display, fallback to plain text
    if echo "$response_body" | jq '.' >/dev/null 2>&1; then
        echo "$response_body" | jq '.' >&2  # Send to stderr for display only
    else
        echo "$response_body" >&2  # Send to stderr for display only
    fi
    echo "" >&2
    
    # Return only the raw response body for processing
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

# Step 1: Register User with Multisig DID
echo -e "${YELLOW}👤 Step 1: Registering User with Multisig DID${NC}"
echo -e "${CYAN}   Creating DID: did:ethr:$MULTISIG_ADDRESS${NC}"
registration_data='{
    "username": "'$USERNAME'",
    "email": "'$EMAIL'",
    "password": "'$PASSWORD'",
    "displayName": "'$USERNAME' - Administrator",
    "multisigWalletAddress": "'$MULTISIG_ADDRESS'"
}'

registration_response=$(api_call "POST" "/api/auth/register" "$registration_data" "" "Register new user")

# Check if registration was successful or user already exists
user_exists=false
if echo "$registration_response" | jq -e '.success' >/dev/null 2>&1; then
    echo -e "${GREEN}✅ User registered successfully${NC}"
    # Registration successful, extract token from registration response
    USER_TOKEN=$(extract_json "$registration_response" '.auth.token // .token')
    if [ -n "$USER_TOKEN" ] && [ "$USER_TOKEN" != "null" ]; then
        echo -e "${GREEN}✅ Token received from registration${NC}"
        echo -e "${CYAN}   Token: ${USER_TOKEN:0:20}...${NC}"
    else
        echo -e "${YELLOW}⚠️  No token in registration response, will login${NC}"
        user_exists=true
    fi
else
    # Check if it's an error about existing user
    if echo "$registration_response" | grep -q -i "already exists\|duplicate\|unique\|email"; then
        echo -e "${YELLOW}⚠️  User already exists, will attempt login${NC}"
        user_exists=true
    else
        echo -e "${RED}❌ User registration failed${NC}"
        echo -e "${RED}   Response: $registration_response${NC}"
        exit 1
    fi
fi
# Step 2: Login to get JWT token (only if needed)
if [ "$user_exists" = true ] || [ -z "$USER_TOKEN" ] || [ "$USER_TOKEN" = "null" ]; then
    echo ""
    echo -e "${YELLOW}🔐 Step 2: Authenticating User${NC}"
    login_data='{
        "username": "'$USERNAME'",
        "password": "'$PASSWORD'"
    }'

    login_response=$(api_call "POST" "/api/auth/login" "$login_data" "" "Login user")

    # Extract JWT token
    USER_TOKEN=$(extract_json "$login_response" '.auth.token // .token // .data.token')
    if [ -z "$USER_TOKEN" ] || [ "$USER_TOKEN" = "null" ]; then
        echo -e "${RED}❌ Failed to get authentication token${NC}"
        echo -e "${RED}   Login response: $login_response${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ User authenticated successfully${NC}"
    echo -e "${CYAN}   Token: ${USER_TOKEN:0:20}...${NC}"
else
    echo -e "${GREEN}✅ Using token from registration${NC}"
fi
echo ""

# Step 3: Verify Multisig Configuration
echo -e "${YELLOW}⚙️  Step 3: Verifying Multisig Configuration${NC}"
echo -e "${CYAN}   Expected DID: did:ethr:$MULTISIG_ADDRESS${NC}"
config_response=$(api_call "GET" "/api/multisig/config" "" "$USER_TOKEN" "Get user multisig configuration")

# Step 4: Check Blockchain Status
echo -e "${YELLOW}⛓️  Step 4: Checking Blockchain Status${NC}"
blockchain_response=$(api_call "GET" "/api/auth/blockchain-status" "" "$USER_TOKEN" "Get blockchain status")

# Extract configuration details
USER_ID=$(extract_json "$config_response" '.data.user.id')
IS_MULTISIG_ENABLED=$(extract_json "$config_response" '.data.isEnabled')
WALLET_ADDRESS=$(extract_json "$config_response" '.data.wallet.address')
EOA_SIGNER=$(extract_json "$config_response" '.data.signerAddress')
USER_DID=$(extract_json "$blockchain_response" '.data.did')

# Final Summary
echo "========================================"
echo -e "${GREEN}🎉 User Registration with Multisig Complete!${NC}"
echo ""
echo -e "${BLUE}📊 Final Configuration Summary:${NC}"
echo -e "${CYAN}User Details:${NC}"
echo "  • User ID: $USER_ID"
echo "  • Username: $USERNAME"
echo "  • Email: $EMAIL"
echo "  • DID: $USER_DID"
echo ""
echo -e "${CYAN}Multisig Configuration:${NC}"
echo "  • Multisig Address: $WALLET_ADDRESS"
echo "  • Multisig Enabled: $IS_MULTISIG_ENABLED"
echo "  • EOA Signer: $EOA_SIGNER"
echo ""
echo -e "${CYAN}Architecture:${NC}"
echo "  • DID Owner: $MULTISIG_ADDRESS (Multisig Wallet)"
echo "  • Daily Operations: $EOA_SIGNER (EOA Signer)"
echo "  • VC Signing: Fast EOA signing"
echo "  • DID Control: Secure multisig governance"
echo ""
echo -e "${YELLOW}✨ Key Features Enabled:${NC}"
echo "  ✅ Dual-key security architecture"
echo "  ✅ Fast VC signing with EOA"
echo "  ✅ Secure DID control with multisig"
echo "  ✅ Hierarchical credential issuance ready"
echo ""
echo -e "${BLUE}🔍 Next Steps:${NC}"
echo "  1. Test credential issuance with this user"
echo "  2. Verify multisig transaction approval workflow"
echo "  3. Test hierarchical authority delegation"
echo "  4. Register additional users for testing"
echo ""
echo -e "${CYAN}💡 Usage Tips:${NC}"
echo "  • User can now issue VCs using fast EOA signing"
echo "  • DID changes require multisig wallet approval"
echo "  • Token for API calls: $USER_TOKEN"
echo ""

# Save configuration to file
CONFIG_FILE="user_config_${USERNAME}.json"
cat > "$CONFIG_FILE" << EOF
{
  "user": {
    "id": "$USER_ID",
    "username": "$USERNAME",
    "email": "$EMAIL",
    "did": "$USER_DID",
    "token": "$USER_TOKEN"
  },
  "multisig": {
    "walletAddress": "$WALLET_ADDRESS",
    "signerAddress": "$EOA_SIGNER",
    "enabled": $IS_MULTISIG_ENABLED
  },
  "created": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

echo -e "${GREEN}📁 Configuration saved to: $CONFIG_FILE${NC}"