import { ParsedDid } from "./types.js";

const DID_AIP_PATTERN =
  /^did:aip:([1-9A-HJ-NP-Za-km-z]{32,44}):([A-Za-z0-9_-]{1,32})$/;

/**
 * Parse a did:aip identifier into its owner pubkey and agent id components.
 *
 * Conforms to section 3.2 of the did:aip Method Specification.
 * Throws if the input is not a syntactically valid did:aip identifier.
 */
export function parseDid(did: string): ParsedDid {
  if (typeof did !== "string") {
    throw new TypeError("did:aip identifier must be a string");
  }
  const match = DID_AIP_PATTERN.exec(did);
  if (!match) {
    throw new Error(`invalidDid: ${did} does not match did:aip ABNF`);
  }
  return { ownerPubkey: match[1], agentId: match[2] };
}

/**
 * Build a canonical did:aip identifier from its components.
 */
export function formatDid(ownerPubkey: string, agentId: string): string {
  const did = `did:aip:${ownerPubkey}:${agentId}`;
  parseDid(did); // validate
  return did;
}
