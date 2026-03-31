import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  programReleaseEscrow,
  programRefundEscrow,
} from "@/lib/solana/escrow-program";

/* ------------------------------------------------------------------ */
/*  Authority Keypair (server wallet — can release/refund escrows)      */
/* ------------------------------------------------------------------ */

let _authorityKeypair: Keypair | null = null;

/**
 * Authority keypair'ini env'den yukler.
 * ESCROW_PRIVATE_KEY: base58 encoded — Phase 1'deki escrow wallet,
 * simdi PDA escrow'lar icin "authority" rolunde.
 */
function getAuthorityKeypair(): Keypair {
  if (_authorityKeypair) return _authorityKeypair;

  const key = process.env.ESCROW_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      "ESCROW_PRIVATE_KEY environment variable is not set. " +
        "This key is used as the escrow authority (release/refund signer)."
    );
  }

  _authorityKeypair = Keypair.fromSecretKey(bs58.decode(key));
  return _authorityKeypair;
}

export function getAuthorityAddress(): string {
  return getAuthorityKeypair().publicKey.toBase58();
}

/* ------------------------------------------------------------------ */
/*  Escrow Record Store (in-memory)                                    */
/* ------------------------------------------------------------------ */

export type EscrowStatus = "LOCKED" | "RELEASED" | "REFUNDED" | "CANCELLED";

export interface EscrowRecord {
  taskId: string;
  amount: string;
  from: string;        // Payer wallet address
  to: string;          // Payee (agent) wallet address
  escrowTxHash: string; // initialize_escrow transaction hash
  settlementTxHash?: string;
  status: EscrowStatus;
  createdAt: string;
  updatedAt: string;
}

const ge = globalThis as typeof globalThis & {
  __aip_escrows?: Map<string, EscrowRecord>;
};
if (!ge.__aip_escrows) ge.__aip_escrows = new Map();
const escrows = ge.__aip_escrows;

export function createEscrowRecord(params: {
  taskId: string;
  amount: string;
  from: string;
  to: string;
  escrowTxHash: string;
}): EscrowRecord {
  const now = new Date().toISOString();
  const record: EscrowRecord = {
    ...params,
    status: "LOCKED",
    createdAt: now,
    updatedAt: now,
  };
  escrows.set(params.taskId, record);
  return record;
}

export function getEscrowRecord(taskId: string): EscrowRecord | null {
  return escrows.get(taskId) ?? null;
}

/* ------------------------------------------------------------------ */
/*  Escrow Operations (on-chain program instructions)                   */
/* ------------------------------------------------------------------ */

function getUsdcMint(): PublicKey {
  const mint = process.env.USDC_MINT_DEVNET;
  if (!mint) throw new Error("USDC_MINT_DEVNET not set");
  return new PublicKey(mint);
}

/**
 * Release escrow — transfer USDC from PDA vault to payee (agent).
 * Server signs as authority via program instruction.
 */
export async function releaseEscrow(taskId: string): Promise<{
  txHash: string;
  record: EscrowRecord;
}> {
  const record = escrows.get(taskId);
  if (!record) throw new Error(`Escrow not found: ${taskId}`);
  if (record.status !== "LOCKED") throw new Error(`Escrow not locked: ${record.status}`);

  const authorityKp = getAuthorityKeypair();
  const payeeWallet = new PublicKey(record.to);
  const mint = getUsdcMint();

  const txHash = await programReleaseEscrow(authorityKp, taskId, payeeWallet, mint);

  record.status = "RELEASED";
  record.settlementTxHash = txHash;
  record.updatedAt = new Date().toISOString();

  return { txHash, record };
}

/**
 * Refund escrow — transfer USDC from PDA vault back to payer.
 * Server signs as authority via program instruction.
 */
export async function refundEscrow(taskId: string): Promise<{
  txHash: string;
  record: EscrowRecord;
}> {
  const record = escrows.get(taskId);
  if (!record) throw new Error(`Escrow not found: ${taskId}`);
  if (record.status !== "LOCKED") throw new Error(`Escrow not locked: ${record.status}`);

  const authorityKp = getAuthorityKeypair();
  const payerWallet = new PublicKey(record.from);
  const mint = getUsdcMint();

  const txHash = await programRefundEscrow(authorityKp, taskId, payerWallet, mint);

  record.status = "REFUNDED";
  record.settlementTxHash = txHash;
  record.updatedAt = new Date().toISOString();

  return { txHash, record };
}
