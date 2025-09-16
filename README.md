# GigaID: Decentralized Digital Identity System

**GigaID** is a production-ready decentralized identity platform that combines **Decentralized Identifiers (DIDs)**, **Verifiable Credentials (VCs)**, **Multisig Wallet Integration**, and **Ethereum blockchain** technology to create a secure, privacy-preserving digital identity system with modern authentication and institutional governance.

## 🌟 What is GigaID?

GigaID enables governments, institutions, and individuals to:

- **Create** unique decentralized identities with individual DIDs
- **Issue** tamper-proof verifiable credentials with institutional authority
- **Verify** credentials cryptographically with blockchain proof
- **Transfer** digital assets securely via multisig governance
- **Propose** transactions as delegates without being owners
- **Maintain** sovereignty over personal data with institutional backing

### Key Innovation: Web2 UX + Web3 Security + Institutional Governance

#### **Individual Identity System**

- **Password Authentication** - Secure bcrypt-hashed password authentication
- **Unique DIDs** - Each user gets their own individual `did:ethr` identity
- **JWT Tokens** - Modern, stateless authentication with access and refresh tokens
- **No private key management** - Handled securely by the system via Veramo

#### **Multisig Integration**

- **Dual-Key Architecture** - Personal DID + Institutional multisig configuration
- **Delegate Transactions** - Propose transactions without being multisig owners
- **Safe Integration** - Compatible with Gnosis Safe multisig wallets
- **Manual Delegate Management** - Flexible control over institutional permissions

#### **User Experience**

- **Instant onboarding** - Familiar web interface experience
- **Cryptographic security** - Full blockchain-backed verification
- **Flexible Architecture** - Works for both individual and institutional use cases

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- SQLite (default) or PostgreSQL
- Ethereum RPC endpoint (Sepolia testnet recommended)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd GigaID_PoC

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start the development server
npm run dev
```

### Environment Variables

```bash
# Database (SQLite default)
DATABASE_NAME=database.sqlite

# Ethereum
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID

# Server
PORT=3000
NODE_ENV=development
SECRET_KEY=your-secret-key
JWT_SECRET=your-jwt-secret

# Session
SESSION_SECRET=your-session-secret
```

## 🔐 Authentication System

### Password-Based Authentication with JWT

GigaID uses a modern authentication system combining secure password storage with JWT tokens:

#### Registration

**Standard User Registration:**

```bash
POST /api/auth/register
{
  "username": "user123",
  "email": "user@example.com",
  "displayName": "User Name",
  "password": "secure_password123"
}
```

**Multisig User Registration:**

```bash
POST /api/auth/register
{
  "username": "institution_user",
  "email": "user@institution.org",
  "displayName": "Institution Representative",
  "password": "secure_password123",
  "multisigWalletAddress": "0x2c88A030D9D7edc924d7069718883Db09391fdc7"
}
```

**Response (Both Types):**

```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "username": "user123",
    "email": "user@example.com",
    "did": "did:ethr:0x033730e561ce...", // Always unique DID
    "authMethod": "password"
  },
  "auth": {
    "token": "jwt_access_token",
    "refreshToken": "jwt_refresh_token"
  }
}
```

**Note:** Both standard and multisig users receive **unique individual DIDs**. The multisig configuration is separate from the DID identity.

#### Login

```bash
POST /api/auth/login
{
  "username": "user123",
  "password": "secure_password123"
}
```

#### API Access

```bash
GET /api/balance
Authorization: Bearer <jwt_access_token>
```

#### Token Refresh

```bash
POST /api/auth/refresh
Authorization: Bearer <refresh_token>
```

### Security Features

- **bcrypt Hashing**: Passwords hashed with 12 salt rounds
- **JWT Tokens**:
  - Access tokens: 24-hour expiry
  - Refresh tokens: 7-day expiry
  - HMAC SHA256 signing
- **Unique DID Creation**: Each user gets a unique individual `did:ethr` identity
- **Dual-Key Architecture**:
  - **Individual DID**: For personal identity and credentials
  - **EOA Address**: For blockchain operations and delegate transactions
  - **Multisig Integration**: Optional institutional governance layer

## 🏗️ System Architecture

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend UI   │    │  Authentication │    │   Blockchain    │
│                 │    │   (Password)    │    │   (Ethereum)    │
│ • Registration  │────│                 │────│                 │
│ • Credential UI │    │ • JWT Tokens    │    │ • DID Registry  │
│ • ETH Transfer  │    │ • bcrypt Hash   │    │ • Transactions  │
│ • Delegate Txs  │    │ • Multisig Cfg  │    │ • Safe Integration │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                        ┌─────────────────┐
                        │  Veramo Agent   │
                        │                 │
                        │ • DID Manager   │
                        │ • Key Manager   │
                        │ • VC Manager    │
                        │ • Crypto Ops    │
                        │ • EOA Signing   │
                        └─────────────────┘
                                 │
                        ┌─────────────────┐
                        │    Database     │
                        │   (SQLite)      │
                        │ • User Data     │
                        │ • Credentials   │
                        │ • Organizations │
                        │ • Multisig Cfg  │
                        └─────────────────┘
```

