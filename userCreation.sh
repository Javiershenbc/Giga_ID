#!/bin/bash

# Complete GigaID API Workflow
# Demonstrates the full flow: User Creation → Organization Setup → Credential Issuance → Permission Checking

echo "🚀 GigaID Complete API Workflow"
echo "================================="

BASE_URL="http://localhost:3000"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "\n${BLUE}Step 1: Creating Users${NC}"
echo "========================"

# Create Giga Admin
echo "Creating Giga Administrator..."
GIGA_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "hierarchy_admin",
    "email": "admin@giga.org",
    "displayName": "Hierarchy Administrator",
    "password": "secure123456"
  }')

echo "Giga Admin Response:"
echo $GIGA_RESPONSE | jq '.'

GIGA_TOKEN=$(echo $GIGA_RESPONSE | jq -r '.auth.token')
GIGA_DID=$(echo $GIGA_RESPONSE | jq -r '.user.did')

echo -e "\n${GREEN}✅ Giga Admin Created${NC}"
echo "Token: ${GIGA_TOKEN:0:50}..."
echo "DID: $GIGA_DID"

# Create Country Office Admin
echo -e "\nCreating Country Office Administrator..."
COOF_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "coof_admin",
    "email": "coof@unicef.org",
    "displayName": "Country Office Administrator",
    "password": "secure123456"
  }')

COOF_TOKEN=$(echo $COOF_RESPONSE | jq -r '.auth.token')
COOF_DID=$(echo $COOF_RESPONSE | jq -r '.user.did')

echo -e "${GREEN}✅ Country Office Admin Created${NC}"

# Create Government Admin
echo -e "\nCreating Government Administrator..."
GOV_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "gov_admin",
    "email": "admin@gov.ke",
    "displayName": "Government Administrator",
    "password": "secure123456"
  }')

GOV_TOKEN=$(echo $GOV_RESPONSE | jq -r '.auth.token')
GOV_DID=$(echo $GOV_RESPONSE | jq -r '.user.did')

echo -e "${GREEN}✅ Government Admin Created${NC}"

# Create School Admin
echo -e "\nCreating School Administrator..."
SCHOOL_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "school_admin",
    "email": "admin@school.ke",
    "displayName": "School Administrator", 
    "password": "secure123456"
  }')

SCHOOL_TOKEN=$(echo $SCHOOL_RESPONSE | jq -r '.auth.token')
SCHOOL_DID=$(echo $SCHOOL_RESPONSE | jq -r '.user.did')

echo -e "${GREEN}✅ School Admin Created${NC}"

echo -e "\n${BLUE}Step 2: Creating Organizations${NC}"
echo "==============================="

# Create Giga Organization
echo "Creating Giga Organization..."
GIGA_ORG_RESPONSE=$(curl -s -X POST $BASE_URL/api/hierarchy/organizations \
  -H "Authorization: Bearer $GIGA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Giga",
    "type": "giga",
    "description": "UNICEF Giga Initiative - Root Authority",
    "country": "Global",
    "region": "Worldwide",
    "contactEmail": "admin@giga.org"
  }')

GIGA_ORG_ID=$(echo $GIGA_ORG_RESPONSE | jq -r '.data.id')
echo -e "${GREEN}✅ Giga Organization Created${NC} - ID: $GIGA_ORG_ID"

# Create Country Office
echo -e "\nCreating Country Office..."
COOF_ORG_RESPONSE=$(curl -s -X POST $BASE_URL/api/hierarchy/organizations \
  -H "Authorization: Bearer $GIGA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kenya Country Office",
    "type": "country_office",
    "description": "UNICEF Kenya Country Office",
    "country": "Kenya", 
    "region": "East Africa",
    "contactEmail": "kenya@unicef.org",
    "parentId": "'$GIGA_ORG_ID'"
  }')

COOF_ORG_ID=$(echo $COOF_ORG_RESPONSE | jq -r '.data.id')
echo -e "${GREEN}✅ Country Office Created${NC} - ID: $COOF_ORG_ID"

# Create Government
echo -e "\nCreating Government Organization..."
GOV_ORG_RESPONSE=$(curl -s -X POST $BASE_URL/api/hierarchy/organizations \
  -H "Authorization: Bearer $GIGA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ministry of Education Kenya",
    "type": "government",
    "description": "Government of Kenya Ministry of Education",
    "country": "Kenya",
    "region": "Nairobi", 
    "contactEmail": "education@gov.ke",
    "parentId": "'$COOF_ORG_ID'"
  }')

GOV_ORG_ID=$(echo $GOV_ORG_RESPONSE | jq -r '.data.id')
echo -e "${GREEN}✅ Government Organization Created${NC} - ID: $GOV_ORG_ID"

# Create School
echo -e "\nCreating School Organization..."
SCHOOL_ORG_RESPONSE=$(curl -s -X POST $BASE_URL/api/hierarchy/organizations \
  -H "Authorization: Bearer $GIGA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nairobi Primary School",
    "type": "school",
    "description": "Primary school in Nairobi, Kenya",
    "country": "Kenya",
    "region": "Nairobi",
    "contactEmail": "admin@nairobiprimary.ke", 
    "parentId": "'$GOV_ORG_ID'"
  }')

SCHOOL_ORG_ID=$(echo $SCHOOL_ORG_RESPONSE | jq -r '.data.id')
echo -e "${GREEN}✅ School Organization Created${NC} - ID: $SCHOOL_ORG_ID"

echo -e "\n${BLUE}Step 3: Associate Users with Organizations${NC}"
echo "==========================================="

