/**
 * @aip/did-resolver
 *
 * Reference resolver for the did:aip W3C DID method, which anchors
 * autonomous agent identities to Solana program-derived addresses.
 *
 * Usage:
 *
 *   import { AipDidResolver } from "@aip/did-resolver";
 *   const resolver = new AipDidResolver({ rpcEndpoint: "https://api.devnet.solana.com" });
 *   const result = await resolver.resolve("did:aip:7xKXtg2C...:my-agent");
 *   console.log(result.didDocument);
 */

export { AipDidResolver, DEFAULT_PROGRAM_ID, DEFAULT_RPC, DEFAULT_NETWORK } from "./resolver.js";
export { parseDid, formatDid } from "./parser.js";
export { decodeAgentRecord } from "./borsh.js";
export type {
  AgentRecord,
  AgentTypeName,
  Capability,
  DidDocument,
  DocumentMetadata,
  ParsedDid,
  ResolutionError,
  ResolutionMetadata,
  ResolutionResult,
  ResolverOptions,
  ServiceEndpoint,
  VerificationMethod,
} from "./types.js";
