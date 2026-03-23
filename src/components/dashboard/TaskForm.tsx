"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAgentStore } from "@/store/agentStore";
import { useTaskStore } from "@/store/taskStore";
import { useLogStore } from "@/store/logStore";
import { useWalletStore } from "@/store/walletStore";
import { runMockSSE, runMockSSEFailed } from "@/lib/mock/sse";
import { TASK_PRESETS } from "@/lib/mock/presets";
import MonoLabel from "@/components/ui/MonoLabel";
import BtnPrimary from "@/components/ui/BtnPrimary";
import type { Task, LogEntry } from "@/types/aip";

export default function TaskForm() {
  const router = useRouter();
  const { counterpartCard } = useAgentStore();
  const { isRunning, taskState, startTask, updateNodes, addLogEntry, completeTask, failTask, resetTask } = useTaskStore();
  const { addTask } = useLogStore();
  const { deductBalance, refundBalance } = useWalletStore();

  const [selectedCapId, setSelectedCapId] = useState(
    counterpartCard?.capabilities[0]?.id ?? ""
  );
  const [input, setInput] = useState("");

  const startTimeRef = useRef<string>("");
  const logCollector = useRef<LogEntry[]>([]);

  const selectedCap = counterpartCard?.capabilities.find(
    (c) => c.id === selectedCapId
  );

  const presets = TASK_PRESETS[selectedCapId] ?? [];

  const handleStart = () => {
    if (!selectedCap || !input.trim() || isRunning || !counterpartCard) return;

    startTimeRef.current = new Date().toISOString();
    logCollector.current = [];
    startTask();

    deductBalance(selectedCap.pricing.amount);

    const collectLog = (entry: LogEntry) => {
      logCollector.current.push(entry);
      addLogEntry(entry);
    };

    const sseParams = {
      agentName: counterpartCard.name,
      agentDid: counterpartCard.did,
      capabilityId: selectedCapId,
      usdcAmount: selectedCap.pricing.amount,
      taskInput: input.trim(),
    };

    const willFail = Math.random() < 0.2;

    if (willFail) {
      runMockSSEFailed(
        sseParams,
        updateNodes,
        collectLog,
        (escrowTx) => {
          failTask(escrowTx);
          refundBalance(selectedCap.pricing.amount);

          const endTime = Date.now();
          const startMs = new Date(startTimeRef.current).getTime();
          const durationSec = ((endTime - startMs) / 1000).toFixed(1);

          const task: Task = {
            id: `task_${Math.random().toString(36).slice(2, 10)}`,
            counterpartAgent: counterpartCard.name,
            capability: selectedCapId,
            input: input.trim(),
            startedAt: startTimeRef.current,
            duration: `${durationSec}s`,
            state: "FAILED",
            usdcSpent: "0.00",
            escrowTxHash: escrowTx,
            log: [...logCollector.current],
          };

          addTask(task);
        }
      );
    } else {
      runMockSSE(
        sseParams,
        updateNodes,
        collectLog,
        (artifact, escrowTx, settlementTx) => {
          completeTask(artifact, escrowTx, settlementTx);

          const endTime = Date.now();
          const startMs = new Date(startTimeRef.current).getTime();
          const durationSec = ((endTime - startMs) / 1000).toFixed(1);

          const task: Task = {
            id: `task_${Math.random().toString(36).slice(2, 10)}`,
            counterpartAgent: counterpartCard.name,
            capability: selectedCapId,
            input: input.trim(),
            startedAt: startTimeRef.current,
            duration: `${durationSec}s`,
            state: "COMPLETED",
            usdcSpent: selectedCap.pricing.amount,
            artifact,
            escrowTxHash: escrowTx,
            settlementTxHash: settlementTx,
            log: [...logCollector.current],
          };

          addTask(task);
        }
      );
    }
  };

  const handleNewTask = () => {
    resetTask();
    setInput("");
  };

  if (!counterpartCard) {
    return (
      <div className="border border-forest-deep/40 p-6 flex items-center justify-between">
        <p className="font-mono text-xs text-muted">
          No counterpart agent loaded.
        </p>
        <BtnPrimary onClick={() => router.push("/explorer")}>
          Go to Agent Card Explorer
          <span className="text-xs">→</span>
        </BtnPrimary>
      </div>
    );
  }

  return (
    <div className="border border-forest-deep/60 bg-forest-deep/20 p-6 flex flex-col gap-5">
      <div className="border-b border-forest-deep/40 pb-4 flex items-center justify-between">
        <div>
          <MonoLabel className="text-accent mb-1">Task Configuration</MonoLabel>
          <p className="font-mono text-xs text-muted">
            Target: {counterpartCard.name}
          </p>
        </div>
        {(taskState === "COMPLETED" || taskState === "FAILED") && (
          <div className="flex gap-3">
            <BtnPrimary onClick={handleNewTask}>
              New Task
            </BtnPrimary>
            <BtnPrimary onClick={() => router.push("/log")}>
              View Tx Log
              <span className="text-xs">→</span>
            </BtnPrimary>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <MonoLabel className="mb-2">Capability</MonoLabel>
          <select
            value={selectedCapId}
            onChange={(e) => { setSelectedCapId(e.target.value); setInput(""); }}
            disabled={isRunning || taskState === "COMPLETED" || taskState === "FAILED"}
            className="w-full bg-forest-deep/40 border border-forest-deep/60 px-4 py-3 font-mono text-xs text-off-white outline-none focus:border-accent/60 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {counterpartCard.capabilities.map((cap) => (
              <option key={cap.id} value={cap.id}>
                {cap.id} — {cap.pricing.amount} {cap.pricing.token}
              </option>
            ))}
          </select>
          {selectedCap && (
            <p className="font-mono text-[10px] text-muted mt-1">
              {selectedCap.description}
            </p>
          )}
        </div>

        <div>
          <MonoLabel className="mb-2">Task Input</MonoLabel>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isRunning || taskState === "COMPLETED" || taskState === "FAILED"}
            placeholder="Describe the task for the agent..."
            rows={3}
            className="w-full bg-forest-deep/40 border border-forest-deep/60 px-4 py-3 font-mono text-xs text-off-white placeholder-muted/50 outline-none focus:border-accent/60 transition-colors resize-none disabled:opacity-50"
          />

          {/* Presets */}
          {presets.length > 0 && !isRunning && taskState !== "COMPLETED" && taskState !== "FAILED" && (
            <div className="mt-2">
              <MonoLabel className="mb-1.5">Suggestions</MonoLabel>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setInput(preset)}
                    className={`font-mono text-[9px] px-2.5 py-1.5 border transition-colors ${
                      input === preset
                        ? "border-accent/40 text-accent bg-accent/10"
                        : "border-forest-deep/60 text-muted hover:text-off-white hover:border-forest-mid"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <MonoLabel className="mb-1">Estimated Cost</MonoLabel>
            <p className="font-mono text-sm text-accent font-bold">
              {selectedCap?.pricing.amount ?? "—"} USDC
            </p>
          </div>
          {taskState !== "COMPLETED" && taskState !== "FAILED" && (
            <BtnPrimary
              onClick={handleStart}
              disabled={isRunning || !input.trim()}
            >
              {isRunning ? (
                <>
                  <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin-slow" />
                  Running...
                </>
              ) : (
                <>
                  <span>⬡</span>
                  Start Task & Lock Escrow
                </>
              )}
            </BtnPrimary>
          )}
        </div>
      </div>
    </div>
  );
}
