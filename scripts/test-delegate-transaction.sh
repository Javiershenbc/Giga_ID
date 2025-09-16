#!/bin/bash

# Test Script: Safe Delegate Transaction
# Tests the new delegate transaction functionality

set -e  # Exit on any error

# Configuration
BASE_URL="http://localhost:3000"
CONTENT_TYPE="Content-Type: application/json"

# Default test values
DEFAULT_MULTISIG="0x2c88A030D9D7edc924d7069718883Db09391fdc7"
DEFAULT_RECIPIENT="0xdD78b58A8AcAE16D62ECE9BCCe6Ec5ECf18c9EA1"
DEFAULT_AMOUNT="0.001"
DEFAULT_DELEGATE_KEY="0x39e7f26892eea224acb3c7085cae22bee381a3617c92f6eb8eb75d5c568ba322"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${MAGENTA}🔐 Testing Safe Delegate Transaction${NC}"
echo -e "${MAGENTA}====================================${NC}"
echo ""

# Check if server is running
echo -e "${BLUE}📡 Checking server status...${NC}"
if ! curl -s "$BASE_URL/health" > /dev/null; then
    echo -e "${RED}❌ Server is not running on $BASE_URL${NC}"
    echo "Please start the server with: npm run dev"
    exit 1
fi
echo -e "${GREEN}✅ Server is running${NC}"
echo ""

# Create test user with multisig
echo -e "${BLUE}👤 Creating test user with multisig...${NC}"
TIMESTAMP=$(date +%s)
USERNAME="delegate_test_${TIMESTAMP}"
EMAIL="${USERNAME}@test.com"
PASSWORD="delegateTest123"

registration_data='{
    "username": "'$USERNAME'",
    "email": "'$EMAIL'",
    "password": "'$PASSWORD'",
    "displayName": "'$USERNAME' - Delegate Test",
    "multisigWalletAddress": "'$DEFAULT_MULTISIG'"
}'

echo "Creating user: $USERNAME"
registration_response=$(curl -s -X POST "$BASE_URL/api/auth/register" \
    -H "$CONTENT_TYPE" \
    -d "$registration_data")

# Extract token
USER_TOKEN=$(echo "$registration_response" | jq -r '.auth.token // empty')

if [ -z "$USER_TOKEN" ] || [ "$USER_TOKEN" = "null" ]; then
    echo -e "${RED}❌ Failed to create user or get token${NC}"
    echo "Response: $registration_response"
    exit 1
fi

echo -e "${GREEN}✅ User created successfully${NC}"
echo "Token: ${USER_TOKEN:0:50}..."
echo ""

# Test delegate transaction
echo -e "${BLUE}🔐 Testing delegate transaction...${NC}"
echo "  • Safe Address: $DEFAULT_MULTISIG"
echo "  • Recipient: $DEFAULT_RECIPIENT"
echo "  • Amount: $DEFAULT_AMOUNT ETH"
echo "  • Delegate Key: ${DEFAULT_DELEGATE_KEY:0:20}..."
echo ""

delegate_transaction_data='{
    "to": "'$DEFAULT_RECIPIENT'",
    "amount": "'$DEFAULT_AMOUNT'",
    "overrideSignerPrivateKey": "'$DEFAULT_DELEGATE_KEY'"
}'

delegate_response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/propose-transaction-delegate" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -H "$CONTENT_TYPE" \
    -d "$delegate_transaction_data")

# Extract HTTP code and response body
http_code=$(echo "$delegate_response" | tail -n1)
response_body=$(echo "$delegate_response" | sed '$d')

echo -e "${CYAN}📡 API Response (HTTP $http_code):${NC}"
echo "$response_body" | jq '.' 2>/dev/null || echo "$response_body"
echo ""

# Check result
if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
    # Extract transaction details
    SAFE_TX_HASH=$(echo "$response_body" | jq -r '.data.safeTxHash // empty')
    SAFE_ADDRESS=$(echo "$response_body" | jq -r '.data.safeAddress // empty')
    DELEGATE_ADDRESS=$(echo "$response_body" | jq -r '.data.delegateAddress // empty')
    
    echo -e "${GREEN}🎉 Delegate transaction proposed successfully!${NC}"
    echo -e "${GREEN}✅ Results:${NC}"
    echo "  • Safe Tx Hash: $SAFE_TX_HASH"
    echo "  • Safe Address: $SAFE_ADDRESS"
    echo "  • Delegate Address: $DELEGATE_ADDRESS"
    echo ""
    echo -e "${YELLOW}📋 Next Steps:${NC}"
    echo "  1. Check Safe App: https://app.safe.global"
    echo "  2. Search for Safe address: $SAFE_ADDRESS"
    echo "  3. Look for pending transaction with hash: $SAFE_TX_HASH"
    echo "  4. The transaction should be signed by delegate: $DELEGATE_ADDRESS"
    echo ""
    echo -e "${CYAN}💡 What happened:${NC}"
    echo "  • User $USERNAME created a delegate transaction proposal"
    echo "  • The transaction was signed using the delegate private key"
    echo "  • The proposal was submitted to Safe Transaction Service"
    echo "  • Safe owners can now approve/reject the transaction"
    echo ""
    
    # Save results
    results_file="delegate_test_results_$(date +%s).json"
    cat > "$results_file" << EOF
{
  "test": "delegate-transaction",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "status": "success",
  "user": {
    "username": "$USERNAME",
    "email": "$EMAIL",
    "token": "$USER_TOKEN"
  },
  "transaction": {
    "safeTxHash": "$SAFE_TX_HASH",
    "safeAddress": "$SAFE_ADDRESS",
    "delegateAddress": "$DELEGATE_ADDRESS",
    "recipient": "$DEFAULT_RECIPIENT",
    "amount": "$DEFAULT_AMOUNT"
  },
  "config": {
    "multisigAddress": "$DEFAULT_MULTISIG",
    "delegatePrivateKey": "$DEFAULT_DELEGATE_KEY"
  }
}
EOF
    
    echo -e "${GREEN}📁 Test results saved to: $results_file${NC}"
    exit 0
    
else
    echo -e "${RED}❌ Delegate transaction failed (HTTP $http_code)${NC}"
    
    # Try to extract error message
    error_message=$(echo "$response_body" | jq -r '.error // .message // "Unknown error"' 2>/dev/null || echo "Unknown error")
    echo -e "${RED}Error: $error_message${NC}"
    
    echo ""
    echo -e "${YELLOW}🔍 Troubleshooting:${NC}"
    echo "  1. Check if the user has multisig configuration"
    echo "  2. Verify the delegate private key is valid"
    echo "  3. Ensure the Safe address exists and is correct"
    echo "  4. Check server logs for detailed error information"
    
    exit 1
fi
