"use client";

import { useRouter } from "next/navigation";
import { useAgentStore } from "@/store/agentStore";
import { useWalletStore } from "@/store/walletStore";
import AgentCardPanel from "@/components/explorer/AgentCardPanel";
import AgentCompare from "@/components/explorer/AgentCompare";
import FetchPanel from "@/components/explorer/FetchPanel";
import ProtocolInfo from "@/components/explorer/ProtocolInfo";
import BtnPrimary from "@/components/ui/BtnPrimary";
import MonoLabel from "@/components/ui/MonoLabel";

export default function ExplorerPage() {
  const { myCard, counterpartCard, counterpartVerified } = useAgentStore();
  const { address } = useWalletStore();
  const router = useRouter();

  const myVerified = !!address;

  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12">
      <div className="mb-8 border-b border-forest-deep/40 pb-6 flex items-end justify-between">
        <div>
          <MonoLabel className="mb-2">02 // Agent Card Explorer</MonoLabel>
          <h2 className="font-display text-3xl text-off-white uppercase tracking-tight">
            Discovery
          </h2>
        </div>
        <p className="font-mono text-xs text-muted max-w-xs text-right">
          Fetch a counterpart agent&apos;s card to verify their DID and capabilities.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <AgentCardPanel card={myCard} title="Your Agent" verified={myVerified} />

        <div className="border border-forest-deep/60 bg-forest-deep/20 p-6 flex flex-col gap-6">
          {!counterpartCard ? (
            <>
              <MonoLabel className="text-muted">Counterpart Agent</MonoLabel>
              <p className="font-mono text-xs text-body leading-relaxed">
                Select one of the available agents below to fetch their Agent Card
                and verify their DID.
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
              <div className="border-t border-forest-deep/40 pt-4">
                <FetchPanel />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Agent Comparison — appears when counterpart is loaded */}
      {counterpartCard && (
        <div className="mt-6">
          <AgentCompare myCard={myCard} counterpartCard={counterpartCard} />
        </div>
      )}

      {/* Protocol Info — collapsible */}
      <div className="mt-6">
        <ProtocolInfo />
      </div>

      <div className="mt-8 flex items-center justify-between">
        {!counterpartCard && (
          <p className="font-mono text-[10px] text-muted uppercase">
            Fetch a counterpart agent to continue
          </p>
        )}
        {counterpartCard && (
          <p className="font-mono text-[10px] text-accent uppercase">
            {counterpartCard.name} loaded — DID verified — ready to start a task
          </p>
        )}
        <BtnPrimary
          disabled={!counterpartCard}
          onClick={() => router.push("/dashboard")}
        >
          Start Task
          <span className="text-xs">→</span>
        </BtnPrimary>
      </div>
    </div>
  );
}
