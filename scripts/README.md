# Testing Scripts

This directory contains a comprehensive testing suite for the GigaID system, including basic user functionality, multisig wallet operations, and complete end-to-end flows.

## Test Suite Overview

The testing suite is organized into 4 main test scripts plus utility scripts:

### 🚀 **Master Test Runner**

- `run-all-tests.sh` - Executes all tests in sequence and provides comprehensive summary

### 🧪 **Individual Test Scripts**

1. `test-01-basic-user.sh` - Basic user registration and authentication
2. `test-02-multisig-user.sh` - Multisig user creation and dual-key setup
3. `test-03-multisig-transactions.sh` - Safe transaction proposals and testing
4. `test-04-complete-flow.sh` - End-to-end system validation
5. `test-05-delegates.sh` - Safe delegate management and proposals

### 🛠️ **Utility Scripts**

- `register-user-with-multisig.sh` - Register user with multisig (legacy)
- `associate-user-with-multisig.sh` - Associate existing user with multisig
- `check-signer-vs-safe.sh` - Debug signer address consistency

---

## Quick Start

### Run All Tests

```bash
# Execute complete test suite
./scripts/run-all-tests.sh
```

### Run Individual Tests

```bash
# Test 1: Basic user functionality
./scripts/test-01-basic-user.sh

# Test 2: Multisig user setup
./scripts/test-02-multisig-user.sh

# Test 3: Transaction testing
./scripts/test-03-multisig-transactions.sh

# Test 4: Complete end-to-end flow
./scripts/test-04-complete-flow.sh

# Test 5: Safe delegate management
./scripts/test-05-delegates.sh
```

---

## Detailed Test Descriptions

### 🧪 `test-01-basic-user.sh`

**Purpose**: Tests standard (non-multisig) user registration and basic functionality

**What it tests**:

- User registration with username/password
- User login authentication
- Token refresh functionality
- Blockchain account creation
- ETH address generation
- Authentication methods validation

**Expected results**:

- ✅ User created with standard DID (did:ethr:<eoa_address>)
- ✅ JWT tokens working correctly
- ✅ ETH address for transaction capability
- ✅ Password authentication enabled

**Usage**:

```bash
./scripts/test-01-basic-user.sh [username] [email] [password]
```

---

### 🧪 `test-02-multisig-user.sh`

**Purpose**: Tests multisig user creation and dual-key architecture setup

**What it tests**:

- User registration with multisig DID controller
- Multisig wallet configuration
- EOA signer generation and encryption
- Dual-key architecture validation
- DID controller verification

**Expected results**:

- ✅ User created with multisig-controlled DID (did:ethr:<multisig_address>)
- ✅ EOA signer generated for daily operations
- ✅ Multisig wallet properly associated
- ✅ Dual-key separation confirmed

**Usage**:

```bash
./scripts/test-02-multisig-user.sh [multisig_address] [username] [email] [password]

# Example with real Safe address
./scripts/test-02-multisig-user.sh 0x2c88A030D9D7edc924d7069718883Db09391fdc7
```

---

### 🧪 `test-03-multisig-transactions.sh`

**Purpose**: Tests Safe transaction proposals and multisig transaction functionality

**What it tests**:

- Standard Safe transaction proposals
- Transaction proposals with override signer keys
- Server secret key transaction proposals
- Pending transaction tracking
- Safe wallet information retrieval

**Expected results**:

- ✅ Safe transactions proposed successfully
- ✅ Different signing methods working
- ✅ Transactions appear in Safe Transaction Service
- ✅ Pending transactions trackable

**Usage**:

```bash
./scripts/test-03-multisig-transactions.sh [multisig_address] [recipient] [amount] [signer_key]

# Example
./scripts/test-03-multisig-transactions.sh \
  0x2c88A030D9D7edc924d7069718883Db09391fdc7 \
  0xdD78b58A8AcAE16D62ECE9BCCe6Ec5ECf18c9EA1 \
  0.001 \
  0x76b330bcae43d4c08b22ff93dfc1d1c251c76ad7efd51454d05884cecbcc8aaa
```

---

### 🧪 `test-04-complete-flow.sh`

**Purpose**: End-to-end validation of the complete GigaID system

