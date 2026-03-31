"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useRouter } from "next/navigation";
import { useWalletStore } from "@/store/walletStore";
import { useAgentStore } from "@/store/agentStore";
import { shortenAddress } from "@/lib/did";
import BtnPrimary from "@/components/ui/BtnPrimary";

export default function WalletConnectCard() {
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
    <div className="w-full max-w-xl mx-auto">
      <div className="border border-mint/20 bg-forest-deep/10 p-10 rounded-2xl transition-all duration-500">
        {/* Header */}
        <div className="mb-8 pb-6 border-b border-mint/20">
          <h1 className="font-display text-[clamp(40px,8vw,72px)] text-mint uppercase leading-none tracking-tight mb-2">
            AIP
          </h1>
          <p className="font-mono text-sm text-muted uppercase tracking-widest">
            Agent Internet Protocol
          </p>
        </div>

        {!address ? (
          <div className="flex flex-col gap-6">
            <p className="font-mono text-sm text-body leading-relaxed">
              Every user gets an AI Digital Twin — an autonomous agent that
              represents you across the agentic web. Connect your wallet to
              activate yours.
            </p>

            <BtnPrimary onClick={() => setVisible(true)}>
              <span className="text-lg">◎</span>
              Connect Wallet
            </BtnPrimary>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Status */}
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-aip-pulse" />
              <span className="font-mono text-xs text-accent uppercase">Digital Twin Active</span>
            </div>

            {/* Agent Name */}
            <div>
              {editingName ? (
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleNameSave()}
                    autoFocus
                    maxLength={24}
                    className="flex-1 bg-transparent border-b border-mint/40 px-1 py-2 rounded-md font-display text-2xl text-mint uppercase tracking-wider outline-none"
                  />
                  <BtnPrimary onClick={handleNameSave} variant="secondary">Save</BtnPrimary>
                </div>
              ) : (
                <div className="flex items-end justify-between">
                  <h2 className="font-display text-2xl text-mint uppercase tracking-wider">
                    {myCard.name}
                  </h2>
                  <button
                    onClick={() => { setNameInput(myCard.name); setEditingName(true); }}
                    className="font-mono text-xs text-muted uppercase hover:text-mint transition-colors"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>

            {/* Key info */}
            <div className="flex flex-col gap-3 border border-mint/20 p-5 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted uppercase">Wallet</span>
                <span className="font-mono text-sm text-mint">{shortenAddress(address)}</span>
              </div>
              <div className="h-px bg-mint/10" />
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted uppercase">Balance</span>
                <span className="font-mono text-sm text-accent font-bold">
                  {balanceLoading ? "..." : `${usdcBalance} USDC`}
                </span>
              </div>
              <div className="h-px bg-mint/10" />
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted uppercase">Network</span>
                <span className="font-mono text-sm text-muted">Solana Devnet</span>
              </div>
              <div className="h-px bg-mint/10" />
              <div className="flex items-start justify-between gap-4">
                <span className="font-mono text-xs text-muted uppercase shrink-0">DID</span>
                <span className="font-mono text-[11px] text-mint break-all text-right leading-relaxed">
                  {did}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-mint/20">
              <BtnPrimary variant="ghost" onClick={() => { disconnect(); clearWallet(); }}>
                Disconnect
              </BtnPrimary>
              <BtnPrimary onClick={() => router.push("/marketplace")}>
                Continue
                <span>→</span>
              </BtnPrimary>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
