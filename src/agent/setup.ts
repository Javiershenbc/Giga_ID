import {
  createAgent,
  IResolver,
  IIdentifier,
  ICreateVerifiableCredentialArgs,
  IVerifyCredentialArgs,
  IVerifyResult,
  TAgent,
  IKeyManager,
  IDIDManager,
} from "@veramo/core";
import { DIDManager } from "@veramo/did-manager";
import { KeyManager } from "@veramo/key-manager";
import { KeyManagementSystem, SecretBox } from "@veramo/kms-local";
import { DIDResolverPlugin } from "@veramo/did-resolver";
import { EthrDIDProvider } from "@veramo/did-provider-ethr";
import {
  DataStore,
  DataStoreORM,
  KeyStore,
  DIDStore,
  PrivateKeyStore,
  migrations,
} from "@veramo/data-store";
import { CredentialPlugin } from "@veramo/credential-w3c";
import { Resolver } from "did-resolver";
import { getResolver as getEthrResolver } from "ethr-did-resolver";
import { DataSource } from "typeorm";
import { env } from "../config/env.js";

// Simplified agent type - let Veramo handle the complex types
export type ConfiguredAgent = TAgent<IResolver & IKeyManager & IDIDManager>;

// Create Veramo agent with plugins
export const createVeramoAgent = async (
  dbConnection: DataSource,
  secretKey: string
): Promise<ConfiguredAgent> => {
  // 1. Ethereum DID Resolver Configuration
  const ethrResolver = getEthrResolver({
    networks: [
      {
        name: "mainnet",
        rpcUrl: `https://mainnet.infura.io/v3/${env.INFURA_PROJECT_ID}`,
        registry: "0xdca7ef03e98e0dc2b855be647c39abe984fcf21b", // Mainnet registry
      },
      {
        name: "sepolia",
        rpcUrl: `https://sepolia.infura.io/v3/${env.INFURA_PROJECT_ID}`,
        registry: "0x03d5003bf0e79c5f5223589f2201b33f5e5f090d", // Sepolia registry
      },
    ],
  });

  // 2. Key Management System
  const keyStore = new KeyStore(dbConnection);
  const privateKeyStore = new PrivateKeyStore(
    dbConnection,
    new SecretBox(secretKey)
  );
  const kms = new KeyManagementSystem(privateKeyStore);

  // 3. Agent Configuration with Plugins
  const agent = createAgent<IResolver & IKeyManager & IDIDManager>({
    plugins: [
      // Key Management
      new KeyManager({
        store: keyStore,
        kms: {
          local: kms,
        },
      }),
      // DID Management
      new DIDManager({
        store: new DIDStore(dbConnection),
        defaultProvider: "did:ethr",
        providers: {
          "did:ethr": new EthrDIDProvider({
            defaultKms: "local",
            network: env.ETH_NETWORK,
          }),
        },
      }),
      // DID Resolution
      new DIDResolverPlugin({
        resolver: new Resolver({
          ...ethrResolver,
        }),
      }),
      // Data Storage
      new DataStore(dbConnection),
      new DataStoreORM(dbConnection),
      // Credential Management
      new CredentialPlugin(),
    ],
  });

  return agent;
};
