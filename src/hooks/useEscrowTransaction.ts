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
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const USDC_DECIMALS = 6;

interface EscrowResult {
  txHash: string;
  escrowAddress: string;
}

/**
 * Gercek Solana USDC escrow transaction hook.
 * Kullanicinin cuzdanindan escrow wallet'a USDC transfer eder.
 */
export function useEscrowTransaction() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockEscrow = useCallback(
    async (amountUsdc: string): Promise<EscrowResult | null> => {
      if (!publicKey || !connection) {
        setError("Wallet not connected");
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        // 1. Escrow wallet adresini API'den al
        const escrowRes = await fetch("/api/payment/escrow");
        const escrowData = await escrowRes.json();
        if (!escrowData.escrowAddress) {
          throw new Error("Could not get escrow address");
        }
        const escrowPubkey = new PublicKey(escrowData.escrowAddress);

        // 2. USDC mint adresini al (env'den)
        const mintRes = await fetch(`/api/wallet/balance?address=${publicKey.toBase58()}`);
        const mintData = await mintRes.json();
        if (!mintData.mint) {
          throw new Error("Could not determine USDC mint");
        }
        const usdcMint = new PublicKey(mintData.mint);

        // 3. ATA adresleri
        const fromAta = await getAssociatedTokenAddress(usdcMint, publicKey);
        const toAta = await getAssociatedTokenAddress(usdcMint, escrowPubkey);

        const lamports = Math.round(parseFloat(amountUsdc) * Math.pow(10, USDC_DECIMALS));
        const tx = new Transaction();

        // 4. Escrow ATA yoksa olustur (payer = user)
        try {
          await getAccount(connection, toAta);
        } catch {
          tx.add(
            createAssociatedTokenAccountInstruction(
              publicKey,
              toAta,
              escrowPubkey,
              usdcMint
            )
          );
        }

        // 5. USDC transfer talimati
        tx.add(
          createTransferInstruction(
            fromAta,
            toAta,
            publicKey,
            lamports,
            [],
            TOKEN_PROGRAM_ID
          )
        );

        // 6. Transaction'i imzala ve gonder
        const txHash = await sendTransaction(tx, connection);

        // 7. Onay bekle
        await connection.confirmTransaction(txHash, "confirmed");

        setLoading(false);
        return { txHash, escrowAddress: escrowData.escrowAddress };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[Escrow] Lock failed:", message);
        setError(message);
        setLoading(false);
        return null;
      }
    },
    [publicKey, connection, sendTransaction]
  );

  return { lockEscrow, loading, error };
}
