"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import ArtifactRenderer, { parseArtifact } from "@/components/ui/ArtifactRenderer";

interface TaskDetail {
  id: string;
  callerDid: string;
  callerAddress: string;
  agentDid: string;
  agentName: string;
  agentAddress: string;
  capability: string;
  input: string;
  amount: string;
  state: string;
  escrowTxHash: string;
  settlementTxHash?: string;
  artifact?: string;
  failReason?: string;
  log: Array<{ id: string; timestamp: string; eventType: string; message: string }>;
  createdAt: string;
  updatedAt: string;
}

const stateColors: Record<string, string> = {
  COMPLETED: "text-accent border-accent/40 bg-accent/10",
  FAILED: "text-red-400 border-red-800/40 bg-red-900/10",
  WORKING: "text-blue-400 border-blue-800/40 bg-blue-900/10",
  SUBMITTED: "text-yellow-400 border-yellow-800/40 bg-yellow-900/10",
  CANCELLED: "text-muted border-forest-deep/60 bg-forest-deep/20",
};

const eventColors: Record<string, string> = {
  IDENTITY: "text-blue-400",
  PAYMENT: "text-accent",
  REQUEST: "text-yellow-400",
  PROCESSING: "text-purple-400",
  SETTLEMENT: "text-accent",
  COMPLETE: "text-accent",
  ERROR: "text-red-400",
  REFUND: "text-red-400",
};

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.taskId as string;
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/task?taskId=${taskId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => setTask(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) {
    return (
      <div className="max-w-[1920px] mx-auto px-10 py-12 flex items-center justify-center min-h-[60vh]">
        <span className="font-mono text-sm text-muted animate-pulse">Loading task...</span>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="max-w-[1920px] mx-auto px-10 py-12 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <span className="font-mono text-sm text-red-400">Task not found</span>
        <button onClick={() => router.push("/log")} className="font-mono text-xs text-muted hover:text-mint">
          Back to History
        </button>
      </div>
    );
  }

  const duration = task.createdAt && task.updatedAt
    ? `${((new Date(task.updatedAt).getTime() - new Date(task.createdAt).getTime()) / 1000).toFixed(1)}s`
    : "—";

  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12">
      {/* Breadcrumb */}
      <button onClick={() => router.push("/log")} className="font-mono text-xs text-muted hover:text-mint transition-colors mb-8 block">
        ← Task History
      </button>

      {/* Hero */}
      <div className="border border-mint/20 rounded-2xl p-10 mb-8 bg-gradient-to-br from-forest-deep/20 to-transparent">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <h1 className="font-display text-2xl text-mint uppercase tracking-tight">{task.agentName}</h1>
              <span className={`font-mono text-[10px] uppercase px-2.5 py-1 border rounded ${stateColors[task.state] || "text-muted"}`}>
                {task.state}
              </span>
            </div>
            <p className="font-mono text-sm text-muted">{task.capability}</p>
            <p className="font-mono text-[10px] text-muted/50 mt-1">{task.id}</p>
          </div>
          <div className="text-right">
            <span className="font-display text-2xl text-accent">{task.amount}</span>
            <span className="font-mono text-sm text-muted ml-1">USDC</span>
            <p className="font-mono text-[10px] text-muted mt-1">Duration: {duration}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Input + Artifact */}
        <div className="col-span-2 flex flex-col gap-6">
          {/* Input */}
          <div className="border border-mint/10 rounded-xl p-6">
            <span className="font-mono text-xs text-muted uppercase tracking-wider block mb-3">Input</span>
            <p className="font-mono text-sm text-body leading-relaxed whitespace-pre-wrap">{task.input}</p>
          </div>

          {/* Artifact */}
          {task.artifact && (
            <div className="border border-accent/20 rounded-xl p-6 bg-accent/5">
              <span className="font-mono text-xs text-accent uppercase tracking-wider block mb-3">Artifact (Result)</span>
              <ArtifactRenderer artifact={parseArtifact(task.artifact)} />
            </div>
          )}

          {/* Fail reason */}
          {task.failReason && (
            <div className="border border-red-800/20 rounded-xl p-6 bg-red-900/5">
              <span className="font-mono text-xs text-red-400 uppercase tracking-wider block mb-3">Error</span>
              <p className="font-mono text-sm text-red-400">{task.failReason}</p>
            </div>
          )}

          {/* Event Log */}
          <div className="border border-mint/10 rounded-xl p-6">
            <span className="font-mono text-xs text-muted uppercase tracking-wider block mb-4">Event Timeline</span>
            <div className="flex flex-col gap-0">
              {task.log.map((entry, i) => (
                <div key={entry.id} className="flex gap-4 py-2.5 border-b border-forest-deep/20 last:border-0">
                  <span className="font-mono text-[10px] text-muted w-16 shrink-0">{entry.timestamp}</span>
                  <div className="w-px bg-forest-deep/40 relative">
                    <div className={`w-2 h-2 rounded-full absolute -left-[3.5px] top-1 ${i === task.log.length - 1 ? "bg-accent" : "bg-forest-deep"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`font-mono text-[10px] uppercase ${eventColors[entry.eventType] || "text-muted"}`}>
                      [{entry.eventType}]
                    </span>
                    <p className="font-mono text-xs text-body mt-0.5">{entry.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Transactions + Metadata */}
        <div className="flex flex-col gap-4">
          {/* Transactions */}
          <div className="border border-mint/10 rounded-xl p-6">
            <span className="font-mono text-xs text-muted uppercase tracking-wider block mb-4">Transactions</span>
            <div className="flex flex-col gap-4">
              {task.escrowTxHash && (
                <div>
                  <span className="font-mono text-[10px] text-muted uppercase block mb-1">Escrow Lock</span>
                  <a
                    href={`https://explorer.solana.com/tx/${task.escrowTxHash}?cluster=devnet`}
                    target="_blank" rel="noopener noreferrer"
                    className="font-mono text-[11px] text-mint hover:text-accent break-all transition-colors"
                  >
                    {task.escrowTxHash}
                  </a>
                </div>
              )}
              {task.settlementTxHash && (
                <div>
                  <span className="font-mono text-[10px] text-muted uppercase block mb-1">Settlement</span>
                  <a
                    href={`https://explorer.solana.com/tx/${task.settlementTxHash}?cluster=devnet`}
                    target="_blank" rel="noopener noreferrer"
                    className="font-mono text-[11px] text-mint hover:text-accent break-all transition-colors"
                  >
                    {task.settlementTxHash}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="border border-mint/10 rounded-xl p-6">
            <span className="font-mono text-xs text-muted uppercase tracking-wider block mb-4">Details</span>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-muted">Agent</span>
                <span className="font-mono text-[10px] text-mint">{task.agentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-muted">Capability</span>
                <span className="font-mono text-[10px] text-mint">{task.capability}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-muted">Amount</span>
                <span className="font-mono text-[10px] text-accent">{task.amount} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-muted">Duration</span>
                <span className="font-mono text-[10px] text-mint">{duration}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-muted">Created</span>
                <span className="font-mono text-[10px] text-muted">{new Date(task.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Caller */}
          <div className="border border-mint/10 rounded-xl p-6">
            <span className="font-mono text-xs text-muted uppercase tracking-wider block mb-3">Caller</span>
            <p className="font-mono text-[10px] text-muted break-all">{task.callerAddress}</p>
            <p className="font-mono text-[9px] text-muted/50 mt-1 break-all">{task.callerDid}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
