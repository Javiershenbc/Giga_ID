import { z } from "zod";
import {
  didSchema,
  emailSchema,
  usernameSchema,
  displayNameSchema,
  passwordSchema,
} from "./validators.js";

// Basic credential subject schema
const credentialSubjectSchema = z
  .object({
    id: didSchema,
  })
  .catchall(z.any());

// Issuer schema
const issuerSchema = z.union([
  didSchema,
  z.object({
    id: didSchema,
  }),
]);

// Verifiable Credential schema
export const verifiableCredentialSchema = z.object({
  "@context": z.array(z.string()).min(1),
  type: z.array(z.string()).min(1),
  issuer: issuerSchema,
  issuanceDate: z.string().datetime().optional(),
  expirationDate: z.string().datetime().optional(),
  credentialSubject: credentialSubjectSchema,
  proof: z
    .object({
      type: z.string(),
      jwt: z.string(),
    })
    .optional(),
});

// Verification request schema
export const verifyRequestSchema = z.object({
  body: z.object({
    credential: z.string(),
  }),
});

// Issuance request schema
export const issueCredentialRequestSchema = z.object({
  body: z.object({
    credential: z.object({
      "@context": z.array(z.string()).min(1),
      type: z.array(z.string()).min(1),
      issuer: issuerSchema,
      credentialSubject: credentialSubjectSchema,
    }),
  }),
});

// User registration schema
export const userRegistrationSchema = z.object({
  body: z.object({
    username: usernameSchema,
    displayName: displayNameSchema,
  }),
});

// API registration schema (for third-party integration)
export const apiRegistrationSchema = z.object({
  body: z.object({
    username: usernameSchema,
    email: emailSchema,
    displayName: displayNameSchema,
    password: passwordSchema,
    timestamp: z.number().int().positive(),
  }),
});

// Credential issuance request schema
export const credentialIssuanceSchema = z.object({
  body: z.object({
    issuerDid: didSchema,
    subjectDid: didSchema,
    type: z.array(z.string()).min(1),
    context: z.array(z.string()).min(1),
    claims: z.record(z.any()), // Arbitrary claims
  }),
});
