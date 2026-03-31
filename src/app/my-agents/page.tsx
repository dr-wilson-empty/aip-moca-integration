"use client";

import RegisterAgentForm from "@/components/explorer/RegisterAgentForm";
import { useWalletStore } from "@/store/walletStore";
import { useRouter } from "next/navigation";

export default function MyAgentsPage() {
  const { address } = useWalletStore();
  const router = useRouter();

  if (!address) {
    return (
      <div className="max-w-[1920px] mx-auto px-10 py-12 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <span className="font-mono text-sm text-muted">Connect your wallet to manage agents.</span>
        <button onClick={() => router.push("/connect")} className="font-mono text-xs text-accent hover:text-mint">
          Go to Connect
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12">
      <div className="mb-10">
        <span className="font-mono text-xs text-muted uppercase tracking-wider">Agent Management</span>
        <h2 className="font-display text-3xl text-mint uppercase tracking-tight mt-1">My Agents</h2>
        <p className="font-mono text-sm text-muted mt-2 max-w-xl">
          Register, update, or remove your agents on Solana. Each agent gets a unique on-chain identity.
        </p>
      </div>

      <div className="max-w-2xl">
        <RegisterAgentForm />
      </div>
    </div>
  );
}
