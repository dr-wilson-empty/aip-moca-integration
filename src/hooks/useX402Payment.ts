"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const USDC_DECIMALS = 6;

// Escrow program constants (must match on-chain program)
const ESCROW_PROGRAM_ID = new PublicKey(
  "59kc3swV6j6NqvhJoKKXAw1uWqGisY2txtf3LLM9Myhz"
);

// initialize_escrow discriminator: sha256("global:initialize_escrow")[0..8]
const INIT_ESCROW_DISCRIMINATOR = Buffer.from([243, 160, 77, 153, 11, 92, 48, 209]);

interface X402Requirements {
  x402Version: number;
  accepts: Array<{
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    maxTimeoutSeconds: number;
    programId: string;
    authority: string;
    taskId: string;
    payee: string;
  }>;
}

interface X402TaskResult {
  taskId: string;
  escrowTxHash: string;
}

/* ------------------------------------------------------------------ */
/*  Borsh helpers                                                      */
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
/*  PDA derivation                                                     */
/* ------------------------------------------------------------------ */

function deriveEscrowStatePDA(taskId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(taskId)],
    ESCROW_PROGRAM_ID
  );
  return pda;
}

function deriveEscrowVaultPDA(taskId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(taskId)],
    ESCROW_PROGRAM_ID
  );
  return pda;
}

/**
 * x402 Payment hook — Phase 2 (PDA Escrow).
 *
 * Flow:
 * 1. POST /api/task/quote → payment requirements + taskId + program info
 * 2. Build initialize_escrow instruction (USDC transfer to PDA vault)
 * 3. Sign in Phantom
 * 4. Send to server for verification + settlement
 */
export function useX402Payment() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitTaskWithPayment = useCallback(
    async (taskBody: Record<string, string>): Promise<X402TaskResult | null> => {
      if (!publicKey || !signTransaction || !connection) {
        setError("Wallet not connected or does not support signing");
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        // ----------------------------------------------------------
        // STEP 1: Payment requirements al (/api/task/quote)
        // ----------------------------------------------------------
        const quoteRes = await fetch("/api/task/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentEndpoint: taskBody.agentEndpoint,
            capability: taskBody.capability,
            amount: taskBody.amount,
          }),
        });

        if (!quoteRes.ok) {
          const data = await quoteRes.json();
          throw new Error(data.error || `Quote failed: HTTP ${quoteRes.status}`);
        }

        const quoteData = await quoteRes.json();
        const requirements: X402Requirements = quoteData.requirements;
        const accepted = requirements.accepts[0];
        if (!accepted) {
          throw new Error("No payment requirements returned");
        }

        const taskId = quoteData.taskId as string;
        const usdcMint = new PublicKey(accepted.asset);
        const authority = new PublicKey(accepted.authority);
        const payee = new PublicKey(accepted.payee);
        const amount = BigInt(accepted.amount);

        // ----------------------------------------------------------
        // STEP 2: Bakiye kontrolu
        // ----------------------------------------------------------
        const fromAta = await getAssociatedTokenAddress(usdcMint, publicKey);

        try {
          const account = await getAccount(connection, fromAta);
          if (account.amount < amount) {
            const have = (Number(account.amount) / 1e6).toFixed(2);
            const need = (Number(amount) / 1e6).toFixed(2);
            throw new Error(`Insufficient USDC balance: have ${have}, need ${need}`);
          }
        } catch (balErr: unknown) {
          if (balErr instanceof Error && balErr.message.includes("Insufficient")) throw balErr;
          throw new Error("No USDC token account found. Fund your wallet with Devnet USDC first.");
        }

        // ----------------------------------------------------------
        // STEP 3: initialize_escrow instruction olustur
        // ----------------------------------------------------------
        const escrowState = deriveEscrowStatePDA(taskId);
        const escrowVault = deriveEscrowVaultPDA(taskId);

        // Deadline: 5 dakika sonra (300 saniye)
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

        // Borsh serialize instruction data
        const instructionData = Buffer.concat([
          INIT_ESCROW_DISCRIMINATOR,
          borshString(taskId),
          borshU64(amount),
          borshI64(deadline),
        ]);

        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");

        const tx = new Transaction({
          feePayer: publicKey,
          blockhash,
          lastValidBlockHeight,
        });

        // initialize_escrow instruction
        tx.add({
          programId: ESCROW_PROGRAM_ID,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },    // payer
            { pubkey: payee, isSigner: false, isWritable: false },       // payee
            { pubkey: authority, isSigner: false, isWritable: false },   // authority
            { pubkey: escrowState, isSigner: false, isWritable: true },  // escrow_state PDA
            { pubkey: escrowVault, isSigner: false, isWritable: true },  // escrow_vault PDA
            { pubkey: fromAta, isSigner: false, isWritable: true },      // payer_token_account
            { pubkey: usdcMint, isSigner: false, isWritable: false },    // mint
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
          ],
          data: instructionData,
        });

        // ----------------------------------------------------------
        // STEP 4: Phantom ile imzala
        // ----------------------------------------------------------
        const signedTx = await signTransaction(tx);
        const serializedTx = signedTx.serialize({
          requireAllSignatures: true,
          verifySignatures: false,
        });

        // ----------------------------------------------------------
        // STEP 5: x402 payment payload olustur
        // ----------------------------------------------------------
        const paymentPayload = {
          x402Version: 2,
          scheme: "exact",
          network: accepted.network,
          payload: {
            serializedTransaction: Buffer.from(serializedTx).toString("base64"),
          },
          accepted: {
            scheme: accepted.scheme,
            network: accepted.network,
            asset: accepted.asset,
            amount: accepted.amount,
            programId: accepted.programId,
            taskId,
          },
        };

        const xPaymentHeader = btoa(JSON.stringify(paymentPayload));

        // ----------------------------------------------------------
        // STEP 6: Odemeli istek → server verify + settle + task baslat
        // ----------------------------------------------------------
        const paidRes = await fetch("/api/task", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PAYMENT": xPaymentHeader,
          },
          body: JSON.stringify({ ...taskBody, taskId }),
        });

        const paidData = await paidRes.json();

        if (!paidRes.ok) {
          throw new Error(paidData.error || `Payment failed: HTTP ${paidRes.status}`);
        }

        if (!paidData.taskId) {
          throw new Error("No taskId in response");
        }

        // Settlement tx hash'ini response header'dan al
        const paymentResponseHeader = paidRes.headers.get("x-payment-response");
        let escrowTxHash = "";
        if (paymentResponseHeader) {
          try {
            const paymentResponse = JSON.parse(atob(paymentResponseHeader));
            escrowTxHash = paymentResponse.transaction || "";
          } catch { /* ignore */ }
        }

        setLoading(false);
        return { taskId: paidData.taskId, escrowTxHash };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[x402] Payment flow failed:", message);
        setError(message);
        setLoading(false);
        return null;
      }
    },
    [publicKey, signTransaction, connection]
  );

  return { submitTaskWithPayment, loading, error };
}
