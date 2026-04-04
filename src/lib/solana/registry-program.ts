/**
 * AIP Agent Registry Program — TypeScript client.
 * One wallet can register multiple agents, each with a unique agent_id.
 * PDA seeds: ["agent", owner_pubkey, agent_id_bytes]
 */
import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  Transaction,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
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

const AGENT_RECORD_DISCRIMINATOR = Buffer.from([4, 201, 129, 70, 197, 134, 47, 169]);

const AGENT_TYPE_MAP: Record<string, number> = { LLM: 0, Task: 1, Execution: 2 };
const AGENT_TYPE_REVERSE: Record<number, string> = { 0: "LLM", 1: "Task", 2: "Execution" };

/* ------------------------------------------------------------------ */
/*  DID + PDA                                                          */
/* ------------------------------------------------------------------ */

/** Generate a deterministic DID from owner + agent_id */
export function generateDid(ownerPubkey: string, agentId: string): string {
  return `did:aip:${ownerPubkey.slice(0, 8)}:${agentId}`;
}

/** Derive PDA: ["agent", owner, agent_id] */
export function deriveAgentRecordPDA(owner: PublicKey, agentId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer(), Buffer.from(agentId)],
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

/* ------------------------------------------------------------------ */
/*  Instruction Builders                                                */
/* ------------------------------------------------------------------ */

export function buildRegisterAgentIx(params: {
  owner: PublicKey;
  agentId: string;
  did: string;
  name: string;
  endpoint: string;
  walletAddress: PublicKey;
  agentType: number;
  capabilitiesJson: string;
  version: string;
}): TransactionInstruction {
  const [agentRecord] = deriveAgentRecordPDA(params.owner, params.agentId);

  const data = Buffer.concat([
    DISCRIMINATORS.register_agent,
    borshString(params.agentId),
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
  agentId: string;
  name: string;
  endpoint: string;
  walletAddress: PublicKey;
  agentType: number;
  capabilitiesJson: string;
  version: string;
}): TransactionInstruction {
  const [agentRecord] = deriveAgentRecordPDA(params.owner, params.agentId);

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
  agentId: string;
}): TransactionInstruction {
  const [agentRecord] = deriveAgentRecordPDA(params.owner, params.agentId);

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

export interface ParsedAgentRecord {
  owner: string;
  agentId: string;
  did: string;
  name: string;
  endpoint: string;
  walletAddress: string;
  agentType: number;
  capabilitiesJson: string;
  version: string;
  registeredAt: number;
  updatedAt: number;
}

function parseAgentRecord(data: Buffer): ParsedAgentRecord | null {
  try {
    let offset = 8; // skip discriminator

    const owner = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    offset += 32;

    const agentId = readBorshString(data, offset);
    offset = agentId.newOffset;

    const did = readBorshString(data, offset);
    offset = did.newOffset;

    const name = readBorshString(data, offset);
    offset = name.newOffset;

    const endpoint = readBorshString(data, offset);
    offset = endpoint.newOffset;

    const walletAddress = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
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
      agentId: agentId.value,
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

function recordToAgentCard(record: ParsedAgentRecord): AgentCard | null {
  try {
    const capabilities = JSON.parse(record.capabilitiesJson);
    return {
      did: record.did,
      name: record.name,
      version: record.version,
      endpoint: record.endpoint,
      type: (AGENT_TYPE_REVERSE[record.agentType] ?? "Task") as AgentCard["type"],
      capabilities,
      walletAddress: record.walletAddress,
    };
  } catch {
    return null;
  }
}

/** Fetch all on-chain agent records */
export async function fetchAllOnChainAgents(): Promise<(AgentCard & { onChain: boolean; agentId: string; owner: string; registeredAt?: number })[]> {
  const connection = getConnection();
  const accounts = await connection.getProgramAccounts(REGISTRY_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: AGENT_RECORD_DISCRIMINATOR.toString("base64"), encoding: "base64" } },
    ],
  });

  const cards: (AgentCard & { onChain: boolean; agentId: string; owner: string; registeredAt?: number })[] = [];
  for (const { account } of accounts) {
    const record = parseAgentRecord(Buffer.from(account.data));
    if (!record) continue;
    // Skip old-format records (pre agent_id migration)
    if (!record.did.startsWith("did:aip:")) continue;
    const card = recordToAgentCard(record);
    if (card) {
      cards.push({ ...card, onChain: true, agentId: record.agentId, owner: record.owner, registeredAt: record.registeredAt });
    }
  }
  return cards;
}

/** Fetch agents owned by a specific wallet, including PDA addresses */
export async function fetchAgentsByOwner(ownerPubkey: string): Promise<(ParsedAgentRecord & { pda: string })[]> {
  const connection = getConnection();
  const ownerBytes = new PublicKey(ownerPubkey).toBuffer();

  // memcmp offset 0: 8-byte account discriminator (Anchor adds this automatically)
  // memcmp offset 8: 32-byte owner pubkey (first field in AgentRecord after discriminator)
  const accounts = await connection.getProgramAccounts(REGISTRY_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: AGENT_RECORD_DISCRIMINATOR.toString("base64"), encoding: "base64" } },
      { memcmp: { offset: 8, bytes: ownerBytes.toString("base64"), encoding: "base64" } },
    ],
  });

  const records: (ParsedAgentRecord & { pda: string })[] = [];
  for (const { pubkey, account } of accounts) {
    const record = parseAgentRecord(Buffer.from(account.data));
    if (record && record.did.startsWith("did:aip:")) {
      records.push({ ...record, pda: pubkey.toBase58() });
    }
  }
  return records;
}

/** Check if a specific agent exists on-chain */
export async function isAgentOnChain(ownerPubkey: string, agentId: string): Promise<boolean> {
  const connection = getConnection();
  const [pda] = deriveAgentRecordPDA(new PublicKey(ownerPubkey), agentId);
  const account = await connection.getAccountInfo(pda);
  return account !== null;
}

// Legacy compat — check by DID (scans all accounts)
export async function isAgentOnChainByDid(did: string): Promise<boolean> {
  const all = await fetchAllOnChainAgents();
  return all.some((a) => a.did === did);
}

/* ------------------------------------------------------------------ */
/*  Server-side register                                               */
/* ------------------------------------------------------------------ */

export async function registerAgentOnChain(
  ownerKeypair: Keypair,
  agentId: string,
  card: AgentCard
): Promise<string> {
  const connection = getConnection();
  const capabilitiesJson = JSON.stringify(card.capabilities);
  const agentType = AGENT_TYPE_MAP[card.type] ?? 1;
  const did = generateDid(ownerKeypair.publicKey.toBase58(), agentId);

  const ix = buildRegisterAgentIx({
    owner: ownerKeypair.publicKey,
    agentId,
    did,
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
