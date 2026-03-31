"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAgentStore } from "@/store/agentStore";
import { useTaskStore } from "@/store/taskStore";
import { useLogStore } from "@/store/logStore";
import { useWalletStore } from "@/store/walletStore";
import { useTaskSSE } from "@/hooks/useTaskSSE";
import { useX402Payment } from "@/hooks/useX402Payment";
import { TASK_PRESETS } from "@/lib/mock/presets";
import MonoLabel from "@/components/ui/MonoLabel";
import BtnPrimary from "@/components/ui/BtnPrimary";
import type { Task } from "@/types/aip";

export default function TaskForm() {
  const router = useRouter();
  const { counterpartCard } = useAgentStore();
  const { isRunning, taskState, log, artifact, escrowTxHash, settlementTxHash, startTask, resetTask } = useTaskStore();
  const { addTask } = useLogStore();
  const { did, address, fetchBalance } = useWalletStore();
  const { submitTaskWithPayment, error: paymentError } = useX402Payment();

  const [selectedCapId, setSelectedCapId] = useState(
    counterpartCard?.capabilities[0]?.id ?? ""
  );
  const [input, setInput] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const startTimeRef = useRef<string>("");
  const taskAddedRef = useRef(false);

  const selectedCap = counterpartCard?.capabilities.find(
    (c) => c.id === selectedCapId
  );

  const presets = TASK_PRESETS[selectedCapId] ?? [];

  // SSE hook — activeTaskId set edildiginde stream'e baglanir
  useTaskSSE(activeTaskId);

  // Task tamamlandiginda veya basarisiz oldugunda log'a ekle (useEffect icinde)
  useEffect(() => {
    if ((taskState === "COMPLETED" || taskState === "FAILED") && !taskAddedRef.current && activeTaskId) {
      taskAddedRef.current = true;
      const endTime = Date.now();
      const startMs = new Date(startTimeRef.current).getTime();
      const durationSec = ((endTime - startMs) / 1000).toFixed(1);

      const task: Task = {
        id: activeTaskId,
        counterpartAgent: counterpartCard?.name ?? "",
        capability: selectedCap?.description ?? "",
        input: input.trim(),
        startedAt: startTimeRef.current,
        duration: `${durationSec}s`,
        state: taskState,
        usdcSpent: taskState === "COMPLETED" ? (selectedCap?.pricing.amount ?? "0.00") : "0.00",
        artifact: artifact ?? undefined,
        escrowTxHash: escrowTxHash ?? undefined,
        settlementTxHash: settlementTxHash ?? undefined,
        log: [...log],
      };
      addTask(task);

      if (address) fetchBalance(address);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskState]);

  const handleStart = async () => {
    if (!selectedCap || !input.trim() || isRunning || !counterpartCard || !did || !address) return;

    startTimeRef.current = new Date().toISOString();
    taskAddedRef.current = false;
    startTask();

    try {
      // x402 Payment Flow:
      // 1. POST /api/task (no payment) → 402 + requirements
      // 2. Sign USDC tx with Phantom
      // 3. POST /api/task + X-PAYMENT → verify + settle + start task
      const result = await submitTaskWithPayment({
        agentEndpoint: counterpartCard.endpoint,
        capability: selectedCapId,
        input: input.trim(),
        amount: selectedCap.pricing.amount,
        callerDid: did,
        callerAddress: address,
      });

      if (result?.taskId) {
        setActiveTaskId(result.taskId);
      } else {
        resetTask();
      }
    } catch (err) {
      console.error("[TaskForm] Failed to start task:", err);
      resetTask();
    }
  };

  const handleNewTask = () => {
    resetTask();
    setInput("");
    setActiveTaskId(null);
    taskAddedRef.current = false;
  };

  if (!counterpartCard) {
    return (
      <div className="border border-mint/20 bg-forest-deep/10 p-8 rounded-xl flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 border border-mint/20 rounded-full flex items-center justify-center">
          <span className="text-mint text-lg">⬡</span>
        </div>
        <div>
          <p className="font-mono text-sm text-mint mb-1">No agent selected yet</p>
          <p className="font-mono text-xs text-muted">
            You need to select a counterpart agent before starting a task.
          </p>
        </div>
        <BtnPrimary onClick={() => router.push("/marketplace")}>
          Select an Agent
          <span>→</span>
        </BtnPrimary>
      </div>
    );
  }

  return (
    <div className="border border-mint/20 bg-forest-deep/10 p-6 rounded-xl flex flex-col gap-5">
      <div className="border-b border-mint/20 pb-4 flex items-center justify-between">
        <div>
          <span className="font-mono text-xs text-accent uppercase">Task Configuration</span>
          <p className="font-mono text-sm text-muted mt-1">
            Target: <span className="text-mint">{counterpartCard.name}</span>
          </p>
        </div>
        {(taskState === "COMPLETED" || taskState === "FAILED") && (
          <div className="flex gap-3">
            <BtnPrimary variant="secondary" onClick={handleNewTask}>
              New Task
            </BtnPrimary>
            <BtnPrimary onClick={() => router.push("/log")}>
              View Tx Log
              <span>→</span>
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
            className="w-full bg-forest-deep/30 border border-mint/20 px-4 py-3 rounded-lg font-mono text-sm text-mint outline-none focus:border-mint/40 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {counterpartCard.capabilities.map((cap) => (
              <option key={cap.id} value={cap.id}>
                {cap.description} — {cap.pricing.amount} {cap.pricing.token}
              </option>
            ))}
          </select>
          {selectedCap && (
            <p className="font-mono text-xs text-muted mt-1">
              {selectedCap.description}
            </p>
          )}
        </div>

        <div>
          {presets.length > 0 && !isRunning && taskState !== "COMPLETED" && taskState !== "FAILED" && (
            <div className="mb-3">
              <MonoLabel className="mb-2">Quick Start — click to use</MonoLabel>
              <div className="flex flex-col gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setInput(preset)}
                    className={`text-left font-mono text-xs px-4 py-2.5 border rounded-md transition-all duration-200 ${
                      input === preset
                        ? "border-mint/40 text-mint bg-mint/5"
                        : "border-forest-deep/40 text-body hover:text-mint hover:border-mint/20 hover:bg-forest-deep/30"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          <MonoLabel className="mb-2">Or type your own</MonoLabel>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isRunning || taskState === "COMPLETED" || taskState === "FAILED"}
            placeholder={selectedCap ? `e.g. "${presets[0] ?? `Use ${selectedCap.id} to...`}"` : "Describe the task..."}
            rows={2}
            className="w-full bg-forest-deep/30 border border-mint/20 px-4 py-3 rounded-lg font-mono text-sm text-mint placeholder-muted/40 outline-none focus:border-mint/40 transition-colors resize-none disabled:opacity-50"
          />
        </div>

        {paymentError && (
          <p className="font-mono text-[10px] text-red-400 border border-red-800/30 bg-red-900/10 px-3 py-2 rounded-md">
            x402 Payment Failed: {paymentError.slice(0, 80)}
          </p>
        )}

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
