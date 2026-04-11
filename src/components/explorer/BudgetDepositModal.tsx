"use client";

import { useState, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction, createTransferInstruction } from "@solana/spl-token";

const DS = {
  bg: "#e6e5e0",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  dark: "#222222",
  green: "#7cb342",
  error: "#c62828",
  white: "#ffffff",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

interface Props { agentDid: string; onClose: () => void; onDeposited: () => void; }

export default function BudgetDepositModal({ agentDid, onClose, onDeposited }: Props) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [amount, setAmount] = useState("");
  const [authorityAddress, setAuthorityAddress] = useState("");
  const [usdcMint, setUsdcMint] = useState("");
  const [step, setStep] = useState<"input" | "signing" | "confirming" | "crediting" | "done" | "error">("input");
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState("");

  useEffect(() => {
    fetch("/api/budget/info").then((r) => r.json()).then((data) => {
      if (data.authorityAddress) setAuthorityAddress(data.authorityAddress);
      if (data.usdcMint) setUsdcMint(data.usdcMint);
    }).catch(() => setErrorMsg("Failed to load platform info"));
  }, []);

  const parsedAmount = parseFloat(amount);
  const isValid = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= 1000;

  const handleDeposit = async () => {
    if (!publicKey || !isValid || !authorityAddress || !usdcMint) return;
    try {
      setStep("signing"); setErrorMsg("");
      const mint = new PublicKey(usdcMint);
      const authority = new PublicKey(authorityAddress);
      const fromAta = await getAssociatedTokenAddress(mint, publicKey);
      const toAta = await getAssociatedTokenAddress(mint, authority);
      const tx = new Transaction();
      try { await getAccount(connection, toAta); } catch { tx.add(createAssociatedTokenAccountInstruction(publicKey, toAta, authority, mint)); }
      const lamports = BigInt(Math.round(parsedAmount * 1e6));
      tx.add(createTransferInstruction(fromAta, toAta, publicKey, lamports));
      const sig = await sendTransaction(tx, connection);
      setTxHash(sig); setStep("confirming");
      await connection.confirmTransaction(sig, "confirmed");
      setStep("crediting");
      const res = await fetch("/api/budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentDid, ownerWallet: publicKey.toBase58(), amount: parsedAmount, txHash: sig }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to credit budget"); }
      setStep("done"); onDeposited();
    } catch (err) { setStep("error"); setErrorMsg(err instanceof Error ? err.message : "Deposit failed"); }
  };

  const bandLabel: React.CSSProperties = { fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" };
  const inputStyleLocal: React.CSSProperties = { width: "100%", fontFamily: DS.fontMono, fontSize: "1rem", fontWeight: 700, padding: "12px 14px", border: `1px solid ${DS.border}`, backgroundColor: DS.bg, outline: "none", color: DS.text };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)", padding: 16 }} onClick={onClose}>
      <div style={{ width: "100%", maxWidth: 440, border: `1px solid ${DS.border}`, backgroundColor: DS.bg, display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: "16px 24px", borderBottom: `1px solid ${DS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#d5d0c8" }}>
          <span style={bandLabel}>DEPOSIT USDC</span>
          <button onClick={onClose} style={{ ...bandLabel, fontSize: "1rem", background: "none", border: "none", cursor: "pointer" }}>X</button>
        </div>

        <div style={{ padding: "24px" }}>
          {step === "input" && (
            <>
              <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8, fontSize: "0.7rem" }}>AMOUNT (USDC)</span>
              <input type="number" step="0.01" min="0.01" max="1000" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1.00" style={inputStyleLocal} autoFocus />
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                {[0.5, 1, 5, 10].map((v) => (
                  <button key={v} onClick={() => setAmount(v.toString())} style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, padding: "6px 12px", border: `1px solid ${DS.border}`, backgroundColor: "transparent", cursor: "pointer" }}>
                    {v} USDC
                  </button>
                ))}
              </div>
              <p style={{ fontFamily: DS.fontMono, fontSize: "0.7rem", color: DS.textMuted, marginTop: 12 }}>
                Authority: {authorityAddress ? `${authorityAddress.slice(0, 8)}...${authorityAddress.slice(-6)}` : "Loading..."}
              </p>
              <button onClick={handleDeposit} disabled={!isValid || !authorityAddress} className="mp-white-text" style={{ marginTop: 16, padding: "12px 28px", fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", backgroundColor: DS.dark, border: "none", cursor: isValid ? "pointer" : "not-allowed", opacity: isValid ? 1 : 0.4, width: "100%" }}>
                DEPOSIT {isValid ? `${parsedAmount.toFixed(2)} USDC` : ""}
              </button>
            </>
          )}

          {(step === "signing" || step === "confirming" || step === "crediting") && (
            <div style={{ padding: "30px 0", textAlign: "center" }}>
              <p style={{ ...bandLabel, color: DS.textMuted }}>
                {step === "signing" ? "WAITING FOR WALLET SIGNATURE..." : step === "confirming" ? "CONFIRMING ON-CHAIN..." : "CREDITING BUDGET..."}
              </p>
              {txHash && <p style={{ fontFamily: DS.fontMono, fontSize: "0.7rem", color: DS.textMuted, marginTop: 8 }}>{txHash.slice(0, 20)}...</p>}
            </div>
          )}

          {step === "done" && (
            <div style={{ padding: "30px 0", textAlign: "center" }}>
              <p className="ds-accent-text" style={{ ...bandLabel, marginBottom: 8 }}>DEPOSIT SUCCESSFUL</p>
              <p style={{ fontFamily: DS.fontPrimary, fontSize: "1.2rem", fontWeight: 400 }}>{parsedAmount.toFixed(2)} USDC CREDITED</p>
              <a href={`https://explorer.solana.com/tx/${txHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: DS.fontMono, fontSize: "0.7rem", color: DS.textMuted, display: "block", marginTop: 8 }}>View on Solana Explorer</a>
              <button onClick={onClose} style={{ ...bandLabel, fontSize: "0.75rem", marginTop: 16, background: "none", border: `1px solid ${DS.border}`, padding: "8px 20px", cursor: "pointer" }}>CLOSE</button>
            </div>
          )}

          {step === "error" && (
            <div style={{ padding: "20px 0" }}>
              <p className="ds-error-text" style={{ ...bandLabel, marginBottom: 8 }}>DEPOSIT FAILED</p>
              <p style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", color: DS.text, backgroundColor: "#f5e6e6", padding: 10, border: `1px solid ${DS.error}`, wordBreak: "break-all" }}>{errorMsg}</p>
              <button onClick={() => setStep("input")} style={{ ...bandLabel, fontSize: "0.75rem", marginTop: 12, background: "none", border: `1px solid ${DS.border}`, padding: "8px 20px", cursor: "pointer" }}>TRY AGAIN</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
