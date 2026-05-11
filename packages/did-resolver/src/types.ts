/**
 * Public types for the did:aip resolver.
 *
 * Mirrors the W3C DID Core 1.0 data model with the AIP-specific
 * additions documented in the did:aip Method Specification.
 */

export type AgentTypeName = "Llm" | "Task" | "Execution";

export interface Capability {
  name: string;
  description: string;
}

export interface AgentRecord {
  owner: string;            // base58 pubkey
  agentId: string;
  did: string;              // canonical did:aip string stored on chain
  name: string;
  endpoint: string;
  walletAddress: string;    // base58 pubkey
  agentType: AgentTypeName;
  capabilities: Capability[];
  pricePerTask: bigint;     // lamports
  version: string;
  registeredAt: bigint;     // unix seconds
  updatedAt: bigint;        // unix seconds
  bump: number;
}

export interface VerificationMethod {
  id: string;
  type: "Ed25519VerificationKey2020";
  controller: string;
  publicKeyMultibase: string;
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

export interface ResolutionMetadata {
  contentType: "application/did+ld+json";
  pda: string;
  bump: number;
  slot: number;
  network: string;
  fetchedAt: string;        // ISO timestamp
}

export interface DocumentMetadata {
  registered: string;       // ISO timestamp from registered_at
  updated: string;          // ISO timestamp from updated_at
  deactivated?: boolean;
}

export interface ResolutionResult {
  didDocument: DidDocument | null;
  didResolutionMetadata: ResolutionMetadata | { error: ResolutionError };
  didDocumentMetadata: DocumentMetadata | Record<string, never>;
  agentRecord: AgentRecord | null;
}

export type ResolutionError =
  | "invalidDid"
  | "notFound"
  | "deactivated"
  | "internalError";

export interface ParsedDid {
  ownerPubkey: string;      // base58
  agentId: string;
}

export interface ResolverOptions {
  rpcEndpoint?: string;
  programId?: string;
  network?: string;
  commitment?: "processed" | "confirmed" | "finalized";
}
