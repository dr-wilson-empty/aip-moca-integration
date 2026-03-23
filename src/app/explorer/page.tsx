"use client";

import { useRouter } from "next/navigation";
import { useAgentStore } from "@/store/agentStore";
import { useWalletStore } from "@/store/walletStore";
import AgentCardPanel from "@/components/explorer/AgentCardPanel";
import AgentCompare from "@/components/explorer/AgentCompare";
import FetchPanel from "@/components/explorer/FetchPanel";
import ProtocolInfo from "@/components/explorer/ProtocolInfo";
import BtnPrimary from "@/components/ui/BtnPrimary";

export default function ExplorerPage() {
  const { myCard, counterpartCard, counterpartVerified } = useAgentStore();
  const { address } = useWalletStore();
  const router = useRouter();

  const myVerified = !!address;

  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12">
      <div className="mb-8 border-b border-mint/20 pb-6 flex items-end justify-between">
        <div>
          <span className="font-mono text-xs text-muted uppercase">Agent Card Explorer</span>
          <h2 className="font-display text-3xl text-mint uppercase tracking-tight mt-1">
            Discovery
          </h2>
        </div>
        <p className="font-mono text-sm text-muted max-w-xs text-right">
          Select an agent to verify their identity and start a task.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <AgentCardPanel card={myCard} title="Your Agent" verified={myVerified} />

        <div className="border border-mint/20 bg-forest-deep/10 p-6 flex flex-col gap-6">
          {!counterpartCard ? (
            <>
              <p className="font-mono text-sm text-body leading-relaxed">
                Select an agent below to fetch their Agent Card and verify their DID.
              </p>
              <FetchPanel />
            </>
          ) : (
            <>
              <AgentCardPanel
                card={counterpartCard}
                title="Counterpart Agent"
                verified={counterpartVerified}
              />
              <div className="border-t border-mint/20 pt-4">
                <FetchPanel />
              </div>
            </>
          )}
        </div>
      </div>

      {counterpartCard && (
        <div className="mt-6">
          <AgentCompare myCard={myCard} counterpartCard={counterpartCard} />
        </div>
      )}

      <div className="mt-6">
        <ProtocolInfo />
      </div>

      <div className="mt-8 flex items-center justify-between">
        {!counterpartCard ? (
          <p className="font-mono text-xs text-muted">
            Select an agent above to continue
          </p>
        ) : (
          <p className="font-mono text-xs text-accent">
            {counterpartCard.name} loaded — DID verified — ready to start a task
          </p>
        )}
        <BtnPrimary
          disabled={!counterpartCard}
          onClick={() => router.push("/dashboard")}
        >
          Start Task
          <span>→</span>
        </BtnPrimary>
      </div>
    </div>
  );
}
