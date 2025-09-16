#!/bin/bash

# Test script for Giga admin super privileges
# This script verifies that Giga admins can bypass normal hierarchy restrictions

set -e

echo "🔧 Testing Giga Admin Super Privileges"
echo "======================================"

# Configuration
BASE_URL="http://localhost:3000"
GIGA_ADMIN_USERNAME="giga_admin"
GIGA_ADMIN_PASSWORD="admin123"
TEST_COUNTRY_NAME="Test Country Office (Admin Test)"
TEST_GOVERNMENT_NAME="Test Government (Admin Test)"

echo ""
echo "📋 Test Plan:"
echo "1. Login as Giga admin"
echo "2. Try to create a Country Office without being parent's admin" 
echo "3. Try to create a Government directly (bypassing Country Office)" 
echo "4. Verify permissions show Giga admin can manage all orgs"
echo ""

# Step 1: Login as Giga admin
echo "🔑 Step 1: Login as Giga admin"
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$GIGA_ADMIN_USERNAME\",
    \"password\": \"$GIGA_ADMIN_PASSWORD\"
  }")

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$LOGIN_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Login failed with code $HTTP_CODE"
  echo "Response: $RESPONSE_BODY"
  exit 1
fi

TOKEN=$(echo "$RESPONSE_BODY" | jq -r '.auth.token')
if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Failed to extract token from login response"
  echo "Response: $RESPONSE_BODY"
  exit 1
fi

echo "✅ Successfully logged in as Giga admin"
echo "   Token: ${TOKEN:0:20}..."

# Step 2: Check permissions - should show super-admin capabilities
echo ""
echo "🔍 Step 2: Check Giga admin permissions"
PERMISSIONS_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/hierarchy/permissions/user/$GIGA_ADMIN_USERNAME" \
  -H "Authorization: Bearer $TOKEN")

HTTP_CODE=$(echo "$PERMISSIONS_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$PERMISSIONS_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Retrieved permissions successfully"
  
  # Check if user can create all organization types
  CAN_CREATE_COUNTRY=$(echo "$RESPONSE_BODY" | jq -r '.data.permissions.canCreateOrganizations.country_office')
  CAN_CREATE_GOVERNMENT=$(echo "$RESPONSE_BODY" | jq -r '.data.permissions.canCreateOrganizations.government')
  CAN_CREATE_SCHOOL=$(echo "$RESPONSE_BODY" | jq -r '.data.permissions.canCreateOrganizations.school')
  
  echo "   Can create Country Office: $CAN_CREATE_COUNTRY"
  echo "   Can create Government: $CAN_CREATE_GOVERNMENT"  
  echo "   Can create School: $CAN_CREATE_SCHOOL"
  
  if [ "$CAN_CREATE_COUNTRY" = "true" ] && [ "$CAN_CREATE_GOVERNMENT" = "true" ] && [ "$CAN_CREATE_SCHOOL" = "true" ]; then
    echo "✅ Giga admin has super privileges!"
  else
    echo "⚠️  Giga admin permissions may be limited"
  fi
else
  echo "❌ Failed to get permissions: $HTTP_CODE"
  echo "Response: $RESPONSE_BODY"
fi

# Step 3: Try to create a Country Office (should work for Giga admin)
echo ""
echo "🏢 Step 3: Test creating Country Office as Giga admin"

# First get Giga organization ID
ORG_LIST_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/hierarchy/organizations" \
  -H "Authorization: Bearer $TOKEN")

HTTP_CODE=$(echo "$ORG_LIST_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$ORG_LIST_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  GIGA_ORG_ID=$(echo "$RESPONSE_BODY" | jq -r '.data[] | select(.type=="giga") | .id')
  echo "   Found Giga org ID: $GIGA_ORG_ID"
else
  echo "❌ Failed to get organization list: $HTTP_CODE"
  exit 1
fi

# Create Country Office
CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/hierarchy/organizations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$TEST_COUNTRY_NAME\",
    \"type\": \"country_office\",
    \"description\": \"Test country office created by Giga admin\",
    \"country\": \"Test Country\",
    \"region\": \"Test Region\",
    \"contactEmail\": \"test.country@example.com\",
    \"parentId\": \"$GIGA_ORG_ID\"
  }")

HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$CREATE_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "201" ]; then
  echo "✅ Successfully created Country Office as Giga admin"
  COUNTRY_ORG_ID=$(echo "$RESPONSE_BODY" | jq -r '.data.id')
  echo "   Country Office ID: $COUNTRY_ORG_ID"
else
  echo "❌ Failed to create Country Office: $HTTP_CODE"
  echo "Response: $RESPONSE_BODY"
  COUNTRY_ORG_ID=""
fi

# Step 4: Try to create Government directly under Giga (should work for Giga admin, bypass normal hierarchy)
echo ""
echo "🏛️  Step 4: Test creating Government directly under Giga (bypass normal hierarchy)"

CREATE_GOV_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/hierarchy/organizations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$TEST_GOVERNMENT_NAME\",
    \"type\": \"government\", 
    \"description\": \"Test government created directly by Giga admin (bypassing Country Office)\",
    \"country\": \"Test Country Direct\",
    \"region\": \"Test Region Direct\",
    \"contactEmail\": \"test.gov@example.com\",
    \"parentId\": \"$GIGA_ORG_ID\"
  }")

HTTP_CODE=$(echo "$CREATE_GOV_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$CREATE_GOV_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "201" ]; then
  echo "✅ Successfully created Government directly under Giga (super-admin privilege confirmed!)"
  GOVERNMENT_ORG_ID=$(echo "$RESPONSE_BODY" | jq -r '.data.id')
  echo "   Government ID: $GOVERNMENT_ORG_ID"
else
  echo "❌ Failed to create Government directly: $HTTP_CODE"
  echo "Response: $RESPONSE_BODY"
  echo "   This might be expected if hierarchy validation is still enforced"
fi

# Summary
echo ""
echo "📊 Test Summary:"
echo "=================="
if [ "$HTTP_CODE" = "201" ]; then
  echo "✅ Giga admin super privileges are working!"
  echo "   - Can create any organization type"
  echo "   - Can bypass normal hierarchy restrictions"
  echo "   - Has full administrative control"
else
  echo "ℹ️  Giga admin capabilities need verification:"
  echo "   - Check if isGigaAdmin() method is working correctly"
  echo "   - Verify Giga organization setup and user association"  
  echo "   - Review authorization service logic"
fi

echo ""
echo "🔄 Cleanup: Created test organizations can be deleted via the API or UI"
echo "   Country Office: $TEST_COUNTRY_NAME"
echo "   Government: $TEST_GOVERNMENT_NAME"
echo ""
echo "✅ Giga admin privileges test complete!"
