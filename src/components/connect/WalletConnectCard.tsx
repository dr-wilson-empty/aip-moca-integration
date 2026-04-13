"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useRouter } from "next/navigation";
import { useWalletStore } from "@/store/walletStore";
import { useAgentStore } from "@/store/agentStore";
import { shortenAddress } from "@/lib/did";

const DS = {
  bg: "#e6e5e0",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  dark: "#222222",
  green: "#7cb342",
  white: "#ffffff",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

export default function WalletConnectCard() {
  const bandLabel = { fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700 as const, textTransform: "uppercase" as const, letterSpacing: "0.1em" };
  const btnDark = { padding: "14px 32px", fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700 as const, textTransform: "uppercase" as const, letterSpacing: "0.05em", backgroundColor: DS.dark, color: DS.bg, border: "none", cursor: "pointer" as const, display: "inline-flex" as const, alignItems: "center" as const, gap: 10 };
  const btnOutline = { ...btnDark, backgroundColor: "transparent", border: `1px solid ${DS.border}`, color: DS.text };
  const { disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { address, did, usdcBalance, balanceLoading, clearWallet } = useWalletStore();
  const { myCard, setAgentName } = useAgentStore();
  const router = useRouter();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(myCard.name);

  const handleNameSave = () => {
    const trimmed = nameInput.trim();
    if (trimmed) setAgentName(trimmed);
    else setNameInput(myCard.name);
    setEditingName(false);
  };

  return (
    <div style={{ width: "100%", maxWidth: 560, border: `1px solid ${DS.border}`, backgroundColor: DS.bg }}>

      {/* Header — hero style */}
      <div style={{ padding: "30px 32px 0", borderBottom: `1px solid ${DS.border}`, position: "relative", overflow: "hidden" }}>
        <h1 style={{ fontFamily: DS.fontPrimary, fontSize: "5rem", fontWeight: 300, lineHeight: 0.85, textTransform: "uppercase", letterSpacing: "-0.03em", color: DS.text, textShadow: "3px 3px 0px #d5d0c8", position: "relative", zIndex: 1, margin: 0, marginBottom: -6 }}>
          Connect
        </h1>
        <span style={{ position: "absolute", bottom: -12, right: -5, fontSize: "8rem", fontWeight: 700, color: "#d5d0c8", lineHeight: 0.8, letterSpacing: "-0.05em", zIndex: 0, pointerEvents: "none" as const, fontFamily: DS.fontPrimary }}>
          AIP
        </span>
      </div>

      {/* Subtitle band */}
      <div style={{ padding: "12px 32px", borderBottom: `1px solid ${DS.border}`, ...bandLabel, color: DS.textMuted, fontWeight: 400 }}>
        AGENT INTERNET PROTOCOL
      </div>

      {!address ? (
        <div style={{ padding: "32px" }}>
          <p style={{ fontFamily: DS.fontMono, fontSize: "0.9rem", fontWeight: 700, lineHeight: 1.6, marginBottom: 24 }}>
            Every user gets an AI Digital Twin — an autonomous agent that represents you across the agentic web. Connect your wallet to activate yours.
          </p>
          <button onClick={() => setVisible(true)} className="mp-white-text" style={btnDark}>
            CONNECT WALLET
          </button>
        </div>
      ) : (
        <div>
          {/* Status band */}
          <div style={{ padding: "12px 32px", borderBottom: `1px solid ${DS.border}`, display: "flex", alignItems: "center", gap: 8, backgroundColor: "#d5d0c8" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: DS.green, display: "inline-block", boxShadow: `0 0 4px ${DS.green}` }} />
            <span className="ds-accent-text" style={bandLabel}>DIGITAL TWIN ACTIVE</span>
          </div>

          {/* Agent Name */}
          <div style={{ padding: "20px 32px", borderBottom: `1px solid ${DS.border}` }}>
            {editingName ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleNameSave()} autoFocus maxLength={24} style={{ flex: 1, fontFamily: DS.fontPrimary, fontSize: "1.5rem", fontWeight: 300, textTransform: "uppercase", letterSpacing: "-0.02em", border: "none", borderBottom: `2px solid ${DS.border}`, backgroundColor: "transparent", outline: "none", padding: "4px 0" }} />
                <button onClick={handleNameSave} className="mp-white-text" style={{ ...btnDark, padding: "8px 16px", fontSize: "0.75rem" }}>SAVE</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                <h2 style={{ fontFamily: DS.fontPrimary, fontSize: "1.8rem", fontWeight: 300, textTransform: "uppercase", letterSpacing: "-0.02em" }}>{myCard.name}</h2>
                <button onClick={() => { setNameInput(myCard.name); setEditingName(true); }} style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>EDIT</button>
              </div>
            )}
          </div>

          {/* Info rows */}
          <div>
            {[
              { label: "WALLET", value: shortenAddress(address) },
              { label: "BALANCE", value: balanceLoading ? "..." : `${usdcBalance} USDC` },
              { label: "NETWORK", value: "SOLANA DEVNET" },
            ].map((row) => (
              <div key={row.label} style={{ padding: "12px 32px", borderBottom: `1px solid ${DS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ ...bandLabel, fontSize: "0.75rem", color: DS.textMuted }}>{row.label}</span>
                <span style={{ fontFamily: DS.fontMono, fontSize: "0.9rem", fontWeight: 700 }}>{row.value}</span>
              </div>
            ))}
            <div style={{ padding: "12px 32px", borderBottom: `1px solid ${DS.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <span style={{ ...bandLabel, fontSize: "0.75rem", color: DS.textMuted, flexShrink: 0 }}>DID</span>
              <span style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, wordBreak: "break-all", textAlign: "right" }}>{did}</span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={async () => { try { await disconnect(); } catch (e) { /* ignore */ } clearWallet(); }} style={btnOutline}>DISCONNECT</button>
            <button onClick={() => router.push("/marketplace")} className="mp-white-text" style={btnDark}>CONTINUE</button>
          </div>
        </div>
      )}
    </div>
  );
}
