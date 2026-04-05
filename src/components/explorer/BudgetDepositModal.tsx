"use client";

import { useState, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import BtnPrimary from "@/components/ui/BtnPrimary";

interface Props {
  agentDid: string;
  onClose: () => void;
  onDeposited: () => void;
}

export default function BudgetDepositModal({ agentDid, onClose, onDeposited }: Props) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [amount, setAmount] = useState("");
  const [authorityAddress, setAuthorityAddress] = useState("");
  const [usdcMint, setUsdcMint] = useState("");
  const [step, setStep] = useState<"input" | "signing" | "confirming" | "crediting" | "done" | "error">("input");
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState("");

  // Fetch platform authority info
  useEffect(() => {
    fetch("/api/budget/info")
      .then((r) => r.json())
      .then((data) => {
        if (data.authorityAddress) setAuthorityAddress(data.authorityAddress);
        if (data.usdcMint) setUsdcMint(data.usdcMint);
      })
      .catch(() => setErrorMsg("Failed to load platform info"));
  }, []);

  const parsedAmount = parseFloat(amount);
  const isValid = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= 1000;

  const handleDeposit = async () => {
    if (!publicKey || !isValid || !authorityAddress || !usdcMint) return;

    try {
      setStep("signing");
      setErrorMsg("");

      const mint = new PublicKey(usdcMint);
      const authority = new PublicKey(authorityAddress);

      const fromAta = await getAssociatedTokenAddress(mint, publicKey);
      const toAta = await getAssociatedTokenAddress(mint, authority);

      const tx = new Transaction();

      // Ensure authority ATA exists
      try {
        await getAccount(connection, toAta);
      } catch {
        tx.add(createAssociatedTokenAccountInstruction(publicKey, toAta, authority, mint));
      }

      const lamports = BigInt(Math.round(parsedAmount * 1e6));
      tx.add(createTransferInstruction(fromAta, toAta, publicKey, lamports));

      const sig = await sendTransaction(tx, connection);
      setTxHash(sig);
      setStep("confirming");

      await connection.confirmTransaction(sig, "confirmed");
      setStep("crediting");

      // Credit the budget via API
      const res = await fetch("/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentDid,
          ownerWallet: publicKey.toBase58(),
          amount: parsedAmount,
          txHash: sig,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to credit budget");
      }

      setStep("done");
      onDeposited();
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Deposit failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/80 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="w-full max-w-md border border-forest-mid bg-bg-base p-6 rounded-2xl flex flex-col gap-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-mint uppercase">Deposit USDC</h3>
          <button onClick={onClose} className="font-mono text-xs text-muted hover:text-off-white">✕</button>
        </div>

        {step === "input" && (
          <>
            <div>
              <label className="font-mono text-[10px] text-muted uppercase block mb-1">Amount (USDC)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="1000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1.00"
                className="w-full bg-bg-base border border-mint/20 rounded px-3 py-2 font-mono text-sm text-accent focus:border-mint/40 focus:outline-none"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                {[0.5, 1, 5, 10].map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(v.toString())}
                    className="font-mono text-[10px] text-muted border border-forest-deep/40 px-2 py-1 rounded hover:border-mint/20 hover:text-mint transition-all"
                  >
                    {v} USDC
                  </button>
                ))}
              </div>
            </div>

            <div className="font-mono text-[10px] text-muted/60">
              <p>Transfers USDC from your wallet to platform authority.</p>
              <p>Authority: {authorityAddress ? `${authorityAddress.slice(0, 8)}...${authorityAddress.slice(-6)}` : "Loading..."}</p>
            </div>

            <BtnPrimary onClick={handleDeposit} disabled={!isValid || !authorityAddress}>
              Deposit {isValid ? `${parsedAmount.toFixed(2)} USDC` : ""}
            </BtnPrimary>
          </>
        )}

        {step === "signing" && (
          <div className="py-6 text-center">
            <div className="w-8 h-8 mx-auto border-2 border-mint border-t-transparent rounded-full animate-spin mb-3" />
            <p className="font-mono text-sm text-mint">Waiting for wallet signature...</p>
          </div>
        )}

        {step === "confirming" && (
          <div className="py-6 text-center">
            <div className="w-8 h-8 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
            <p className="font-mono text-sm text-accent">Confirming on-chain...</p>
            <p className="font-mono text-[10px] text-muted mt-1">{txHash.slice(0, 20)}...</p>
          </div>
        )}

        {step === "crediting" && (
          <div className="py-6 text-center">
            <div className="w-8 h-8 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
            <p className="font-mono text-sm text-accent">Crediting budget...</p>
          </div>
        )}

        {step === "done" && (
          <div className="py-6 text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-accent/20 flex items-center justify-center mb-3">
              <span className="text-accent text-lg">✓</span>
            </div>
            <p className="font-mono text-sm text-accent mb-1">Deposit successful!</p>
            <p className="font-mono text-sm text-off-white">{parsedAmount.toFixed(2)} USDC credited</p>
            <a
              href={`https://explorer.solana.com/tx/${txHash}?cluster=devnet`}
              target="_blank" rel="noopener noreferrer"
              className="font-mono text-[10px] text-muted hover:text-accent block mt-2"
            >
              View on Solana Explorer
            </a>
            <button onClick={onClose} className="font-mono text-xs text-mint mt-4 hover:text-accent">Close</button>
          </div>
        )}

        {step === "error" && (
          <div className="py-4">
            <p className="font-mono text-sm text-red-400 mb-2">Deposit failed</p>
            <p className="font-mono text-[10px] text-muted bg-red-900/10 border border-red-800/30 rounded p-2 break-all">{errorMsg}</p>
            <button onClick={() => setStep("input")} className="font-mono text-xs text-mint mt-3 hover:text-accent">Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}