### Organization Hierarchy

```
Giga (Root Authority)
├── Country Office
│   ├── Government
│   │   └── School
│   │       ├── Information Worker
│   │       └── Student
│   └── Government (another)
└── Country Office (another)
```

## 🔐 Multisig Integration & Delegate Transactions

### Dual-Key Architecture

GigaID implements a sophisticated dual-key system that separates personal identity from institutional governance:

#### **Individual Layer**

- **Unique DID**: Each user gets a personal `did:ethr:0x...` identity
- **Personal Credentials**: Issue and manage individual verifiable credentials
- **Direct Transactions**: Send ETH and interact with blockchain directly

#### **Institutional Layer (Optional)**

- **Multisig Configuration**: Associate user with Gnosis Safe multisig wallet
- **EOA Signer**: Generated encrypted EOA for delegate transactions
- **Delegate Proposals**: Propose transactions to multisig without being an owner
- **Institutional Authority**: Act on behalf of organizations with proper approval

### Key Benefits

✅ **Individual Identity**: Each user maintains unique personal DID
✅ **Institutional Governance**: Multisig oversight for organizational actions
✅ **Flexible Permissions**: Users can act individually OR as institutional delegates
✅ **Security**: Manual delegate management via Safe App
✅ **Traceability**: Clear audit trail of who performed which actions

### Delegate Transaction Flow

```
1. User registers with multisig configuration
2. System generates unique DID + EOA signer
3. Administrator manually adds EOA as delegate in Safe App
4. User can propose transactions as delegate (not owner)
5. Safe owners review and approve/reject proposals
```

## ✅ Implemented Features

### **Identity Management**

- **Unique DID Creation**: Automatic individual `did:ethr` generation for each user
- **Dual-Key Management**: Personal DID + optional institutional multisig configuration
- **EOA Generation**: Encrypted EOA private keys for delegate transactions
- **Address Resolution**: Extract Ethereum addresses from DIDs and EOAs
- **JWT Authentication**: Modern token-based authentication

### **Authentication System**

- **Password Authentication**: Secure bcrypt password hashing
- **JWT Token System**: Access and refresh token management
- **API Access**: Bearer token authorization
- **Session Management**: Backward compatibility with session-based auth

### **Verifiable Credentials**

- **W3C Compliant**: Full W3C VC Data Model implementation
- **Issuance**: Create and sign verifiable credentials
- **Verification**: Cryptographic verification of credentials
- **Storage**: Encrypted credential storage with AES-256-GCM

### **Hierarchical Credential System**

- **Organizational Hierarchy**: Giga → Country Office → Government → School
- **Authorization Chain**: Structured credential issuance authority
- **Credential Types**: 7 types including organization authorization, information worker, and student credentials
- **Chain Verification**: Multi-level credential validation
- **Permission System**: Role-based access control

### **Ethereum Integration**

- **Balance Checking**: View ETH balance for any DID or EOA
- **Direct Transactions**: Send ETH using DID-derived keys (individual users)
- **Delegate Transactions**: Propose ETH transfers to multisig as delegate
- **Safe Integration**: Compatible with Gnosis Safe multisig wallets
- **Gas Management**: Automatic gas estimation and optimization
- **Network Support**: Sepolia testnet (easily configurable for mainnet)

### **Multisig & Delegate Features**

- **Multisig User Registration**: Associate users with Safe multisig wallets
- **EOA Signer Generation**: Automatic encrypted EOA creation for delegates
- **Delegate Transaction Proposals**: Propose transactions without being Safe owners
- **Safe API Integration**: Direct integration with Safe Transaction Service
- **Manual Delegate Management**: Flexible control via Safe App interface
- **Dual-Key Architecture**: Separate personal and institutional transaction flows

## 🧪 Testing & Development

### Test Pages

Access these interactive test pages at `http://localhost:3000`:

- **`/password-auth-test`** - Complete authentication and blockchain testing (includes delegate transactions)
- **`/hierarchy-test-password`** - Hierarchical credential system testing
- **`/test`** - Legacy test page

### Testing Scripts

#### **Comprehensive Test Suite**

```bash
# Run all tests in sequence
./scripts/run-all-tests.sh

# Individual test scripts
./scripts/test-01-basic-user.sh           # Basic user registration and authentication
./scripts/test-02-multisig-user.sh        # Multisig user creation and dual-key setup
./scripts/test-03-multisig-transactions.sh # Safe transaction proposals and testing
./scripts/test-04-complete-flow.sh        # End-to-end system validation
```

#### **Legacy Testing Scripts**