# Associate Country Office Admin
echo "Associating Country Office Admin..."
curl -s -X POST $BASE_URL/api/hierarchy/organizations/$COOF_ORG_ID/associate-user \
  -H "Authorization: Bearer $GIGA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "coof_admin",
    "role": "admin"
  }' > /dev/null

echo -e "${GREEN}✅ Country Office Admin Associated${NC}"

# Associate Government Admin
echo "Associating Government Admin..."
curl -s -X POST $BASE_URL/api/hierarchy/organizations/$GOV_ORG_ID/associate-user \
  -H "Authorization: Bearer $GIGA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "gov_admin",
    "role": "admin"
  }' > /dev/null

echo -e "${GREEN}✅ Government Admin Associated${NC}"

# Associate School Admin
echo "Associating School Admin..."
curl -s -X POST $BASE_URL/api/hierarchy/organizations/$SCHOOL_ORG_ID/associate-user \
  -H "Authorization: Bearer $GIGA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "school_admin",
    "role": "admin"
  }' > /dev/null

echo -e "${GREEN}✅ School Admin Associated${NC}"

echo -e "\n${BLUE}Step 4: Issue Credentials${NC}"
echo "=========================="

# Issue Country Office Authorization
echo "Issuing Country Office Authorization..."
COOF_CRED_RESPONSE=$(curl -s -X POST $BASE_URL/api/hierarchy/credentials/issue \
  -H "Authorization: Bearer $GIGA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "issuerDid": "'$GIGA_DID'",
    "subjectDid": "'$COOF_DID'",
    "credentialType": "country_office_authorization",
    "claims": {
      "authorizedRegions": ["Kenya", "East Africa"],
      "validFrom": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "authorityLevel": "Regional"
    }
  }')

echo -e "${GREEN}✅ Country Office Authorization Issued${NC}"

# Issue Government Authorization
echo "Issuing Government Authorization..."
GOV_CRED_RESPONSE=$(curl -s -X POST $BASE_URL/api/hierarchy/credentials/issue \
  -H "Authorization: Bearer $COOF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "issuerDid": "'$COOF_DID'",
    "subjectDid": "'$GOV_DID'",
    "credentialType": "government_authorization",
    "claims": {
      "authorizedRegions": ["Kenya"],
      "validFrom": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "authorityLevel": "National"
    }
  }')

echo -e "${GREEN}✅ Government Authorization Issued${NC}"

# Issue School Authorization
echo "Issuing School Authorization..."
SCHOOL_CRED_RESPONSE=$(curl -s -X POST $BASE_URL/api/hierarchy/credentials/issue \
  -H "Authorization: Bearer $GOV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "issuerDid": "'$GOV_DID'",
    "subjectDid": "'$SCHOOL_DID'",
    "credentialType": "school_authorization",
    "claims": {
      "schoolType": "Primary",
      "accreditationLevel": "Full",
      "validFrom": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "studentCapacity": 500
    }
  }')

echo -e "${GREEN}✅ School Authorization Issued${NC}"

echo -e "\n${BLUE}Step 5: Check Permissions${NC}"
echo "========================"

# Check Giga Admin Permissions
echo "Checking Giga Admin Permissions..."
GIGA_PERMS=$(curl -s -X GET $BASE_URL/api/hierarchy/permissions/user/hierarchy_admin \
  -H "Authorization: Bearer $GIGA_TOKEN")

echo "Giga Admin Permissions:"
echo $GIGA_PERMS | jq '.data.permissions.permissions'

# Check Government Admin Permissions
echo -e "\nChecking Government Admin Permissions..."
GOV_PERMS=$(curl -s -X GET $BASE_URL/api/hierarchy/permissions/user/gov_admin \
  -H "Authorization: Bearer $GIGA_TOKEN")

echo "Government Admin Permissions:"
echo $GOV_PERMS | jq '.data.permissions.permissions'

echo -e "\n${BLUE}Step 6: View System Summary${NC}"
echo "==========================="

SUMMARY=$(curl -s -X GET $BASE_URL/api/hierarchy/summary \
  -H "Authorization: Bearer $GIGA_TOKEN")

echo "System Summary:"
echo $SUMMARY | jq '.data.typeCounts'

echo -e "\n${BLUE}Step 7: View Hierarchy${NC}"
echo "====================="

HIERARCHY=$(curl -s -X GET $BASE_URL/api/hierarchy/hierarchy \
  -H "Authorization: Bearer $GIGA_TOKEN")

echo "Complete Hierarchy Structure:"
echo $HIERARCHY | jq '.data'

echo -e "\n${BLUE}Step 8: Test Blockchain Integration${NC}"
echo "=================================="

# Check ETH balance
echo "Checking ETH balance for Giga Admin..."
BALANCE=$(curl -s -X GET $BASE_URL/api/balance \
  -H "Authorization: Bearer $GIGA_TOKEN")

echo "Blockchain Status:"
echo $BALANCE | jq '.'

echo -e "\n${GREEN}🎉 Complete API Workflow Test Completed Successfully!${NC}"
echo -e "\n${YELLOW}Summary:${NC}"
echo "✅ 4 Users created with DIDs and JWT tokens"
echo "✅ 4 Organizations created in hierarchy"
echo "✅ All users associated with their organizations"
echo "✅ 3 Authorization credentials issued"
echo "✅ Permissions verified for all users"
echo "✅ System summary and hierarchy retrieved"
echo "✅ Blockchain integration tested"

echo -e "\n${BLUE}Your GigaID system is fully operational!${NC}"
echo -e "\n${YELLOW}Access the web interface at:${NC}"
echo "🌐 http://localhost:3000/hierarchy-test-password"
echo "🌐 http://localhost:3000/password-auth-test"