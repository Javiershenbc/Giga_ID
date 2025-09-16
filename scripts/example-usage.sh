#!/bin/bash

# Example Usage of register-user-with-multisig.sh
# This shows different ways to use the registration script

echo "🚀 Multisig User Registration Examples"
echo "====================================="
echo ""

# Example 1: Basic usage with defaults
echo "📝 Example 1: Basic usage (default values)"
echo "Command: ./scripts/register-user-with-multisig.sh"
echo "Uses:"
echo "  - Default multisig: 0x1234567890123456789012345678901234567890"
echo "  - Default user: alice_admin / alice@school.edu"
echo ""

# Example 2: Custom multisig address
echo "📝 Example 2: Custom multisig address"
echo "Command: ./scripts/register-user-with-multisig.sh 0xa1b2c3d4e5f6789012345678901234567890abcd"
echo "Uses:"
echo "  - Custom multisig: 0xa1b2c3d4e5f6789012345678901234567890abcd"
echo "  - Default user: alice_admin / alice@school.edu"
echo ""

# Example 3: Full customization
echo "📝 Example 3: Full customization"
echo "Command: ./scripts/register-user-with-multisig.sh \\"
echo "  0xa1b2c3d4e5f6789012345678901234567890abcd \\"
echo "  school_principal \\"
echo "  principal@westfield.edu \\"
echo "  securePassword2024"
echo ""

# Example 4: Multiple users for hierarchy testing
echo "📝 Example 4: Creating user hierarchy"
echo ""

echo "4a. Create School Administrator:"
echo "./scripts/register-user-with-multisig.sh \\"
echo "  0x1111111111111111111111111111111111111111 \\"
echo "  admin \\"
echo "  admin@westfield.edu \\"
echo "  adminpass123"
echo ""

echo "4b. Create Department Head:"
echo "./scripts/register-user-with-multisig.sh \\"
echo "  0x2222222222222222222222222222222222222222 \\"
echo "  dept_head \\"
echo "  head@westfield.edu \\"
echo "  headpass123"
echo ""

echo "4c. Create Teacher:"
echo "./scripts/register-user-with-multisig.sh \\"
echo "  0x3333333333333333333333333333333333333333 \\"
echo "  teacher \\"
echo "  teacher@westfield.edu \\"
echo "  teachpass123"
echo ""

# Example 5: Actual execution (commented out)
echo "📝 Example 5: Actual execution (uncomment to run)"
echo ""

# Uncomment the lines below to actually run examples:

# echo "Running Example 1 - Basic usage..."
# ./scripts/register-user-with-multisig.sh

# echo "Running Example 2 - Custom multisig..."
# ./scripts/register-user-with-multisig.sh 0xa1b2c3d4e5f6789012345678901234567890abcd

# echo "Running Example 3 - Full customization..."
# ./scripts/register-user-with-multisig.sh \
#   0xa1b2c3d4e5f6789012345678901234567890abcd \
#   school_principal \
#   principal@westfield.edu \
#   securePassword2024

echo "💡 Tips:"
echo "  • Make sure the server is running: npm run dev"
echo "  • Each run creates a config file: user_config_{username}.json"
echo "  • Use different usernames/emails to avoid conflicts"
echo "  • The JWT token in the output can be used for further API testing"
echo ""

echo "🔍 After registration, check the results:"
echo "  • Review the final configuration summary"
echo "  • Check the generated config file"
echo "  • Use the JWT token for credential issuance testing"
echo "  • Verify dual-key setup (EOA + Multisig addresses)"