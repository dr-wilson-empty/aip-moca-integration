"use client";

import { useEffect, useRef } from "react";
import { useTaskStore } from "@/store/taskStore";
import MonoLabel from "@/components/ui/MonoLabel";

const SOLANA_EXPLORER = "https://explorer.solana.com/tx";

export default function LiveLog() {
  const { log, artifact, escrowTxHash, settlementTxHash, taskState } = useTaskStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const eventColor = (type: string) => {
    if (type.includes("IDENTITY")) return "text-accent";
    if (type.includes("PAYMENT")) return "text-yellow-400";
    if (type.includes("REQUEST")) return "text-blue-400";
    if (type.includes("PROCESSING")) return "text-mint";
    if (type.includes("ERROR") || type.includes("FAIL")) return "text-red-400";
    if (type.includes("REFUND")) return "text-orange-400";
    if (type.includes("COMPLETE") || type.includes("SETTLEMENT")) return "text-green-400";
    return "text-body";
  };

  return (
    <div className="border border-forest-deep/60 bg-forest-deep/20 p-6 flex flex-col gap-4">
      <MonoLabel className="text-accent">Live Log</MonoLabel>

      {/* Artifact — only on success */}
      {artifact && taskState === "COMPLETED" && (
        <div className="border border-accent/30 bg-accent/5 p-4">
          <MonoLabel className="text-accent mb-2">Task Artifact</MonoLabel>
          <p className="font-mono text-xs text-off-white leading-relaxed">
            {artifact}
          </p>
          <div className="mt-3 flex flex-col gap-1">
            {escrowTxHash && (
              <a
                href={`${SOLANA_EXPLORER}/${escrowTxHash}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-muted hover:text-accent transition-colors"
              >
                ◎ Escrow Tx: {escrowTxHash.slice(0, 20)}...
              </a>
            )}
            {settlementTxHash && (
              <a
                href={`${SOLANA_EXPLORER}/${settlementTxHash}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-muted hover:text-accent transition-colors"
              >
                ◎ Settlement Tx: {settlementTxHash.slice(0, 20)}...
              </a>
            )}
          </div>
        </div>
      )}

      {/* Failure box */}
      {taskState === "FAILED" && (
        <div className="border border-red-800/40 bg-red-900/10 p-4">
          <MonoLabel className="text-red-400 mb-2">Task Failed</MonoLabel>
          <p className="font-mono text-xs text-red-300 leading-relaxed">
            Execution error occurred. Funds have been refunded to your wallet.
          </p>
          <div className="mt-3 flex flex-col gap-1">
            {escrowTxHash && (
              <a
                href={`${SOLANA_EXPLORER}/${escrowTxHash}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-muted hover:text-red-400 transition-colors"
              >
                ◎ Escrow Tx (refunded): {escrowTxHash.slice(0, 20)}...
              </a>
            )}
          </div>
        </div>
      )}

      {/* Log entries */}
      <div className="max-h-64 overflow-y-auto flex flex-col gap-1 font-mono text-[10px]">
        {log.length === 0 && (
          <p className="text-muted">Waiting for task to start...</p>
        )}
        {log.map((entry) => (
          <div key={entry.id} className="flex items-start gap-3">
            <span className="text-forest-mid shrink-0">{entry.timestamp}</span>
            <span className={`uppercase shrink-0 ${eventColor(entry.eventType)}`}>
              [{entry.eventType}]
            </span>
            <span className="text-body">{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {taskState === "COMPLETED" && (
        <div className="flex items-center gap-2 pt-2 border-t border-forest-deep/40">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span className="font-mono text-[10px] text-accent uppercase">
            Task Completed — Payment Released
          </span>
        </div>
      )}

      {taskState === "FAILED" && (
        <div className="flex items-center gap-2 pt-2 border-t border-forest-deep/40">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="font-mono text-[10px] text-red-400 uppercase">
            Task Failed — Escrow Refunded
          </span>
        </div>
      )}
    </div>
  );
}
