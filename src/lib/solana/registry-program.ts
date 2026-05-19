/**
 * AIP Agent Registry Program — TypeScript client.
 * One wallet can register multiple agents, each with a unique agent_id.
 * PDA seeds: ["agent", owner_pubkey, agent_id_bytes]
 *
 * Schema MUST stay in sync with:
 *   - programs/aip-escrow/programs/aip-registry/src/lib.rs (Rust source of truth)
 *   - packages/did-resolver/src/borsh.ts (read-side reference implementation)
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
import type { AgentCard, Capability as AgentCardCapability } from "@/types/aip";

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

import { canonicalAgentDid } from "@/lib/identity/canonical-did";

export function generateDid(ownerPubkey: string, agentId: string): string {
  return canonicalAgentDid(ownerPubkey, agentId);
}

/** Derive PDA: ["agent", owner, agent_id] */
export function deriveAgentRecordPDA(owner: PublicKey, agentId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer(), Buffer.from(agentId)],
    REGISTRY_PROGRAM_ID
  );
}

/* ------------------------------------------------------------------ */
/*  Program-side Capability (matches Rust struct)                     */
/*  Note: AgentCard.capabilities (web type) has {id, description,     */
/*  pricing}. On-chain stores only {name, description} per the Rust   */
/*  struct — pricing lives off-chain in the Agent Card.               */
/* ------------------------------------------------------------------ */

export interface OnChainCapability {
  name: string;        // ≤ 32 chars
  description: string; // ≤ 64 chars
}

function toOnChainCapabilities(caps: AgentCardCapability[]): OnChainCapability[] {
  return caps.slice(0, 8).map((c) => ({
    name: c.id.slice(0, 32),
    description: c.description.slice(0, 64),
  }));
}

/**
 * Derive a single base price (in USDC micro-units) for the on-chain
 * `price_per_task` field. The marketplace keeps per-capability pricing
 * off-chain in the Agent Card — this is a single representative figure
 * used by the registry account. We take the minimum across capabilities
 * (cheapest entry point) and convert "USDC" string → u64 micro-USDC.
 */
function derivePricePerTask(caps: AgentCardCapability[]): bigint {
  if (caps.length === 0) return BigInt(0);
  let min: number | null = null;
  for (const cap of caps) {
    const n = Number(cap.pricing?.amount ?? 0);
    if (Number.isFinite(n) && (min === null || n < min)) min = n;
  }
  if (min === null || min <= 0) return BigInt(0);
  return BigInt(Math.round(min * 1_000_000));
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

function borshU64(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n, 0);
  return b;
}

function borshPubkey(pk: PublicKey): Buffer {
  return pk.toBuffer();
}

function borshCapabilities(caps: OnChainCapability[]): Buffer {
  const count = Buffer.alloc(4);
  count.writeUInt32LE(caps.length, 0);
  const parts: Buffer[] = [count];
  for (const cap of caps) {
    parts.push(borshString(cap.name));
    parts.push(borshString(cap.description));
  }
  return Buffer.concat(parts);
}

/* ------------------------------------------------------------------ */
/*  Instruction Builders                                                */
/*  Argument order MUST match programs/aip-escrow/.../lib.rs           */
/* ------------------------------------------------------------------ */

export function buildRegisterAgentIx(params: {
  owner: PublicKey;
  agentId: string;
  did: string;
  name: string;
  endpoint: string;
  walletAddress: PublicKey;
  agentType: number;
  capabilities: OnChainCapability[];
  pricePerTask: bigint;
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
    borshCapabilities(params.capabilities),
    borshU64(params.pricePerTask),
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
  capabilities: OnChainCapability[];
  pricePerTask: bigint;
  version: string;
}): TransactionInstruction {
  const [agentRecord] = deriveAgentRecordPDA(params.owner, params.agentId);

  const data = Buffer.concat([
    DISCRIMINATORS.update_agent,
    borshString(params.name),
    borshString(params.endpoint),
    borshPubkey(params.walletAddress),
    borshU8(params.agentType),
    borshCapabilities(params.capabilities),
    borshU64(params.pricePerTask),
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
/*  On-chain Decoder                                                   */
/*  Mirror of packages/did-resolver/src/borsh.ts — keep in sync.       */
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
  capabilities: OnChainCapability[];
  pricePerTask: bigint;
  version: string;
  registeredAt: number;
  updatedAt: number;
  bump: number;
}

function parseAgentRecord(data: Buffer): ParsedAgentRecord | null {
  try {
    // Verify Anchor account discriminator
    for (let i = 0; i < 8; i++) {
      if (data[i] !== AGENT_RECORD_DISCRIMINATOR[i]) return null;
    }
    let offset = 8;

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

    const capCount = data.readUInt32LE(offset);
    offset += 4;
    const capabilities: OnChainCapability[] = [];
    for (let i = 0; i < capCount; i++) {
      const n = readBorshString(data, offset); offset = n.newOffset;
      const d = readBorshString(data, offset); offset = d.newOffset;
      capabilities.push({ name: n.value, description: d.value });
    }

    const pricePerTask = data.readBigUInt64LE(offset);
    offset += 8;

    const version = readBorshString(data, offset);
    offset = version.newOffset;

    const registeredAt = Number(data.readBigInt64LE(offset));
    offset += 8;
    const updatedAt = Number(data.readBigInt64LE(offset));
    offset += 8;

    const bump = data[offset];

    return {
      owner,
      agentId: agentId.value,
      did: did.value,
      name: name.value,
      endpoint: endpoint.value,
      walletAddress,
      agentType,
      capabilities,
      pricePerTask,
      version: version.value,
      registeredAt,
      updatedAt,
      bump,
    };
  } catch {
    return null;
  }
}

/**
 * Hosted demo agents store a sentinel pricing entry off-chain (per
 * capability). On-chain we only retain one base price; when converting
 * back to a UI Agent Card we surface this as a single representative
 * capability pricing line. Real per-capability pricing must be fetched
 * from the agent's own /.well-known/agent.json.
 */
function recordToAgentCard(record: ParsedAgentRecord): AgentCard | null {
  try {
    const usdc = (Number(record.pricePerTask) / 1_000_000).toFixed(2);
    const capabilities: AgentCardCapability[] = record.capabilities.map((c) => ({
      id: c.name,
      description: c.description,
      pricing: { amount: usdc, token: "USDC" as const, network: "solana" as const },
    }));
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
    capabilities: toOnChainCapabilities(card.capabilities),
    pricePerTask: derivePricePerTask(card.capabilities),
    version: card.version,
  });

  const tx = new Transaction().add(ix);
  return sendAndConfirmTransaction(connection, tx, [ownerKeypair]);
}

/** Helpers exposed for callers building tx client-side (CLI/UI). */
export { toOnChainCapabilities, derivePricePerTask };
