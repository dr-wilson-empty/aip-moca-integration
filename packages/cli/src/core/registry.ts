/**
 * CLI-side registry program client.
 *
 * Mirrors src/lib/solana/registry-program.ts byte-for-byte so a single
 * source of truth governs the on-chain schema. Keep in sync with:
 *   - programs/aip-escrow/programs/aip-registry/src/lib.rs (Rust)
 *   - src/lib/solana/registry-program.ts (web)
 *   - packages/did-resolver/src/borsh.ts (read-side)
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { AgentCard } from "./agent-card.js";
import { DEFAULT_PROGRAM_ID } from "@aipagents/did-resolver";

export const REGISTRY_PROGRAM_ID = new PublicKey(DEFAULT_PROGRAM_ID);

const DISCRIMINATORS = {
  register_agent:   Buffer.from([135, 157, 66, 195, 2, 113, 175, 30]),
  update_agent:     Buffer.from([85, 2, 178, 9, 119, 139, 102, 164]),
  deregister_agent: Buffer.from([227, 208, 166, 164, 48, 69, 111, 1]),
};

const AGENT_TYPE_MAP: Record<string, number> = { LLM: 0, Task: 1, Execution: 2 };

export interface OnChainCapability {
  name: string;        // ≤ 32 chars
  description: string; // ≤ 64 chars
}

export function deriveAgentRecordPDA(owner: PublicKey, agentId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer(), Buffer.from(agentId)],
    REGISTRY_PROGRAM_ID,
  );
}

/* ---- Borsh helpers ---- */

function borshString(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}

function borshU8(n: number): Buffer { return Buffer.from([n]); }

function borshU64(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n, 0);
  return b;
}

function borshPubkey(pk: PublicKey): Buffer { return pk.toBuffer(); }

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

/* ---- AgentCard → on-chain ---- */

export function toOnChainCapabilities(caps: AgentCard["capabilities"]): OnChainCapability[] {
  return caps.slice(0, 8).map((c) => ({
    name: c.id.slice(0, 32),
    description: c.description.slice(0, 64),
  }));
}

export function derivePricePerTask(caps: AgentCard["capabilities"]): bigint {
  if (caps.length === 0) return 0n;
  let min: number | null = null;
  for (const cap of caps) {
    const n = Number(cap.pricing?.amount ?? 0);
    if (Number.isFinite(n) && (min === null || n < min)) min = n;
  }
  if (min === null || min <= 0) return 0n;
  return BigInt(Math.round(min * 1_000_000));
}

export function extractAgentIdFromDid(did: string): string | null {
  const m = /^did:aip:[1-9A-HJ-NP-Za-km-z]{32,44}:([A-Za-z0-9_-]{1,32})$/.exec(did);
  return m ? m[1]! : null;
}

/* ---- Instruction builders ---- */

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

/* ---- Server-side send ---- */

export async function isAgentOnChain(
  connection: Connection,
  ownerPubkey: PublicKey,
  agentId: string,
): Promise<boolean> {
  const [pda] = deriveAgentRecordPDA(ownerPubkey, agentId);
  const account = await connection.getAccountInfo(pda);
  return account !== null;
}

export async function registerAgentOnChain(
  connection: Connection,
  signer: Keypair,
  agentId: string,
  card: AgentCard,
): Promise<{ signature: string; pda: string; did: string }> {
  const owner = signer.publicKey;
  const did = `did:aip:${owner.toBase58()}:${agentId}`;
  const agentType = AGENT_TYPE_MAP[card.type] ?? 1;

  const ix = buildRegisterAgentIx({
    owner,
    agentId,
    did,
    name: card.name,
    endpoint: card.endpoint,
    walletAddress: card.walletAddress ? new PublicKey(card.walletAddress) : owner,
    agentType,
    capabilities: toOnChainCapabilities(card.capabilities),
    pricePerTask: derivePricePerTask(card.capabilities),
    version: card.version,
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [signer]);
  const [pda] = deriveAgentRecordPDA(owner, agentId);
  return { signature, pda: pda.toBase58(), did };
}

export async function deregisterAgentOnChain(
  connection: Connection,
  signer: Keypair,
  agentId: string,
): Promise<string> {
  const ix = buildDeregisterAgentIx({ owner: signer.publicKey, agentId });
  const tx = new Transaction().add(ix);
  return sendAndConfirmTransaction(connection, tx, [signer]);
}
