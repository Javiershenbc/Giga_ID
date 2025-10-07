import { Router } from "express";
import { DataSource } from "typeorm";
import { z } from "zod";
import { MultisigController } from "../controllers/multisig.js";
import { ConfiguredAgent } from "../agent/setup.js";
import { requireAuth } from "../middleware/auth.js";
import { validateRequest } from "../middleware/validation.js";
import {
  ethereumAddressSchema,
  ethereumPrivateKeySchema,
  multisigTypeSchema,
  uuidSchema,
  addressParamSchema,
} from "../validation/validators.js";

// Validation schemas for multisig operations
const createMultisigWalletSchema = z.object({
  body: z.object({
    address: ethereumAddressSchema,
    type: multisigTypeSchema,
    owners: z.array(ethereumAddressSchema).min(1),
    threshold: z.number().int().min(1),
    network: z.string().min(1),
  }),
});

const hex64 = /^[a-fA-F0-9]{64}$/;
const maybePrefixedPk = z
  .string()
  .transform((v) => (v && !v.startsWith("0x") ? `0x${v}` : v))
  .refine((v) => !v || /^0x[a-fA-F0-9]{64}$/.test(v), {
    message: "Invalid Ethereum private key format",
  })
  .optional();

const associateWithMultisigSchema = z.object({
  body: z.object({
    multisigWalletAddress: ethereumAddressSchema,
    signerPrivateKey: maybePrefixedPk,
    generateSigner: z.boolean().optional(),
  }),
});

const updateDIDControllerSchema = z.object({
  body: z.object({
    newControllerAddress: ethereumAddressSchema,
  }),
});

const walletAddressParamSchema = z.object({
  params: addressParamSchema,
});

export function createMultisigRoutes(
  agent: ConfiguredAgent,
  dataSource: DataSource
): Router {
  const router = Router();
  const multisigController = new MultisigController(agent, dataSource);

  // Apply authentication middleware to all routes
  router.use(requireAuth);

  // Multisig wallet management routes
  router.post(
    "/wallets",
    validateRequest(createMultisigWalletSchema),
    multisigController.createMultisigWallet.bind(multisigController)
  );

  router.post(
    "/associate",
    validateRequest(associateWithMultisigSchema),
    multisigController.associateWithMultisig.bind(multisigController)
  );

  router.post(
    "/update-did-controller",
    validateRequest(updateDIDControllerSchema),
    multisigController.updateDIDController.bind(multisigController)
  );

  router.get(
    "/config",
    multisigController.getUserMultisigConfig.bind(multisigController)
  );

  router.get(
    "/transactions/pending",
    multisigController.getPendingTransactions.bind(multisigController)
  );

  router.get(
    "/wallets/:address",
    validateRequest(walletAddressParamSchema),
    multisigController.getMultisigWallet.bind(multisigController)
  );

  router.post(
    "/disable",
    multisigController.disableMultisig.bind(multisigController)
  );

  // Debug and development routes
  router.get(
    "/debug-signer",
    multisigController.debugSigner.bind(multisigController)
  );

  return router;
}
