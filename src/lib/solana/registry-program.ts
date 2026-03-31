/**
 * AIP Agent Registry Program — TypeScript client.
 * On-chain agent card storage and discovery.
 */
import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  Transaction,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash } from "crypto";
import { getConnection } from "./connection";
import type { AgentCard } from "@/types/aip";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const REGISTRY_PROGRAM_ID = new PublicKey(
  "CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc"
);

const DISCRIMINATORS = {
  register_agent:   Buffer.from([135, 157, 66, 195, 2, 113, 175, 30]),
  update_agent:     Buffer.from([85, 2, 178, 9, 119, 139, 102, 164]),
  deregister_agent: Buffer.from([227, 208, 166, 164, 48, 69, 111, 1]),
};

// AgentRecord account discriminator (for getProgramAccounts filter)
const AGENT_RECORD_DISCRIMINATOR = Buffer.from([4, 201, 129, 70, 197, 134, 47, 169]);

const AGENT_TYPE_MAP: Record<string, number> = { LLM: 0, Task: 1, Execution: 2 };
const AGENT_TYPE_REVERSE: Record<number, string> = { 0: "LLM", 1: "Task", 2: "Execution" };

/* ------------------------------------------------------------------ */
/*  DID Seed                                                           */
/* ------------------------------------------------------------------ */

/** Compute did_seed: sha256(did)[0..32] */
export function computeDidSeed(did: string): Buffer {
  return createHash("sha256").update(did).digest().subarray(0, 32);
}

export function deriveAgentRecordPDA(didSeed: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), didSeed],
    REGISTRY_PROGRAM_ID
  );
}

/* ------------------------------------------------------------------ */
/*  Borsh Helpers                                                      */
/* ------------------------------------------------------------------ */

function borshString(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}

function borshU8(n: number): Buffer {
  return Buffer.from([n]);
}

function borshPubkey(pk: PublicKey): Buffer {
  return pk.toBuffer();
}

function borshFixedBytes(buf: Buffer): Buffer {
  return buf; // [u8; 32] is serialized as-is in Borsh
}

/* ------------------------------------------------------------------ */
/*  Instruction Builders                                                */
/* ------------------------------------------------------------------ */

