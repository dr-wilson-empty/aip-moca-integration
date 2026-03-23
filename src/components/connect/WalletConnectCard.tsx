"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useRouter } from "next/navigation";
import { useWalletStore } from "@/store/walletStore";
import { useAgentStore } from "@/store/agentStore";
import { generateDID, shortenAddress } from "@/lib/did";
import MonoLabel from "@/components/ui/MonoLabel";
import BtnPrimary from "@/components/ui/BtnPrimary";

const TWIN_CAPABILITIES = [
  { icon: "◈", label: "DeFi Execution", desc: "Asset management & swaps" },
  { icon: "◇", label: "DAO Governance", desc: "Voting & proposals" },
  { icon: "△", label: "Contract Negotiation", desc: "Agent-to-agent deals" },
  { icon: "○", label: "Financial Strategy", desc: "Portfolio optimization" },
];

export default function WalletConnectCard() {
  const [mounted, setMounted] = useState(false);
  const { publicKey, disconnect, connected, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const { address, did, usdcBalance, setWallet, clearWallet } = useWalletStore();
  const { myCard, setAgentName } = useAgentStore();
  const router = useRouter();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(myCard.name);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (connected && publicKey) {
      const addr = publicKey.toBase58();
      setWallet(addr, generateDID(addr));
    } else if (!connected) {
      clearWallet();
    }
  }, [mounted, connected, publicKey, setWallet, clearWallet]);

  const handleNameSave = () => {
    const trimmed = nameInput.trim();
    if (trimmed) {
      setAgentName(trimmed);
    } else {
      setNameInput(myCard.name);
    }
    setEditingName(false);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="border border-forest-deep/40 bg-forest-deep/20 p-10 transition-all duration-500">
        {/* Header */}
        <div className="mb-10 border-b border-forest-deep/40 pb-8">
          <h1 className="font-display text-[clamp(40px,8vw,80px)] text-off-white uppercase leading-none tracking-tight mb-3">
            AIP
          </h1>
          <p className="font-mono text-xs text-muted uppercase tracking-widest">
            Agent Internet Protocol — Identity Layer
          </p>
        </div>

        {!mounted ? (
          <div className="flex flex-col gap-6">
            <div>
              <MonoLabel className="mb-3">Connect Wallet</MonoLabel>
              <p className="font-mono text-xs text-body leading-relaxed max-w-sm">
                Connect your Phantom wallet to generate your agent DID and
                enter the protocol.
              </p>
            </div>
            <BtnPrimary disabled>
              <span className="text-accent text-base">◎</span>
              Connect Wallet
            </BtnPrimary>
          </div>
        ) : !address ? (
          <div className="flex flex-col gap-6">
            {/* Digital Twin intro */}
            <div>
              <MonoLabel className="mb-3 text-accent">Your Digital Twin</MonoLabel>
              <p className="font-mono text-xs text-body leading-relaxed max-w-md">
                Every user gets an AI Digital Twin — an autonomous agent that
                represents you across the agentic web. Connect your wallet to
                activate yours.
              </p>
            </div>

            {/* Twin capabilities preview */}
            <div className="grid grid-cols-2 gap-2">
              {TWIN_CAPABILITIES.map((cap) => (
                <div
                  key={cap.label}
                  className="border border-forest-deep/40 p-3 flex items-start gap-3 opacity-40"
                >
                  <span className="text-accent text-sm mt-0.5">{cap.icon}</span>
                  <div>
                    <span className="font-mono text-[10px] text-off-white uppercase block">
                      {cap.label}
                    </span>
                    <span className="font-mono text-[9px] text-muted">{cap.desc}</span>
                  </div>
                </div>
              ))}
            </div>

            <BtnPrimary onClick={() => setVisible(true)} disabled={connecting}>
              {connecting ? (
                <>
                  <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin-slow" />
                  Connecting...
                </>
              ) : (
                <>
                  <span className="text-accent text-base">◎</span>
                  Connect Wallet
                </>
              )}
            </BtnPrimary>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {/* Digital Twin Active Header */}
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-accent animate-aip-pulse" />
              <MonoLabel className="text-accent !mb-0">Digital Twin Active</MonoLabel>
            </div>

            {/* Agent Name — editable */}
            <div className="border border-forest-deep/40 p-4">
              <MonoLabel className="mb-2">Agent Name</MonoLabel>
              {editingName ? (
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleNameSave()}
                    autoFocus
                    maxLength={24}
                    className="flex-1 bg-forest-deep/40 border border-accent/40 px-3 py-2 font-display text-lg text-off-white uppercase tracking-wider outline-none"
                  />
                  <button
                    onClick={handleNameSave}
                    className="font-mono text-[10px] text-accent uppercase hover:text-off-white transition-colors px-3 py-2 border border-accent/40"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg text-off-white uppercase tracking-wider">
                    {myCard.name}
                  </span>
                  <button
                    onClick={() => { setNameInput(myCard.name); setEditingName(true); }}
                    className="font-mono text-[9px] text-muted uppercase hover:text-accent transition-colors"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>

            {/* Identity + Balance */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-4">
                <div>
                  <MonoLabel className="mb-1">Wallet Address</MonoLabel>
                  <p className="font-mono text-sm text-off-white">
                    {shortenAddress(address)}
                  </p>
                </div>
                <div>
                  <MonoLabel className="mb-1">USDC Balance</MonoLabel>
                  <p className="font-mono text-sm text-accent font-bold">
                    {usdcBalance} USDC
                  </p>
                </div>
                <div>
                  <MonoLabel className="mb-1">Network</MonoLabel>
                  <p className="font-mono text-xs text-muted">Solana Devnet</p>
                </div>
              </div>

              <div className="border-l border-forest-deep/40 pl-6 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <MonoLabel>Agent DID</MonoLabel>
                  <div className="group relative">
                    <span className="w-4 h-4 rounded-full border border-muted flex items-center justify-center text-muted text-[9px] cursor-help">
                      ?
                    </span>
                    <div className="absolute left-6 top-0 w-56 bg-forest-deep border border-forest-mid p-3 text-[10px] font-mono text-body hidden group-hover:block z-10 leading-relaxed">
                      W3C DID standard — self-sovereign, cryptographically
                      verifiable identity. No central authority required.
                    </div>
                  </div>
                </div>
                <p className="font-mono text-[10px] text-accent break-all leading-relaxed">
                  {did}
                </p>
                <div className="mt-2">
                  <MonoLabel className="mb-1">Agent Type</MonoLabel>
                  <span className="font-mono text-[10px] uppercase px-2 py-0.5 border border-blue-800/40 text-blue-400 bg-blue-900/10">
                    LLM Agent
                  </span>
                </div>
              </div>
            </div>

            {/* Twin capabilities — now active */}
            <div>
              <MonoLabel className="mb-2">Twin Capabilities</MonoLabel>
              <div className="grid grid-cols-2 gap-2">
                {TWIN_CAPABILITIES.map((cap) => (
                  <div
                    key={cap.label}
                    className="border border-forest-deep/40 p-3 flex items-start gap-3 hover:border-accent/30 transition-colors"
                  >
                    <span className="text-accent text-sm mt-0.5">{cap.icon}</span>
                    <div>
                      <span className="font-mono text-[10px] text-off-white uppercase block">
                        {cap.label}
                      </span>
                      <span className="font-mono text-[9px] text-muted">{cap.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-forest-deep/40">
              <button
                onClick={() => { disconnect(); clearWallet(); }}
                className="font-mono text-[10px] text-muted uppercase tracking-wider hover:text-body transition-colors"
              >
                Disconnect
              </button>
              <BtnPrimary onClick={() => router.push("/explorer")}>
                Devam Et
                <span className="text-xs">→</span>
              </BtnPrimary>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
