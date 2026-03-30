"use client";

import type { Task } from "@/types/aip";
import MonoLabel from "@/components/ui/MonoLabel";

const SOLANA_EXPLORER = "https://explorer.solana.com/tx";

interface Props {
  task: Task;
  onClose: () => void;
}

export default function TaskDetailModal({ task, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/80 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl border border-forest-mid bg-bg-base p-8 rounded-2xl flex flex-col gap-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-forest-deep/40 pb-4">
          <div>
            <MonoLabel className="mb-1 text-accent">Task Detail</MonoLabel>
            <h3 className="font-display text-xl text-off-white uppercase">
              {task.id}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-muted text-xs hover:text-off-white transition-colors"
          >
            ✕ Close
          </button>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <MonoLabel className="mb-1">Agent</MonoLabel>
            <p className="font-mono text-xs text-off-white">{task.counterpartAgent}</p>
          </div>
          <div>
            <MonoLabel className="mb-1">Capability</MonoLabel>
            <p className="font-mono text-xs text-accent">{task.capability}</p>
          </div>
          <div>
            <MonoLabel className="mb-1">Input</MonoLabel>
            <p className="font-mono text-xs text-body">{task.input}</p>
          </div>
          <div>
            <MonoLabel className="mb-1">USDC Spent</MonoLabel>
            <p className="font-mono text-xs text-yellow-400">{task.usdcSpent} USDC</p>
          </div>
        </div>

        {/* Artifact */}
        {task.artifact && (
          <div className="border border-accent/30 bg-accent/5 p-4 rounded-lg">
            <MonoLabel className="mb-2 text-accent">Artifact</MonoLabel>
            <p className="font-mono text-xs text-off-white leading-relaxed">{task.artifact}</p>
          </div>
        )}

        {/* Tx hashes */}
        <div className="flex flex-col gap-2">
          {task.escrowTxHash && (
            <a
              href={`${SOLANA_EXPLORER}/${task.escrowTxHash}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-muted hover:text-accent transition-colors"
            >
              ◎ Escrow Tx: {task.escrowTxHash}
            </a>
          )}
          {task.settlementTxHash && (
            <a
              href={`${SOLANA_EXPLORER}/${task.settlementTxHash}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-muted hover:text-accent transition-colors"
            >
              ◎ Settlement Tx: {task.settlementTxHash}
            </a>
          )}
        </div>

        {/* Log */}
        <div>
          <MonoLabel className="mb-2">Event Log</MonoLabel>
          <div className="flex flex-col gap-1">
            {task.log.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 font-mono text-[10px]">
                <span className="text-forest-mid shrink-0">{entry.timestamp}</span>
                <span className="text-accent uppercase shrink-0">[{entry.eventType}]</span>
                <span className="text-body">{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
