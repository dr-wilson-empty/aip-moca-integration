import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { decodeAgentRecord } from "./borsh.js";
import { parseDid } from "./parser.js";
import {
  AgentRecord,
  DidDocument,
  ResolutionResult,
  ResolverOptions,
  ServiceEndpoint,
  VerificationMethod,
} from "./types.js";

export const DEFAULT_PROGRAM_ID =
  "CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc";
export const DEFAULT_RPC = "https://api.devnet.solana.com";
export const DEFAULT_NETWORK = "solana:devnet";

const DID_CONTEXT = [
  "https://www.w3.org/ns/did/v1",
  "https://w3id.org/security/suites/ed25519-2020/v1",
  "https://aip.network/ns/agent/v1",
];

/**
 * AipDidResolver implements DID resolution for the did:aip method.
 * The resolver is read-only and stateless beyond its RPC connection.
 */
export class AipDidResolver {
  readonly connection: Connection;
  readonly programId: PublicKey;
  readonly network: string;

  constructor(opts: ResolverOptions = {}) {
    this.connection = new Connection(
      opts.rpcEndpoint ?? DEFAULT_RPC,
      opts.commitment ?? "confirmed",
    );
    this.programId = new PublicKey(opts.programId ?? DEFAULT_PROGRAM_ID);
    this.network = opts.network ?? DEFAULT_NETWORK;
  }

  /**
   * Compute the AgentRecord PDA for a parsed did:aip identifier without
   * touching the network. Useful for tooling that needs the address
   * without performing a full resolution round-trip.
   */
  derivePda(did: string): { pda: PublicKey; bump: number } {
    const { ownerPubkey, agentId } = parseDid(did);
    const ownerBytes = bs58.decode(ownerPubkey);
    if (ownerBytes.length !== 32) {
      throw new Error("invalidDid: owner pubkey must decode to 32 bytes");
    }
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [
        new TextEncoder().encode("agent"),
        ownerBytes,
        new TextEncoder().encode(agentId),
      ],
      this.programId,
    );
    return { pda, bump };
  }

  /**
   * Resolve a did:aip DID to its DID Document.
   *
   * Implements the resolution algorithm from section 6.1 of the
   * did:aip Method Specification. Errors are returned in
   * resolution metadata rather than thrown.
   */
  async resolve(did: string): Promise<ResolutionResult> {
    let pda: PublicKey;
    let bump: number;
    try {
      ({ pda, bump } = this.derivePda(did));
    } catch {
      return failure(did, "invalidDid");
    }

    const slotPromise = this.connection.getSlot();
    const accountInfo = await this.connection.getAccountInfo(pda, {
      commitment: "confirmed",
    });
    const slot = await slotPromise;

    if (accountInfo === null) {
      return {
        didDocument: null,
        didResolutionMetadata: { error: "notFound" },
        didDocumentMetadata: { deactivated: true } as never,
        agentRecord: null,
      };
    }

    if (!accountInfo.owner.equals(this.programId)) {
      return failure(did, "notFound");
    }

    let record: AgentRecord;
    try {
      record = decodeAgentRecord(new Uint8Array(accountInfo.data));
    } catch {
      return failure(did, "internalError");
    }

    const didDocument = buildDidDocument(did, record);
    return {
      didDocument,
      didResolutionMetadata: {
        contentType: "application/did+ld+json",
        pda: pda.toBase58(),
        bump,
        slot,
        network: this.network,
        fetchedAt: new Date().toISOString(),
      },
      didDocumentMetadata: {
        registered: new Date(Number(record.registeredAt) * 1000).toISOString(),
        updated: new Date(Number(record.updatedAt) * 1000).toISOString(),
      },
      agentRecord: record,
    };
  }
}

function failure(_did: string, error: "invalidDid" | "notFound" | "internalError"): ResolutionResult {
  return {
    didDocument: null,
    didResolutionMetadata: { error },
    didDocumentMetadata: {},
    agentRecord: null,
  };
}

function buildDidDocument(did: string, record: AgentRecord): DidDocument {
  const verificationMethod: VerificationMethod = {
    id: `${did}#key-1`,
    type: "Ed25519VerificationKey2020",
    controller: did,
    publicKeyMultibase: `z${record.walletAddress}`,
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