export function buildRegisterAgentIx(params: {
  owner: PublicKey;
  did: string;
  name: string;
  endpoint: string;
  walletAddress: PublicKey;
  agentType: number;
  capabilitiesJson: string;
  version: string;
}): TransactionInstruction {
  const didSeed = computeDidSeed(params.did);
  const [agentRecord] = deriveAgentRecordPDA(didSeed);

  const data = Buffer.concat([
    DISCRIMINATORS.register_agent,
    borshFixedBytes(didSeed),
    borshString(params.did),
    borshString(params.name),
    borshString(params.endpoint),
    borshPubkey(params.walletAddress),
    borshU8(params.agentType),
    borshString(params.capabilitiesJson),
    borshString(params.version),
  ]);

  return new TransactionInstruction({
    programId: REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: params.owner, isSigner: true, isWritable: true },
      { pubkey: agentRecord, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildUpdateAgentIx(params: {
  owner: PublicKey;
  did: string;
  name: string;
  endpoint: string;
  walletAddress: PublicKey;
  agentType: number;
  capabilitiesJson: string;
  version: string;
}): TransactionInstruction {
  const didSeed = computeDidSeed(params.did);
  const [agentRecord] = deriveAgentRecordPDA(didSeed);

  const data = Buffer.concat([
    DISCRIMINATORS.update_agent,
    borshString(params.name),
    borshString(params.endpoint),
    borshPubkey(params.walletAddress),
    borshU8(params.agentType),
    borshString(params.capabilitiesJson),
    borshString(params.version),
  ]);

  return new TransactionInstruction({
    programId: REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: params.owner, isSigner: true, isWritable: true },
      { pubkey: agentRecord, isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function buildDeregisterAgentIx(params: {
  owner: PublicKey;
  did: string;
}): TransactionInstruction {
  const didSeed = computeDidSeed(params.did);
  const [agentRecord] = deriveAgentRecordPDA(didSeed);

  return new TransactionInstruction({
    programId: REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: params.owner, isSigner: true, isWritable: true },
      { pubkey: agentRecord, isSigner: false, isWritable: true },
    ],
    data: DISCRIMINATORS.deregister_agent,
  });
}

/* ------------------------------------------------------------------ */
/*  On-chain Query                                                     */
/* ------------------------------------------------------------------ */

function readBorshString(buf: Buffer, offset: number): { value: string; newOffset: number } {
  const len = buf.readUInt32LE(offset);
  const value = buf.subarray(offset + 4, offset + 4 + len).toString("utf8");
  return { value, newOffset: offset + 4 + len };
}

function parseAgentRecord(data: Buffer): {
  owner: PublicKey;
  did: string;
  name: string;
  endpoint: string;
  walletAddress: PublicKey;
  agentType: number;
  capabilitiesJson: string;
  version: string;
  registeredAt: number;
  updatedAt: number;
} | null {
  try {
    let offset = 8; // skip discriminator

    const owner = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // did_seed [u8; 32]
    offset += 32;

    const did = readBorshString(data, offset);
    offset = did.newOffset;

    const name = readBorshString(data, offset);
    offset = name.newOffset;

    const endpoint = readBorshString(data, offset);
    offset = endpoint.newOffset;

    const walletAddress = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const agentType = data[offset];
    offset += 1;

    const capabilitiesJson = readBorshString(data, offset);
    offset = capabilitiesJson.newOffset;

    const version = readBorshString(data, offset);
    offset = version.newOffset;

    const registeredAt = Number(data.readBigInt64LE(offset));
    offset += 8;

    const updatedAt = Number(data.readBigInt64LE(offset));

    return {
      owner,
      did: did.value,
      name: name.value,
      endpoint: endpoint.value,
      walletAddress,
      agentType,
      capabilitiesJson: capabilitiesJson.value,
      version: version.value,
      registeredAt,
      updatedAt,
    };
  } catch {
    return null;
  }
}

/** Convert on-chain AgentRecord to AgentCard type */
function recordToAgentCard(record: ReturnType<typeof parseAgentRecord>): AgentCard | null {
  if (!record) return null;
  try {
    const capabilities = JSON.parse(record.capabilitiesJson);
    return {
      did: record.did,
      name: record.name,
      version: record.version,
      endpoint: record.endpoint,
      type: (AGENT_TYPE_REVERSE[record.agentType] ?? "Task") as AgentCard["type"],
      capabilities,
      walletAddress: record.walletAddress.toBase58(),
    };
  } catch {
    return null;
  }
}

/** Fetch all on-chain agent records */
export async function fetchAllOnChainAgents(): Promise<AgentCard[]> {
  const connection = getConnection();
  const accounts = await connection.getProgramAccounts(REGISTRY_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: AGENT_RECORD_DISCRIMINATOR.toString("base64"), encoding: "base64" } },
    ],
  });

  const cards: AgentCard[] = [];
  for (const { account } of accounts) {
    const record = parseAgentRecord(Buffer.from(account.data));
    const card = recordToAgentCard(record);
    if (card) {
      (card as AgentCard & { onChain: boolean }).onChain = true;
      cards.push(card);
    }
  }
  return cards;
}

/** Check if an agent is registered on-chain */
export async function isAgentOnChain(did: string): Promise<boolean> {
  const connection = getConnection();
  const didSeed = computeDidSeed(did);
  const [pda] = deriveAgentRecordPDA(didSeed);
  const account = await connection.getAccountInfo(pda);
  return account !== null;
}

/* ------------------------------------------------------------------ */
/*  Server-side register/deregister                                    */
/* ------------------------------------------------------------------ */

export async function registerAgentOnChain(
  ownerKeypair: Keypair,
  card: AgentCard
): Promise<string> {
  const connection = getConnection();
  const capabilitiesJson = JSON.stringify(card.capabilities);
  const agentType = AGENT_TYPE_MAP[card.type] ?? 1;

  const ix = buildRegisterAgentIx({
    owner: ownerKeypair.publicKey,
    did: card.did,
    name: card.name,
    endpoint: card.endpoint,
    walletAddress: card.walletAddress
      ? new PublicKey(card.walletAddress)
      : ownerKeypair.publicKey,
    agentType,
    capabilitiesJson,
    version: card.version,
  });

  const tx = new Transaction().add(ix);
  return sendAndConfirmTransaction(connection, tx, [ownerKeypair]);
}