```bash
# Legacy test scripts
./test-password-auth.sh                   # Basic password authentication
./complete-api-workflow.sh               # Full hierarchical credential flow

# Component testing
npm run test:registration-api             # API registration flow
npm run test:eth                          # Ethereum integration
npm run test:school-flow                  # School credential flow

# Database management
npm run reset-db                          # Reset database
npm run seed-db                           # Seed with test data
npm run get-org-info                      # Get organization information
```

#### **Frontend Testing**

```bash
# Interactive testing via browser
open http://localhost:3000/password-auth-test
# Features available:
# • User registration (standard & multisig)
# • ETH balance checking
# • Direct ETH transactions
# • Safe transaction proposals (as owner)
# • Delegate transaction proposals (as delegate)
```

## 📚 Documentation

### Comprehensive Guides

- **[Complete API Workflow Guide](COMPLETE_API_WORKFLOW_GUIDE.md)** - Full end-to-end workflow testing
- **[API Registration Guide](API_REGISTRATION_GUIDE.md)** - Complete API documentation
- **[User Permissions API](USER_PERMISSIONS_API.md)** - Permission system documentation

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev              # Start development server with nodemon
npm run build            # Build TypeScript to JavaScript
npm run start            # Start production server

# Database Management
npm run reset-db         # Reset database (clean state)
npm run seed-db          # Seed with test data

# Testing
npm run test:registration-api  # Test API registration
npm run test:eth              # Test Ethereum functionality
npm run test:school-flow      # Test school credential flow

# Utilities
npm run get-org-info     # Get organization information
npm run setup            # Setup public assets
```

### Project Structure

```
src/
├── agent/              # Veramo agent configuration
├── controllers/        # API controllers (auth, hierarchy)
├── middleware/         # Express middleware (auth, validation)
├── models/            # Database models (user, organization, credentials)
├── services/          # Business logic services
├── server/            # Express server setup
├── scripts/           # Test and utility scripts
├── public/            # Frontend test pages
└── validation/        # Request validation schemas
```

## 🎯 API Endpoints

### Authentication & User Management

```bash
POST /api/auth/register  # User registration (standard or multisig)
POST /api/auth/login     # User login
POST /api/auth/refresh   # Token refresh
GET  /api/balance        # Get ETH balance (EOA for multisig users)
POST /api/send-transaction           # Send ETH transaction (direct)
POST /api/propose-transaction        # Propose Safe transaction (as owner)
POST /api/propose-transaction-delegate # Propose Safe transaction (as delegate)
```

### Multisig Management

```bash
POST /api/multisig/create            # Create multisig wallet record
POST /api/multisig/associate         # Associate user with multisig
GET  /api/multisig/config           # Get user multisig configuration
GET  /api/multisig/pending          # Get pending multisig transactions
POST /api/multisig/update-controller # Update DID controller
GET  /api/multisig/debug-signer     # Debug signer information
```

### Hierarchy Management

```bash
GET  /api/hierarchy/organizations     # List organizations
POST /api/hierarchy/organizations     # Create organization
GET  /api/hierarchy/users            # List users
POST /api/hierarchy/associate        # Associate user with organization
GET  /api/hierarchy/permissions/user/:username  # Check user permissions
```

### Credentials

```bash
POST /api/hierarchy/credentials/issue    # Issue credential
GET  /api/hierarchy/credentials/received # Get received credentials
POST /api/hierarchy/credentials/verify  # Verify credential
```

## 🚀 Production Deployment

### Environment Variables (Production)

```bash
# Database
DATABASE_NAME=production.sqlite

# Ethereum
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID

# Server
PORT=3000
NODE_ENV=production
SECRET_KEY=your-production-secret-key
JWT_SECRET=your-production-jwt-secret
SESSION_SECRET=your-production-session-secret
```

### Security Considerations

- Use strong `SECRET_KEY` and `JWT_SECRET` values
- Enable HTTPS in production
- Use environment variables for all sensitive data
- Regularly rotate JWT secrets
- Monitor failed authentication attempts

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For questions and support:

#### **Documentation**

- Check the [Complete API Workflow Guide](COMPLETE_API_WORKFLOW_GUIDE.md)
- Review the [API Documentation](API_REGISTRATION_GUIDE.md)
- Read the [Testing Scripts Summary](TESTING_SCRIPTS_SUMMARY.md)

#### **Interactive Testing**

- Try the comprehensive test page: `/password-auth-test`
- Test hierarchical credentials: `/hierarchy-test-password`

#### **Automated Testing**

- Run full test suite: `./scripts/run-all-tests.sh`
- Test multisig functionality: `./scripts/test-02-multisig-user.sh`
- Test delegate transactions: Use "Propose as Delegate" button in frontend

#### **Legacy Testing**

- Run `./complete-api-workflow.sh` to test the full system
- Run `./test-password-auth.sh` to verify authentication

#### **Troubleshooting**

- Check the server logs for detailed error information
- Use debug endpoints: `/api/multisig/debug-signer`
- Verify Safe App configuration for delegate permissions
