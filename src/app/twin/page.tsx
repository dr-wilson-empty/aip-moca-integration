"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWalletStore } from "@/store/walletStore";
import { useAgentStore } from "@/store/agentStore";
import { useLogStore } from "@/store/logStore";
import { useTwinStore, type TwinMessage, type PipelineStep } from "@/store/twinStore";
import { useX402Payment } from "@/hooks/useX402Payment";
import { useTaskSSE } from "@/hooks/useTaskSSE";
import { useTaskStore } from "@/store/taskStore";
import ArtifactRenderer, { parseArtifact } from "@/components/ui/ArtifactRenderer";
import BtnPrimary from "@/components/ui/BtnPrimary";
import type { Task } from "@/types/aip";

const SOLANA_EXPLORER = "https://explorer.solana.com/tx";

function genId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/* ------------------------------------------------------------------ */
/*  Step status icons                                                  */
/* ------------------------------------------------------------------ */

function StepIcon({ status }: { status?: string }) {
  if (status === "completed") return <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-bg-base text-[10px]">✓</span>;
  if (status === "executing") return <span className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin-slow" />;
  if (status === "failed") return <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-bg-base text-[10px]">✗</span>;
  return <span className="w-5 h-5 rounded-full border border-forest-deep" />;
}

export default function TwinPage() {
  const router = useRouter();
  const { address, did, fetchBalance } = useWalletStore();
  const { setCounterpart } = useAgentStore();
  const { addTask } = useLogStore();
  const { messages, addMessage, updateMessage, updateStep, isProcessing, setProcessing } = useTwinStore();
  const { submitTaskWithPayment } = useX402Payment();
  const { startTask, resetTask, taskState, artifact, escrowTxHash, settlementTxHash, log } = useTaskStore();

  const [input, setInput] = useState("");
  const [activeMsgId, setActiveMsgId] = useState<string | null>(null);
  const [activeStepIdx, setActiveStepIdx] = useState<number>(-1);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef("");

  useTaskSSE(activeTaskId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---- Track step completion ---- */
  const handleStepComplete = useCallback(() => {
    if (!activeMsgId || activeStepIdx < 0) return;
    const msg = messages.find((m) => m.id === activeMsgId);
    if (!msg?.steps) return;

    const isCompleted = taskState === "COMPLETED";
    const stepArtifact = artifact ?? undefined;

    // Update step status
    updateStep(activeMsgId, activeStepIdx, {
      status: isCompleted ? "completed" : "failed",
      artifact: stepArtifact,
      escrowTxHash: escrowTxHash ?? undefined,
      settlementTxHash: settlementTxHash ?? undefined,
    });

    // Add to log
    const step = msg.steps[activeStepIdx];
    if (step) {
      const endTime = Date.now();
      const startMs = new Date(startTimeRef.current).getTime();
      const task: Task = {
        id: activeTaskId || "",
        counterpartAgent: step.agentName,
        capability: step.capabilityDescription,
        input: step.input,
        startedAt: startTimeRef.current,
        duration: `${((endTime - startMs) / 1000).toFixed(1)}s`,
        state: taskState!,
        usdcSpent: isCompleted ? step.estimatedCost : "0.00",
        artifact: stepArtifact,
        escrowTxHash: escrowTxHash ?? undefined,
        settlementTxHash: settlementTxHash ?? undefined,
        log: [...log],
      };
      addTask(task);
    }

    setActiveTaskId(null);

    if (!isCompleted) {
      // Step failed — stop pipeline
      updateMessage(activeMsgId, { state: "failed", content: "Pipeline stopped due to error." });
      setActiveMsgId(null);
      setActiveStepIdx(-1);
      setProcessing(false);
      if (address) fetchBalance(address);
      return;
    }

    // Check if more steps
    const nextIdx = activeStepIdx + 1;
    if (nextIdx < msg.steps.length) {
      // Feed output to next step
      const nextStep = msg.steps[nextIdx];
      if (nextStep.inputFromPrev && stepArtifact) {
        updateStep(activeMsgId, nextIdx, { input: stepArtifact });
      }
      updateMessage(activeMsgId, { currentStep: nextIdx });
      setActiveStepIdx(nextIdx);

      // Auto-execute next step
      setTimeout(() => executeStep(activeMsgId, nextIdx), 500);
    } else {
      // Pipeline complete
      const lastArtifact = stepArtifact;
      updateMessage(activeMsgId, {
        state: "completed",
        artifact: lastArtifact,
        content: "Pipeline completed successfully.",
      });
      setActiveMsgId(null);
      setActiveStepIdx(-1);
      setProcessing(false);
      if (address) fetchBalance(address);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskState, activeMsgId, activeStepIdx, artifact, escrowTxHash, settlementTxHash]);

  useEffect(() => {
    if (taskState === "COMPLETED" || taskState === "FAILED") {
      handleStepComplete();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskState]);

  /* ---- Execute a single step ---- */
  const executeStep = async (msgId: string, stepIdx: number) => {
    const msg = messages.find((m) => m.id === msgId);
    const step = msg?.steps?.[stepIdx];
    if (!step || !did || !address) return;

    updateStep(msgId, stepIdx, { status: "executing" });
    startTimeRef.current = new Date().toISOString();
    setActiveMsgId(msgId);
    setActiveStepIdx(stepIdx);

    setCounterpart({
      did: step.agentDid,
      name: step.agentName,
      version: "1.0.0",
      endpoint: step.agentEndpoint,
      type: "Task",
      capabilities: [{
        id: step.capabilityId,
        description: step.capabilityDescription,
        pricing: { amount: step.estimatedCost, token: "USDC", network: "solana" },
      }],
      walletAddress: step.walletAddress,
    });

    resetTask();
    startTask();

    try {
      const result = await submitTaskWithPayment({
        agentEndpoint: step.agentEndpoint,
        capability: step.capabilityId,
        input: step.input,
        amount: step.estimatedCost,
        callerDid: did,
        callerAddress: address,
      });

      if (result?.taskId) {
        setActiveTaskId(result.taskId);
        updateStep(msgId, stepIdx, { taskId: result.taskId, escrowTxHash: result.escrowTxHash });
      } else {
        updateStep(msgId, stepIdx, { status: "failed" });
        updateMessage(msgId, { state: "failed", content: "Payment cancelled." });
        setProcessing(false);
      }
    } catch (err) {
      updateStep(msgId, stepIdx, { status: "failed" });
      updateMessage(msgId, { state: "failed", content: `Error: ${err instanceof Error ? err.message : String(err)}` });
      setProcessing(false);
    }
  };

  if (!address) {
    return (
      <div className="max-w-[1920px] mx-auto px-10 py-12 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <span className="font-mono text-sm text-muted">Connect your wallet to use Digital Twin.</span>
        <BtnPrimary onClick={() => router.push("/connect")}>Connect Wallet</BtnPrimary>
      </div>
    );
  }

  /* ---- Send message ---- */
  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    const userMsg = input.trim();
    setInput("");

    addMessage({ id: genId(), role: "user", content: userMsg, timestamp: new Date().toLocaleTimeString() });

    setProcessing(true);
    const planMsgId = genId();
    addMessage({ id: planMsgId, role: "twin", content: "Analyzing your request...", timestamp: new Date().toLocaleTimeString(), state: "planning" });

    try {
      const res = await fetch("/api/twin/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });

      if (!res.ok) {
        const err = await res.json();
        updateMessage(planMsgId, { content: `Could not find a suitable agent. ${err.error || ""}`, state: "failed" });
        setProcessing(false);
        return;
      }

      const plan = await res.json();
      const steps = (plan.steps as PipelineStep[]).map((s) => ({ ...s, status: "pending" as const }));

      updateMessage(planMsgId, {
        content: plan.explanation,
        state: "confirming",
        mode: plan.mode,
        steps,
        totalCost: plan.totalCost,
        currentStep: 0,
        // Backward compat for single mode
        plan: steps.length === 1 ? steps[0] : undefined,
      });
    } catch (err) {
      updateMessage(planMsgId, { content: `Error: ${err instanceof Error ? err.message : String(err)}`, state: "failed" });
      setProcessing(false);
    }
  };

  /* ---- Confirm pipeline ---- */
  const handleConfirm = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.steps?.length) return;

    updateMessage(msgId, { state: "executing" });
    executeStep(msgId, 0);
  };

  const handleCancel = (msgId: string) => {
    updateMessage(msgId, { state: "failed", content: "Cancelled by user." });
    setProcessing(false);
  };

  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12 flex flex-col h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <span className="font-mono text-xs text-muted uppercase tracking-wider">Your AI Assistant</span>
          <h2 className="font-display text-3xl text-mint uppercase tracking-tight mt-1">Digital Twin</h2>
        </div>
        <p className="font-mono text-xs text-muted max-w-sm text-right">
          Tell me what you need. I will find the right agents and handle everything.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto border border-mint/10 rounded-xl p-6 mb-4 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-20">
            <div className="w-16 h-16 border border-mint/20 rounded-full flex items-center justify-center">
              <span className="font-display text-2xl text-mint">T</span>
            </div>
            <p className="font-mono text-sm text-muted max-w-md">
              I am your Digital Twin. Tell me what you need — I can use single agents or chain multiple agents together for complex tasks.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                "Summarize the AIP protocol",
                "Fetch Solana staking data and summarize it",
                "Audit the Jupiter swap contract and analyze DeFi risks",
              ].map((s) => (
                <button key={s} onClick={() => setInput(s)}
                  className="font-mono text-[11px] text-muted border border-forest-deep/40 px-3 py-1.5 rounded-lg hover:border-mint/20 hover:text-mint transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] ${
              msg.role === "user"
                ? "bg-mint/10 border border-mint/20 rounded-2xl rounded-br-md px-5 py-3"
                : "bg-forest-deep/30 border border-forest-deep/40 rounded-2xl rounded-bl-md px-5 py-3"
            }`}>
              {msg.role === "twin" && (
                <span className="font-mono text-[9px] text-purple-400 uppercase block mb-1">
                  {msg.state === "planning" ? "Thinking..." : msg.state === "executing" ? "Executing..." : "Twin"}
                </span>
              )}

              <p className="font-mono text-sm text-off-white leading-relaxed">{msg.content}</p>

              {/* Pipeline plan card */}
              {msg.steps && msg.state === "confirming" && (
                <div className="mt-3 border border-accent/20 rounded-lg p-4 bg-accent/5">
                  {msg.mode === "pipeline" && (
                    <span className="font-mono text-[9px] text-purple-400 uppercase block mb-3">
                      Pipeline — {msg.steps.length} steps
                    </span>
                  )}

                  {/* Steps */}
                  <div className="flex flex-col gap-2 mb-3">
                    {msg.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-3 py-1.5">
                        <span className="font-mono text-[10px] text-muted w-4">{i + 1}.</span>
                        <div className="flex-1">
                          <span className="font-mono text-[11px] text-off-white">{step.label}</span>
                          <span className="font-mono text-[9px] text-muted ml-2">{step.agentName}</span>
                        </div>
                        <span className="font-mono text-[10px] text-accent">{step.estimatedCost} USDC</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-forest-deep/40">
                      <span className="font-mono text-[10px] text-muted">Total</span>
                      <span className="font-mono text-[11px] text-accent font-bold">{msg.totalCost} USDC</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => handleConfirm(msg.id)}
                      className="flex-1 font-mono text-xs text-bg-base bg-accent px-3 py-2 rounded-lg hover:bg-mint transition-colors">
                      {msg.mode === "pipeline" ? "Execute Pipeline" : "Confirm & Pay"}
                    </button>
                    <button onClick={() => handleCancel(msg.id)}
                      className="font-mono text-xs text-muted border border-forest-deep/40 px-3 py-2 rounded-lg hover:text-red-400 hover:border-red-800/30 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Executing pipeline progress */}
              {msg.steps && msg.state === "executing" && (
                <div className="mt-3 border border-mint/10 rounded-lg p-4">
                  <div className="flex flex-col gap-3">
                    {msg.steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <StepIcon status={step.status} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`font-mono text-[11px] ${step.status === "completed" ? "text-accent" : step.status === "executing" ? "text-mint" : "text-muted"}`}>
                              {step.label}
                            </span>
                            <span className="font-mono text-[9px] text-muted">{step.estimatedCost} USDC</span>
                          </div>
                          {step.status === "completed" && step.artifact && (
                            <p className="font-mono text-[10px] text-body mt-1 truncate">{step.artifact.slice(0, 100)}...</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Completed — show final artifact */}
              {msg.state === "completed" && msg.artifact && (
                <div className="mt-3 border border-accent/20 rounded-lg p-4 bg-accent/5">
                  <span className="font-mono text-[9px] text-accent uppercase block mb-2">Final Result</span>
                  <ArtifactRenderer artifact={parseArtifact(msg.artifact)} />
                </div>
              )}

              {/* Completed pipeline — show all step results */}
              {msg.state === "completed" && msg.steps && msg.mode === "pipeline" && (
                <div className="mt-3 flex flex-col gap-2">
                  {msg.steps.filter((s) => s.artifact).map((step, i) => (
                    <details key={i} className="border border-forest-deep/30 rounded-lg">
                      <summary className="px-3 py-2 font-mono text-[10px] text-muted cursor-pointer hover:text-mint">
                        Step {i + 1}: {step.label} — {step.agentName}
                      </summary>
                      <div className="px-3 pb-3">
                        <ArtifactRenderer artifact={parseArtifact(step.artifact!)} />
                      </div>
                    </details>
                  ))}
                </div>
              )}

              {/* Tx links from steps */}
              {msg.steps?.some((s) => s.escrowTxHash || s.settlementTxHash) && (
                <div className="mt-2 flex flex-col gap-1">
                  {msg.steps.filter((s) => s.escrowTxHash).map((s, i) => (
                    <a key={`e${i}`} href={`${SOLANA_EXPLORER}/${s.escrowTxHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-[9px] text-muted hover:text-accent transition-colors">
                      ◎ Step {i + 1} Escrow: {s.escrowTxHash!.slice(0, 16)}...
                    </a>
                  ))}
                  {msg.steps.filter((s) => s.settlementTxHash).map((s, i) => (
                    <a key={`s${i}`} href={`${SOLANA_EXPLORER}/${s.settlementTxHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-[9px] text-muted hover:text-accent transition-colors">
                      ◎ Step {i + 1} Settlement: {s.settlementTxHash!.slice(0, 16)}...
                    </a>
                  ))}
                </div>
              )}

              {msg.state === "failed" && msg.role === "twin" && (
                <span className="font-mono text-[9px] text-red-400 uppercase block mt-1">Failed</span>
              )}

              <span className="font-mono text-[9px] text-muted/40 block mt-1">{msg.timestamp}</span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          disabled={isProcessing}
          placeholder="Tell your Twin what to do..."
          className="flex-1 bg-forest-deep/30 border border-mint/20 rounded-xl px-5 py-3 font-mono text-sm text-mint placeholder:text-muted/40 focus:border-mint/40 focus:outline-none disabled:opacity-50"
        />
        <BtnPrimary onClick={handleSend} disabled={!input.trim() || isProcessing}>
          {isProcessing ? "Working..." : "Send"}
        </BtnPrimary>
      </div>
    </div>
  );
}
