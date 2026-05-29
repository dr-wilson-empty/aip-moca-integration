/**
 * did:aip resolver for Moca Chain.
 *
 * Functional port of packages/did-resolver/src/resolver.ts (which reads Solana).
 * Same idea: parse a did:aip identifier, read the agent record on-chain, and
 * return a W3C DID Document. The differences are EVM-shaped:
 *   - owner is a 0x EVM address (not a base58 Solana pubkey)
 *   - the record is read via the AipRegistry contract (not a PDA + borsh)
 *   - verification uses secp256k1 / blockchainAccountId (not Ed25519)
 *
 * Moca did:aip form:  did:aip:0x{40 hex}:{agentId}
 */
import { getAddress, isAddress, type Address } from "viem";
import {
  AipRegistryClient,
  MOCA_TESTNET_RPC,
  agentTypeName,
  type OnChainAgentRecord,
} from "./registry-client";
import { MOCA_REGISTRY_ADDRESS } from "./deployments";

export const MOCA_TESTNET_CHAIN_ID = 222888;

const DID_AIP_EVM = /^did:aip:(0x[0-9a-fA-F]{40}):([A-Za-z0-9_-]{1,32})$/;

const DID_CONTEXT = [
  "https://www.w3.org/ns/did/v1",
  "https://w3id.org/security/suites/secp256k1recovery-2020/v2",
  "https://aip.network/ns/agent/v1",
];

/* ------------------------------------------------------------------ */
/*  DID parse / format                                                 */
/* ------------------------------------------------------------------ */

export interface ParsedMocaDid {
  owner: Address;
  agentId: string;
}

/** Parse `did:aip:0x..:agentId`. Throws on malformed input. */
export function parseMocaDid(did: string): ParsedMocaDid {
  if (typeof did !== "string") throw new TypeError("did must be a string");
  const m = DID_AIP_EVM.exec(did);
  if (!m) throw new Error(`invalidDid: ${did} is not a Moca did:aip identifier`);
  return { owner: getAddress(m[1]), agentId: m[2] };
}

/** Build the canonical Moca did:aip string. Owner is lowercased for stability. */
export function formatMocaDid(owner: Address, agentId: string): string {
  if (!isAddress(owner)) throw new Error("invalidDid: owner must be an EVM address");
  return `did:aip:${owner.toLowerCase()}:${agentId}`;
}

/* ------------------------------------------------------------------ */
/*  W3C DID Document types (EVM flavor)                                */
/* ------------------------------------------------------------------ */

export interface VerificationMethod {
  id: string;
  type: "EcdsaSecp256k1RecoveryMethod2020";
  controller: string;
  blockchainAccountId: string; // CAIP-10, e.g. eip155:222888:0x..
}

export interface ServiceEndpoint {
  id: string;
  type: "AIPAgentEndpoint";
  serviceEndpoint: string;
}

export interface DidDocument {
  "@context": string[];
  id: string;
  controller: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod: string[];
  service: ServiceEndpoint[];
}

export type ResolutionError = "invalidDid" | "notFound" | "internalError";

export interface ResolutionResult {
  didDocument: DidDocument | null;
  didResolutionMetadata:
    | { contentType: "application/did+ld+json"; network: string; chainId: number; registry: Address; fetchedAt: string }
    | { error: ResolutionError };
  didDocumentMetadata: { registered?: string; updated?: string } | Record<string, never>;
  agentRecord: OnChainAgentRecord | null;
}

/* ------------------------------------------------------------------ */
/*  Resolver                                                           */
/* ------------------------------------------------------------------ */

export class AipMocaResolver {
  private readonly client: AipRegistryClient;
  private readonly registry: Address;
  private readonly chainId: number;

  constructor(
    registryAddress: Address = MOCA_REGISTRY_ADDRESS.testnet as Address,
    rpcUrl: string = MOCA_TESTNET_RPC,
    chainId: number = MOCA_TESTNET_CHAIN_ID,
  ) {
    this.registry = registryAddress;
    this.chainId = chainId;
    this.client = new AipRegistryClient(registryAddress, rpcUrl);
  }

  /**
   * Resolve a did:aip DID to its DID Document. Errors are returned in the
   * resolution metadata rather than thrown (matches the Solana resolver).
   */
  async resolve(did: string): Promise<ResolutionResult> {
    let owner: Address;
    let agentId: string;
    try {
      ({ owner, agentId } = parseMocaDid(did));
    } catch {
      return this.failure("invalidDid");
    }

    let record: OnChainAgentRecord;
    try {
      if (!(await this.client.isAgentOnChain(owner, agentId))) {
        return this.failure("notFound");
      }
      record = await this.client.getAgent(owner, agentId);
    } catch {
      return this.failure("internalError");
    }

    return {
      didDocument: this.buildDidDocument(did, record),
      didResolutionMetadata: {
        contentType: "application/did+ld+json",
        network: `eip155:${this.chainId}`,
        chainId: this.chainId,
        registry: this.registry,
        fetchedAt: new Date().toISOString(),
      },
      didDocumentMetadata: {
        registered: new Date(Number(record.registeredAt) * 1000).toISOString(),
        updated: new Date(Number(record.updatedAt) * 1000).toISOString(),
      },
      agentRecord: record,
    };
  }

  private buildDidDocument(did: string, record: OnChainAgentRecord): DidDocument {
    // The agent's payout/signing key (walletAddress) is the verification key,
    // expressed as a CAIP-10 blockchain account on Moca Chain.
    const verificationMethod: VerificationMethod = {
      id: `${did}#controller`,
      type: "EcdsaSecp256k1RecoveryMethod2020",
      controller: did,
      blockchainAccountId: `eip155:${this.chainId}:${record.walletAddress}`,
    };

    const service: ServiceEndpoint = {
      id: `${did}#agent-endpoint`,
      type: "AIPAgentEndpoint",
      serviceEndpoint: record.endpoint,
    };

    return {
      "@context": DID_CONTEXT,
      id: did,
      controller: did,
      verificationMethod: [verificationMethod],
      authentication: [verificationMethod.id],
      assertionMethod: [verificationMethod.id],
      service: [service],
    };
  }

  private failure(error: ResolutionError): ResolutionResult {
    return {
      didDocument: null,
      didResolutionMetadata: { error },
      didDocumentMetadata: {},
      agentRecord: null,
    };
  }
}

/** Convenience: agent type as a human-readable name from a resolved record. */
export function resolvedAgentType(record: OnChainAgentRecord): string {
  return agentTypeName(record.agentType);
}