**What it tests**:

- Complete user creation flow (basic + multisig)
- Blockchain integration for both user types
- Transaction functionality testing
- DID and architecture validation
- API coverage testing
- System integration verification

**Expected results**:

- ✅ Both user types created successfully
- ✅ All blockchain integrations working
- ✅ Transaction systems operational
- ✅ Architecture properly implemented
- ✅ Complete API coverage confirmed

**Usage**:

```bash
./scripts/test-04-complete-flow.sh [multisig_address] [recipient] [amount]
```

---

### 🧪 `test-05-delegates.sh`

**Purpose**: Tests Safe delegate management functionality and transaction proposals

**What it tests**:

- Creating delegate add proposals
- Creating delegate remove proposals
- Direct delegate addition (tests permission validation)
- Retrieving current Safe delegates
- Local delegate record management
- API endpoint validation and error handling

**Expected results**:

- ✅ Delegate proposals created successfully
- ✅ Permission validation working correctly
- ✅ Safe Transaction Service integration functional
- ✅ Local delegate tracking operational
- ✅ API security and validation proper

**Usage**:

```bash
./scripts/test-05-delegates.sh [multisig_address] [delegate_address] [label]

# Example with real addresses
./scripts/test-05-delegates.sh \
  0x2c88A030D9D7edc924d7069718883Db09391fdc7 \
  0xdD78b58A8AcAE16D62ECE9BCCe6Ec5ECf18c9EA1 \
  "Treasury Delegate"
```

---

## Legacy Utility Scripts

### 📝 `register-user-with-multisig.sh`

**Purpose**: Register a single user with multisig-controlled DID and EOA management

**Features**:

- Registers a new user account
- Creates/registers a multisig wallet
- Associates user with the multisig wallet
- Generates EOA signer for daily operations
- Updates DID controller to multisig address
- Verifies the complete dual-key setup

**Usage**:

```bash
# Basic usage (uses default values)
./scripts/register-user-with-multisig.sh

# Specify multisig address
./scripts/register-user-with-multisig.sh 0xYourMultisigAddress...

# Specify all parameters
./scripts/register-user-with-multisig.sh \
  0xYourMultisigAddress... \
  username \
  user@example.com \
  password123
```

**Parameters**:

1. `MULTISIG_ADDRESS` (optional) - The multisig wallet address
2. `USERNAME` (optional) - Username for the new user
3. `EMAIL` (optional) - Email for the new user
4. `PASSWORD` (optional) - Password for the new user

**Default Values**:

- Multisig Address: `0x1234567890123456789012345678901234567890`
- Username: `alice_admin`
- Email: `alice@school.edu`
- Password: `securePass123`

**Output**:

- Detailed step-by-step progress with color coding
- Final configuration summary
- Saves user config to `user_config_{username}.json`
- Returns JWT token for further API testing

**Prerequisites**:

- Server running on `http://localhost:3000`
- `jq` installed for JSON processing

## Example Workflows

### Test Different Multisig Addresses

```bash
# Test with Gnosis Safe address
./scripts/register-user-with-multisig.sh 0xa1b2c3d4e5f6789012345678901234567890abcd alice1 alice1@test.com pass123

# Test with another multisig
./scripts/register-user-with-multisig.sh 0x1111222233334444555566667777888899990000 bob1 bob1@test.com pass456
```

### Create Multiple Users for Hierarchy Testing

```bash
# Create admin user
./scripts/register-user-with-multisig.sh 0xMultisigAddr... admin admin@school.edu adminpass

# Create teacher user (will use standard DID, not multisig)
./scripts/register-user-with-multisig.sh 0xDifferentAddr... teacher teacher@school.edu teachpass

# Create student user (will use standard DID, not multisig)
./scripts/register-user-with-multisig.sh 0xAnotherAddr... student student@school.edu studpass
```

## Configuration Files

Each script run creates a configuration file:

- **Filename**: `user_config_{username}.json`
- **Contains**: User details, multisig config, JWT token, timestamps
- **Purpose**: Reference for further testing, API calls

**Example config file**:

```json
{
  "user": {
    "id": "uuid-here",
    "username": "alice_admin",
    "email": "alice@school.edu",
    "did": "did:ethr:sepolia:0x...",
    "token": "jwt-token-here"
  },
  "multisig": {
    "walletAddress": "0x1234567890123456789012345678901234567890",
    "signerAddress": "0xGeneratedEOAAddress...",
    "enabled": true
  },
  "created": "2024-01-15T10:30:00Z"
}
```

---

## Test Results and Output

### 📊 Test Result Files

Each test generates detailed JSON result files:

- `test_results_basic_user_*.json` - Basic user test results
- `test_results_multisig_user_*.json` - Multisig user test results
- `test_results_multisig_transactions_*.json` - Transaction test results
- `test_results_complete_flow_*.json` - Complete flow test results
- `test_results_delegates_*.json` - Delegate management test results
- `test_results_master_suite_*.json` - Master test suite summary

### 📈 Success Criteria

**Individual Tests**:

- All API calls return 2xx status codes
- User tokens are generated and valid
- DID formats are correct
- Multisig configuration is proper
- Transactions are proposed successfully

**Master Test Suite**:

- All 5 test suites pass
- Success rate > 90% for production readiness
- No critical failures in core functionality

---

## Prerequisites

### 🔧 System Requirements

```bash
# Required tools
jq          # JSON processing
bc          # Calculator for success rate calculation
curl        # HTTP requests
chmod       # Script permissions

# macOS installation
brew install jq bc

# Ubuntu/Debian installation
sudo apt-get install jq bc curl
```

### 🚀 Server Setup

```bash
# Start the development server
npm run dev

# Verify server is running
curl http://localhost:3000/health
```

### 🔑 Environment Configuration

For transaction testing, ensure you have:

- Valid multisig Safe address (Sepolia testnet)
- EOA private key that is an owner of the Safe
- Test ETH in the Safe for transaction proposals

---

## Advanced Usage

### 🎯 Custom Test Configuration

```bash
# Test with specific multisig
export MULTISIG_ADDRESS="0x2c88A030D9D7edc924d7069718883Db09391fdc7"
export RECIPIENT_ADDRESS="0xdD78b58A8AcAE16D62ECE9BCCe6Ec5ECf18c9EA1"
export TEST_AMOUNT="0.001"

./scripts/run-all-tests.sh
```

### 🔍 Debug Mode

```bash
# Run tests with verbose output
set -x  # Add to beginning of script for debug mode
./scripts/test-01-basic-user.sh

# Check specific API responses
curl -s http://localhost:3000/api/health | jq '.'
```

### 🧹 Cleanup

```bash
# Remove test result files
rm test_results_*.json

# Remove generated user config files
rm user_config_*.json
```

---

## Integration with Other Tools

### 🦊 Safe App Integration

Transaction results can be viewed in the Safe App:

1. Visit https://app.safe.global
2. Connect with your Safe address
3. Check pending transactions for test results

### 📬 API Testing

Use generated tokens for manual API testing:

```bash
# Extract token from results
TOKEN=$(jq -r '.tokens.accessToken' test_results_complete_flow_*.json)

# Test API calls
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/multisig/config
```

### 🔗 CI/CD Integration

```bash
# Exit codes for automation
# 0 = All tests passed
# 1 = Some tests failed
# 2 = Major failures

if ./scripts/run-all-tests.sh; then
    echo "✅ All tests passed - deploy to staging"
else
    echo "❌ Tests failed - block deployment"
    exit 1
fi
```

## Troubleshooting

### Common Issues

**Server not running**:

```bash
# Start the development server
npm run dev
```

**jq not installed**:

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq
```

**Script not executable**:

```bash
chmod +x scripts/register-user-with-multisig.sh
```

**User already exists**:

- Script will attempt login with existing user
- Use different username/email parameters
- Or manually delete user from database

### Debug Mode

For detailed debugging, modify the script:

```bash
# Add verbose curl output
curl -v -s -X POST ...

# Add debug logging
set -x  # Add at top of script for verbose execution
```

## Integration with Other Tools

The generated JWT tokens and configuration files can be used with:

- Manual API testing (cURL, Postman)
- Other testing scripts
- Custom integration tests
- Frontend application testing
