import { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";
import { getConnection } from "@/lib/solana/connection";
import { buildUsdcTransferInstruction, getUsdcMint } from "./usdc";

/* ------------------------------------------------------------------ */
/*  Escrow Wallet                                                      */
/* ------------------------------------------------------------------ */

let _escrowKeypair: Keypair | null = null;

/**
 * Escrow wallet keypair'ini env'den yukler.
 * ESCROW_PRIVATE_KEY base58 formatinda olmali.
 */
function getEscrowKeypair(): Keypair {
  if (_escrowKeypair) return _escrowKeypair;

  const key = process.env.ESCROW_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      "ESCROW_PRIVATE_KEY environment variable is not set. " +
        "Generate one with: node -e \"const k=require('@solana/web3.js').Keypair.generate(); console.log(require('bs58').default.encode(k.secretKey)); console.log(k.publicKey.toBase58())\""
    );
  }

  _escrowKeypair = Keypair.fromSecretKey(bs58.decode(key));
  return _escrowKeypair;
}

export function getEscrowAddress(): string {
  return getEscrowKeypair().publicKey.toBase58();
}

/* ------------------------------------------------------------------ */
/*  Escrow Record Store (in-memory)                                    */
/* ------------------------------------------------------------------ */

export type EscrowStatus = "LOCKED" | "RELEASED" | "REFUNDED";

export interface EscrowRecord {
  taskId: string;
  amount: string;
  from: string;        // Agent A wallet address
  to: string;          // Agent B wallet address
  escrowTxHash: string; // Lock transaction hash
  settlementTxHash?: string;
  status: EscrowStatus;
  createdAt: string;
  updatedAt: string;
}

const escrows = new Map<string, EscrowRecord>();

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
/*  Escrow Operations (server-side Solana transactions)                */
/* ------------------------------------------------------------------ */

/**
 * ATA'nin var olup olmadigini kontrol eder.
 * Yoksa olusturma talimati dondurur.
 */
async function ensureAtaInstruction(
  wallet: PublicKey
): Promise<Transaction | null> {
  const connection = getConnection();
  const mint = getUsdcMint();
  const ata = await getAssociatedTokenAddress(mint, wallet);

  try {
    await getAccount(connection, ata);
    return null; // ATA zaten var
  } catch {
    // ATA yok, olustur
    const escrowKp = getEscrowKeypair();
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        escrowKp.publicKey, // payer (fee)
        ata,
        wallet,
        mint
      )
    );
    return tx;
  }
}

/**
 * Escrow'dan hedefe USDC transfer eder (release veya refund).
 * Escrow wallet server tarafinda imzalar.
 */
async function transferFromEscrow(
  toAddress: string,
  amountUsdc: string
): Promise<string> {
  const connection = getConnection();
  const escrowKp = getEscrowKeypair();
  const toWallet = new PublicKey(toAddress);

  // Hedef ATA yoksa olustur
  const ataTx = await ensureAtaInstruction(toWallet);

  const { instruction } = await buildUsdcTransferInstruction(
    escrowKp.publicKey,
    toWallet,
    amountUsdc
  );

  const tx = new Transaction();
  if (ataTx) {
    tx.add(...ataTx.instructions);
  }
  tx.add(instruction);

  const signature = await sendAndConfirmTransaction(connection, tx, [escrowKp]);
  return signature;
}

/**
 * Escrow'u serbest birakir — USDC'yi Agent B'ye gonderir.
 */
export async function releaseEscrow(taskId: string): Promise<{
  txHash: string;
  record: EscrowRecord;
}> {
  const record = escrows.get(taskId);
  if (!record) throw new Error(`Escrow not found: ${taskId}`);
  if (record.status !== "LOCKED") throw new Error(`Escrow not locked: ${record.status}`);

  const txHash = await transferFromEscrow(record.to, record.amount);

  record.status = "RELEASED";
  record.settlementTxHash = txHash;
  record.updatedAt = new Date().toISOString();

  return { txHash, record };
}

/**
 * Escrow'u iade eder — USDC'yi Agent A'ya geri gonderir.
 */
export async function refundEscrow(taskId: string): Promise<{
  txHash: string;
  record: EscrowRecord;
}> {
  const record = escrows.get(taskId);
  if (!record) throw new Error(`Escrow not found: ${taskId}`);
  if (record.status !== "LOCKED") throw new Error(`Escrow not locked: ${record.status}`);

  const txHash = await transferFromEscrow(record.from, record.amount);

  record.status = "REFUNDED";
  record.settlementTxHash = txHash;
  record.updatedAt = new Date().toISOString();

  return { txHash, record };
}
