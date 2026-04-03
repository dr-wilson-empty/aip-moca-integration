import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { dbUpsertEscrow } from "@/lib/supabase/db";
import {
  programReleaseEscrow,
  programRefundEscrow,
} from "@/lib/solana/escrow-program";
import { sendAgentShare, getCommissionTarget, calculateSplit } from "./commission";
import { logger } from "@/lib/logger";

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
  to: string;          // Payee wallet address (platform for hosted, agent for SDK)
  escrowTxHash: string; // initialize_escrow transaction hash
  settlementTxHash?: string;
  commissionTxHash?: string;   // SPL transfer from platform to agent (if commission)
  commissionRate?: string;     // e.g. "0.20" for 20%
  agentEndpoint?: string;      // agent endpoint for commission check
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
  agentEndpoint?: string;
}): EscrowRecord {
  const now = new Date().toISOString();
  const record: EscrowRecord = {
    ...params,
    status: "LOCKED",
    createdAt: now,
    updatedAt: now,
  };
  escrows.set(params.taskId, record);
  dbUpsertEscrow({
    task_id: params.taskId, amount: params.amount,
    payer: params.from, payee: params.to, status: "LOCKED",
    escrow_tx_hash: params.escrowTxHash,
  }).catch(() => {});
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
 * Release escrow — transfer USDC from PDA vault to payee.
 *
 * For hosted agents (tier=platform):
 *   1. Escrow releases to platform authority wallet (payee = authority)
 *   2. Platform sends 80% to agent owner via SPL transfer
 *   3. Platform keeps 20% as commission
 *
 * For SDK/custom agents:
 *   1. Escrow releases directly to agent wallet (no commission)
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

  // Step 1: Release escrow on-chain (to payee — platform or agent)
  const txHash = await programReleaseEscrow(authorityKp, taskId, payeeWallet, mint);

  record.status = "RELEASED";
  record.settlementTxHash = txHash;
  record.updatedAt = new Date().toISOString();

  // Step 2: If hosted agent with platform AI, split commission
  // The escrow was released to platform wallet — now send agent their 80%
  if (record.agentEndpoint) {
    const agentOwnerAddress = getCommissionTarget(record.agentEndpoint);
    if (agentOwnerAddress) {
      const split = calculateSplit(record.amount);
      logger.info("commission", "splitting", {
        taskId,
        total: record.amount,
        agentShare: split.agentUsdc,
        platformShare: split.platformUsdc,
        agentOwner: agentOwnerAddress,
      });

      const shareTx = await sendAgentShare(
        authorityKp,
        new PublicKey(agentOwnerAddress),
        record.amount,
        mint,
        taskId,
      );

      if (shareTx) {
        record.commissionTxHash = shareTx;
        record.commissionRate = "0.20";
      }
    }
  }

  dbUpsertEscrow({
    task_id: taskId, amount: record.amount, payer: record.from,
    payee: record.to, status: "RELEASED", escrow_tx_hash: record.escrowTxHash,
    settlement_tx_hash: txHash,
  }).catch(() => {});

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
  dbUpsertEscrow({
    task_id: taskId, amount: record.amount, payer: record.from,
    payee: record.to, status: "REFUNDED", escrow_tx_hash: record.escrowTxHash,
    settlement_tx_hash: txHash,
  }).catch(() => {});

  return { txHash, record };
}
