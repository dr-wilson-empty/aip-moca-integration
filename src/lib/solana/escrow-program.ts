/**
 * AIP Escrow Program — Lightweight TypeScript client.
 * Builds Anchor instructions manually (no @coral-xyz/anchor dependency).
 */
import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { getConnection } from "./connection";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const ESCROW_PROGRAM_ID = new PublicKey(
  "59kc3swV6j6NqvhJoKKXAw1uWqGisY2txtf3LLM9Myhz"
);

// Instruction discriminators (sha256("global:<name>")[0..8])
const DISCRIMINATORS = {
  initialize_escrow: Buffer.from([243, 160, 77, 153, 11, 92, 48, 209]),
  release_escrow:    Buffer.from([146, 253, 129, 233, 20, 145, 181, 206]),
  refund_escrow:     Buffer.from([107, 186, 89, 99, 26, 194, 23, 204]),
  cancel_escrow:     Buffer.from([156, 203, 54, 179, 38, 72, 33, 21]),
};

/* ------------------------------------------------------------------ */
/*  PDA Derivation                                                     */
/* ------------------------------------------------------------------ */

export function deriveEscrowStatePDA(taskId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(taskId)],
    ESCROW_PROGRAM_ID
  );
}

export function deriveEscrowVaultPDA(taskId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(taskId)],
    ESCROW_PROGRAM_ID
  );
}

/* ------------------------------------------------------------------ */
/*  Borsh Serialization Helpers                                        */
/* ------------------------------------------------------------------ */

function borshString(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}

function borshU64(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n, 0);
  return buf;
}

function borshI64(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(n, 0);
  return buf;
}

/* ------------------------------------------------------------------ */
/*  Instruction Builders                                                */
/* ------------------------------------------------------------------ */

/**
 * Build `initialize_escrow` instruction.
 * Accounts order (from IDL):
 *   0. payer (signer, writable)
 *   1. payee
 *   2. authority
 *   3. escrow_state (PDA, writable)
 *   4. escrow_vault (PDA, writable)
 *   5. payer_token_account (writable)
 *   6. mint
 *   7. system_program
 *   8. token_program
 *   9. rent
 */
export function buildInitializeEscrowIx(params: {
  payer: PublicKey;
  payee: PublicKey;
  authority: PublicKey;
  payerTokenAccount: PublicKey;
  mint: PublicKey;
  taskId: string;
  amount: bigint;
  deadline: bigint;
}): TransactionInstruction {
  const [escrowState] = deriveEscrowStatePDA(params.taskId);
  const [escrowVault] = deriveEscrowVaultPDA(params.taskId);

  const data = Buffer.concat([
    DISCRIMINATORS.initialize_escrow,
    borshString(params.taskId),
    borshU64(params.amount),
    borshI64(params.deadline),
  ]);

  return new TransactionInstruction({
    programId: ESCROW_PROGRAM_ID,
    keys: [
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: params.payee, isSigner: false, isWritable: false },
      { pubkey: params.authority, isSigner: false, isWritable: false },
      { pubkey: escrowState, isSigner: false, isWritable: true },
      { pubkey: escrowVault, isSigner: false, isWritable: true },
      { pubkey: params.payerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build `release_escrow` instruction.
 * Accounts:
 *   0. authority (signer, writable)
 *   1. escrow_state (PDA, writable)
 *   2. escrow_vault (PDA, writable)
 *   3. payee_token_account (writable)
 *   4. token_program
 */
export function buildReleaseEscrowIx(params: {
  authority: PublicKey;
  taskId: string;
  payeeTokenAccount: PublicKey;
}): TransactionInstruction {
  const [escrowState] = deriveEscrowStatePDA(params.taskId);
  const [escrowVault] = deriveEscrowVaultPDA(params.taskId);

  return new TransactionInstruction({
    programId: ESCROW_PROGRAM_ID,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: escrowState, isSigner: false, isWritable: true },
      { pubkey: escrowVault, isSigner: false, isWritable: true },
      { pubkey: params.payeeTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: DISCRIMINATORS.release_escrow,
  });
}

/**
 * Build `refund_escrow` instruction.
 * Accounts:
 *   0. authority (signer, writable)
 *   1. escrow_state (PDA, writable)
 *   2. escrow_vault (PDA, writable)
 *   3. payer_token_account (writable)
 *   4. token_program
 */
export function buildRefundEscrowIx(params: {
  authority: PublicKey;
  taskId: string;
  payerTokenAccount: PublicKey;
}): TransactionInstruction {
  const [escrowState] = deriveEscrowStatePDA(params.taskId);
  const [escrowVault] = deriveEscrowVaultPDA(params.taskId);

  return new TransactionInstruction({
    programId: ESCROW_PROGRAM_ID,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: escrowState, isSigner: false, isWritable: true },
      { pubkey: escrowVault, isSigner: false, isWritable: true },
      { pubkey: params.payerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: DISCRIMINATORS.refund_escrow,
  });
}

/* ------------------------------------------------------------------ */
/*  Server-side helpers (sign & send with authority keypair)            */
/* ------------------------------------------------------------------ */

/**
 * Ensure ATA exists; if not, return a create instruction.
 * Authority keypair pays for ATA creation.
 */
async function ensureAta(
  wallet: PublicKey,
  mint: PublicKey,
  payer: PublicKey
): Promise<{ ata: PublicKey; createIx?: TransactionInstruction }> {
  const connection = getConnection();
  const ata = await getAssociatedTokenAddress(mint, wallet);
  try {
    await getAccount(connection, ata);
    return { ata };
  } catch {
    const createIx = createAssociatedTokenAccountInstruction(payer, ata, wallet, mint);
    return { ata, createIx };
  }
}

/**
 * Release escrow via on-chain program instruction.
 * Server signs with authority keypair.
 * Creates payee ATA if it doesn't exist.
 */
export async function programReleaseEscrow(
  authorityKeypair: Keypair,
  taskId: string,
  payeeWallet: PublicKey,
  mint: PublicKey
): Promise<string> {
  const connection = getConnection();
  const { ata: payeeAta, createIx } = await ensureAta(
    payeeWallet, mint, authorityKeypair.publicKey
  );

  const tx = new Transaction();
  if (createIx) tx.add(createIx);

  tx.add(buildReleaseEscrowIx({
    authority: authorityKeypair.publicKey,
    taskId,
    payeeTokenAccount: payeeAta,
  }));

  return sendAndConfirmTransaction(connection, tx, [authorityKeypair]);
}

/**
 * Refund escrow via on-chain program instruction.
 * Server signs with authority keypair.
 * Creates payer ATA if it doesn't exist (unlikely but safe).
 */
export async function programRefundEscrow(
  authorityKeypair: Keypair,
  taskId: string,
  payerWallet: PublicKey,
  mint: PublicKey
): Promise<string> {
  const connection = getConnection();
  const { ata: payerAta, createIx } = await ensureAta(
    payerWallet, mint, authorityKeypair.publicKey
  );

  const tx = new Transaction();
  if (createIx) tx.add(createIx);

  tx.add(buildRefundEscrowIx({
    authority: authorityKeypair.publicKey,
    taskId,
    payerTokenAccount: payerAta,
  }));

  return sendAndConfirmTransaction(connection, tx, [authorityKeypair]);
}
