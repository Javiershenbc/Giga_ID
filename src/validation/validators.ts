import { z } from "zod";

/**
 * Common validators for reuse across the application
 */

// Ethereum address validation
export const ethereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format");

// Ethereum private key validation
export const ethereumPrivateKeySchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid Ethereum private key format");

// Email validation
export const emailSchema = z.string().email("Invalid email format");

// Username validation
export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(50, "Username cannot exceed 50 characters")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Username can only contain letters, numbers, underscores, and hyphens"
  );

// Display name validation
export const displayNameSchema = z
  .string()
  .min(1, "Display name is required")
  .max(100, "Display name cannot exceed 100 characters")
  .trim();

// Password validation
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password cannot exceed 100 characters");

// DID validation
export const didSchema = z
  .string()
  .startsWith("did:", "Invalid DID format - must start with 'did:'");

// UUID validation
export const uuidSchema = z.string().uuid("Invalid UUID format");

// Amount validation (for ETH transactions)
export const ethAmountSchema = z.string().refine((val) => {
  try {
    const num = parseFloat(val);
    return num > 0 && !isNaN(num) && isFinite(num);
  } catch {
    return false;
  }
}, "Invalid ETH amount - must be a positive number");

// Optional gas limit validation
export const gasLimitSchema = z
  .string()
  .refine((val) => {
    try {
      const num = parseInt(val);
      return num > 0 && !isNaN(num);
    } catch {
      return false;
    }
  }, "Invalid gas limit - must be a positive integer")
  .optional();

// Optional gas price validation
export const gasPriceSchema = z
  .string()
  .refine((val) => {
    try {
      const num = parseFloat(val);
      return num > 0 && !isNaN(num);
    } catch {
      return false;
    }
  }, "Invalid gas price - must be a positive number")
  .optional();

// Organization type validation
export const organizationTypeSchema = z.enum(
  ["giga", "country_office", "government", "school"],
  {
    errorMap: () => ({ message: "Invalid organization type" }),
  }
);

// Multisig type validation
export const multisigTypeSchema = z.enum(["gnosis_safe"], {
  errorMap: () => ({ message: "Invalid multisig type" }),
});

// Transaction status validation
export const transactionStatusSchema = z.enum(
  ["pending", "executed", "cancelled", "rejected"],
  {
    errorMap: () => ({ message: "Invalid transaction status" }),
  }
);

// Network validation (for blockchain operations)
export const networkSchema = z.enum(
  ["sepolia", "mainnet", "goerli", "holesky", "base", "base-sepolia"],
  {
    errorMap: () => ({ message: "Invalid network" }),
  }
);

// Pagination validation
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

// Common ID parameter validation
export const idParamSchema = z.object({
  id: uuidSchema,
});

// Common address parameter validation
export const addressParamSchema = z.object({
  address: ethereumAddressSchema,
});

// Common DID parameter validation
export const didParamSchema = z.object({
  did: didSchema,
});

/**
 * Helper function to validate Ethereum addresses
 */
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Helper function to validate private keys
 */
export function isValidPrivateKey(privateKey: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(privateKey);
}

/**
 * Helper function to validate DIDs
 */
export function isValidDID(did: string): boolean {
  return did.startsWith("did:");
}

/**
 * Helper function to validate email addresses
 */
export function isValidEmail(email: string): boolean {
  return z.string().email().safeParse(email).success;
}

/**
 * Helper function to normalize Ethereum addresses to checksum format
 */
export function normalizeEthereumAddress(address: string): string {
  if (!isValidEthereumAddress(address)) {
    throw new Error("Invalid Ethereum address");
  }
  // For now, just return lowercase. In production, you might want to use ethers.getAddress()
  return address.toLowerCase();
}

/**
 * Helper function to ensure private key has 0x prefix
 */
export function normalizePrivateKey(privateKey: string): string {
  const cleanKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  if (!isValidPrivateKey(cleanKey)) {
    throw new Error("Invalid private key format");
  }
  return cleanKey;
}
