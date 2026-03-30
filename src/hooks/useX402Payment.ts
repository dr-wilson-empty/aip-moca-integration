"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const USDC_DECIMALS = 6;

interface X402Requirements {
  x402Version: number;
  accepts: Array<{
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    maxTimeoutSeconds: number;
  }>;
}

interface X402TaskResult {
  taskId: string;
  escrowTxHash: string;
}

/**
 * x402 Payment hook.
 *
 * Akis:
 * 1. POST /api/task (odemesiz) → 402 + payment requirements alir
 * 2. Requirements'tan USDC transfer tx olusturur
 * 3. Phantom ile imzalatir (sendTransaction degil, signTransaction — tx'i biz gondermiyoruz)
 * 4. Imzali tx'i base64 olarak X-PAYMENT header'ina koyar
 * 5. POST /api/task (odemeli) → server verify + settle + task baslat
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
        // STEP 1: Odemesiz istek → 402 Payment Required
        // ----------------------------------------------------------
        const initialRes = await fetch("/api/task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(taskBody),
        });

        if (initialRes.status !== 402) {
          // 402 degil — beklenmeyen durum
          const data = await initialRes.json();
          if (data.taskId) {
            // Belki odeme gerekmedi (teorik)
            return { taskId: data.taskId, escrowTxHash: "" };
          }
          throw new Error(data.error || `Unexpected status: ${initialRes.status}`);
        }

        // 402 header'indan requirements'i al
        const requirementsHeader = initialRes.headers.get("x-payment-required");
        if (!requirementsHeader) {
          throw new Error("402 response missing X-PAYMENT-REQUIRED header");
        }

        const requirements: X402Requirements = JSON.parse(
          atob(requirementsHeader)
        );

        const accepted = requirements.accepts[0];
        if (!accepted) {
          throw new Error("No payment requirements in 402 response");
        }

        // ----------------------------------------------------------
        // STEP 2: USDC transfer transaction olustur
        // ----------------------------------------------------------
        const usdcMint = new PublicKey(accepted.asset);
        const escrowWallet = new PublicKey(accepted.payTo);
        const amount = BigInt(accepted.amount);

        const fromAta = await getAssociatedTokenAddress(usdcMint, publicKey);
        const toAta = await getAssociatedTokenAddress(usdcMint, escrowWallet);

        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");

        const tx = new Transaction({
          feePayer: publicKey,
          blockhash,
          lastValidBlockHeight,
        });

        // Escrow wallet ATA yoksa olustur
        try {
          await getAccount(connection, toAta);
        } catch {
          tx.add(
            createAssociatedTokenAccountInstruction(
              publicKey,  // payer
              toAta,
              escrowWallet,
              usdcMint
            )
          );
        }

        // USDC TransferChecked instruction (x402 exact scheme)
        tx.add(
          createTransferCheckedInstruction(
            fromAta,      // source ATA
            usdcMint,     // mint
            toAta,        // destination ATA
            publicKey,    // authority (signer)
            amount,       // amount in atomic units
            USDC_DECIMALS // decimals
          )
        );

        // ----------------------------------------------------------
        // STEP 3: Phantom ile imzala (gonderme — server gonderecek)
        // ----------------------------------------------------------
        const signedTx = await signTransaction(tx);
        const serializedTx = signedTx.serialize({
          requireAllSignatures: true,
          verifySignatures: false,
        });

        // ----------------------------------------------------------
        // STEP 4: x402 payment payload olustur
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
            payTo: accepted.payTo,
          },
        };

        const xPaymentHeader = btoa(JSON.stringify(paymentPayload));

        // ----------------------------------------------------------
        // STEP 5: Odemeli istek → server verify + settle + task baslat
        // ----------------------------------------------------------
        const paidRes = await fetch("/api/task", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PAYMENT": xPaymentHeader,
          },
          body: JSON.stringify(taskBody),
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
