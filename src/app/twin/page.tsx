"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useWalletStore } from "@/store/walletStore";
import { useAgentStore } from "@/store/agentStore";
import { useLogStore } from "@/store/logStore";
import { useTwinStore, type TwinMessage } from "@/store/twinStore";
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

export default function TwinPage() {
  const router = useRouter();
  const { address, did, fetchBalance } = useWalletStore();
  const { setCounterpart } = useAgentStore();
  const { addTask } = useLogStore();
  const { messages, addMessage, updateMessage, isProcessing, setProcessing } = useTwinStore();
  const { submitTaskWithPayment } = useX402Payment();
  const { startTask, resetTask, taskState, artifact, escrowTxHash, settlementTxHash, log } = useTaskStore();

  const [input, setInput] = useState("");
  const [activeTaskMsgId, setActiveTaskMsgId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef("");

  useTaskSSE(activeTaskId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Track task completion
  useEffect(() => {
    if (!activeTaskMsgId || !activeTaskId) return;
    if (taskState === "COMPLETED" || taskState === "FAILED") {
      updateMessage(activeTaskMsgId, {
        state: taskState === "COMPLETED" ? "completed" : "failed",
        artifact: artifact ?? undefined,
        escrowTxHash: escrowTxHash ?? undefined,
        settlementTxHash: settlementTxHash ?? undefined,
      });

      // Add to log store
      const msg = messages.find((m) => m.id === activeTaskMsgId);
      if (msg?.plan) {
        const endTime = Date.now();
        const startMs = new Date(startTimeRef.current).getTime();
        const task: Task = {
          id: activeTaskId,
          counterpartAgent: msg.plan.agentName,
          capability: msg.plan.capabilityDescription,
          input: msg.plan.input,
          startedAt: startTimeRef.current,
          duration: `${((endTime - startMs) / 1000).toFixed(1)}s`,
          state: taskState,
          usdcSpent: taskState === "COMPLETED" ? msg.plan.estimatedCost : "0.00",
          artifact: artifact ?? undefined,
          escrowTxHash: escrowTxHash ?? undefined,
          settlementTxHash: settlementTxHash ?? undefined,
          log: [...log],
        };
        addTask(task);
      }

      if (address) fetchBalance(address);
      setActiveTaskId(null);
      setActiveTaskMsgId(null);
      setProcessing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskState]);

  if (!address) {
    return (
      <div className="max-w-[1920px] mx-auto px-10 py-12 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <span className="font-mono text-sm text-muted">Connect your wallet to use Digital Twin.</span>
        <BtnPrimary onClick={() => router.push("/connect")}>Connect Wallet</BtnPrimary>
      </div>
    );
  }

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    const userMsg = input.trim();
    setInput("");

    // Add user message
    addMessage({ id: genId(), role: "user", content: userMsg, timestamp: new Date().toLocaleTimeString() });

    // Analyze intent
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
        updateMessage(planMsgId, {
          content: `I couldn't find a suitable agent for that. ${err.error || ""}`,
          state: "failed",
        });
        setProcessing(false);
        return;
      }

      const plan = await res.json();

      updateMessage(planMsgId, {
        content: plan.explanation,
        state: "confirming",
        plan: {
          agentName: plan.agent.name,
          agentEndpoint: plan.agent.endpoint,
          agentDid: plan.agent.did,
          capabilityId: plan.capability.id,
          capabilityDescription: plan.capability.description,
          input: plan.input,
          estimatedCost: plan.estimatedCost,
          walletAddress: plan.agent.walletAddress,
        },
      });
    } catch (err) {
      updateMessage(planMsgId, {
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        state: "failed",
      });
      setProcessing(false);
    }
  };

  const handleConfirm = async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.plan || !did || !address) return;

    updateMessage(msgId, { state: "executing", content: `Executing via ${msg.plan.agentName}...` });
    setProcessing(true);
    startTimeRef.current = new Date().toISOString();
    setActiveTaskMsgId(msgId);

    // Set counterpart for the payment flow
    setCounterpart({
      did: msg.plan.agentDid,
      name: msg.plan.agentName,
      version: "1.0.0",
      endpoint: msg.plan.agentEndpoint,
      type: "Task",
      capabilities: [{
        id: msg.plan.capabilityId,
        description: msg.plan.capabilityDescription,
        pricing: { amount: msg.plan.estimatedCost, token: "USDC", network: "solana" },
      }],
      walletAddress: msg.plan.walletAddress,
    });

    startTask();

    try {
      const result = await submitTaskWithPayment({
        agentEndpoint: msg.plan.agentEndpoint,
        capability: msg.plan.capabilityId,
        input: msg.plan.input,
        amount: msg.plan.estimatedCost,
        callerDid: did,
        callerAddress: address,
      });

      if (result?.taskId) {
        setActiveTaskId(result.taskId);
        updateMessage(msgId, { taskId: result.taskId, escrowTxHash: result.escrowTxHash });
      } else {
        updateMessage(msgId, { state: "failed", content: "Payment failed or cancelled." });
        resetTask();
        setProcessing(false);
      }
    } catch (err) {
      updateMessage(msgId, { state: "failed", content: `Error: ${err instanceof Error ? err.message : String(err)}` });
      resetTask();
      setProcessing(false);
    }
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
          Tell me what you need. I will find the right agent and handle everything.
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
              I am your Digital Twin. Tell me what you need in plain language —
              I will find the best agent, negotiate the price, and execute the task for you.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {["Summarize the AIP protocol", "Audit a Solana smart contract", "Get DeFi risk analysis for Jupiter"].map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); }}
                  className="font-mono text-[11px] text-muted border border-forest-deep/40 px-3 py-1.5 rounded-lg hover:border-mint/20 hover:text-mint transition-all"
                >
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
              {/* Twin label */}
              {msg.role === "twin" && (
                <span className="font-mono text-[9px] text-purple-400 uppercase block mb-1">
                  {msg.state === "planning" ? "Thinking..." : msg.state === "executing" ? "Executing..." : "Twin"}
                </span>
              )}

              {/* Message content */}
              <p className="font-mono text-sm text-off-white leading-relaxed">{msg.content}</p>

              {/* Plan card */}
              {msg.plan && msg.state === "confirming" && (
                <div className="mt-3 border border-accent/20 rounded-lg p-4 bg-accent/5">
                  <div className="flex flex-col gap-2 mb-3">
                    <div className="flex justify-between">
                      <span className="font-mono text-[10px] text-muted">Agent</span>
                      <span className="font-mono text-[10px] text-mint">{msg.plan.agentName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-mono text-[10px] text-muted">Capability</span>
                      <span className="font-mono text-[10px] text-mint">{msg.plan.capabilityDescription}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-mono text-[10px] text-muted">Cost</span>
                      <span className="font-mono text-[10px] text-accent">{msg.plan.estimatedCost} USDC</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleConfirm(msg.id)}
                      className="flex-1 font-mono text-xs text-bg-base bg-accent px-3 py-2 rounded-lg hover:bg-mint transition-colors"
                    >
                      Confirm & Pay
                    </button>
                    <button
                      onClick={() => handleCancel(msg.id)}
                      className="font-mono text-xs text-muted border border-forest-deep/40 px-3 py-2 rounded-lg hover:text-red-400 hover:border-red-800/30 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Executing spinner */}
              {msg.state === "executing" && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="w-2 h-2 border border-accent border-t-transparent rounded-full animate-spin-slow" />
                  <span className="font-mono text-[10px] text-muted">Processing on-chain...</span>
                </div>
              )}

              {/* Completed artifact */}
              {msg.state === "completed" && msg.artifact && (
                <div className="mt-3 border border-accent/20 rounded-lg p-4 bg-accent/5">
                  <span className="font-mono text-[9px] text-accent uppercase block mb-2">Result</span>
                  <ArtifactRenderer artifact={parseArtifact(msg.artifact)} />
                </div>
              )}

              {/* Tx links */}
              {(msg.escrowTxHash || msg.settlementTxHash) && (
                <div className="mt-2 flex flex-col gap-1">
                  {msg.escrowTxHash && (
                    <a href={`${SOLANA_EXPLORER}/${msg.escrowTxHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-[9px] text-muted hover:text-accent transition-colors">
                      ◎ Escrow: {msg.escrowTxHash.slice(0, 16)}...
                    </a>
                  )}
                  {msg.settlementTxHash && (
                    <a href={`${SOLANA_EXPLORER}/${msg.settlementTxHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-[9px] text-muted hover:text-accent transition-colors">
                      ◎ Settlement: {msg.settlementTxHash.slice(0, 16)}...
                    </a>
                  )}
                </div>
              )}

              {/* Failed */}
              {msg.state === "failed" && msg.role === "twin" && (
                <div className="mt-1">
                  <span className="font-mono text-[9px] text-red-400 uppercase">Failed</span>
                </div>
              )}

              {/* Timestamp */}
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
