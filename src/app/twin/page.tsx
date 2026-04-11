"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { useWalletStore } from "@/store/walletStore";
import { useAgentStore } from "@/store/agentStore";
import { useLogStore } from "@/store/logStore";
import { useTwinStore, type TwinMessage, type PipelineStep } from "@/store/twinStore";
import { useX402Payment } from "@/hooks/useX402Payment";
import { useTaskSSE } from "@/hooks/useTaskSSE";
import { useTaskStore } from "@/store/taskStore";
import ArtifactRenderer, { parseArtifact } from "@/components/ui/ArtifactRenderer";
import FileUpload from "@/components/ui/FileUpload";
import type { Task } from "@/types/aip";

const SOLANA_EXPLORER = "https://explorer.solana.com/tx";

function genId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/* ─── Design System ─── */
const DS = {
  bg: "#e6e5e0",
  bgHover: "#d9d8d3",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  dark: "#222222",
  green: "#7cb342",
  cyan: "#4dd0e1",
  yellow: "#ffee58",
  white: "#ffffff",
  error: "#c62828",
  purple: "#7c3aed",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

/* ─── Step Icon ─── */
function StepIcon({ status }: { status?: string }) {
  const base: React.CSSProperties = { width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", flexShrink: 0 };
  if (status === "completed") return <span style={{ ...base, backgroundColor: DS.green, color: "#fff" }}>✓</span>;
  if (status === "executing") return <span style={{ ...base, border: `2px solid ${DS.text}`, borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />;
  if (status === "failed") return <span style={{ ...base, backgroundColor: DS.error, color: "#fff" }}>✗</span>;
  return <span style={{ ...base, border: `1px solid #bbb` }} />;
}

export default function TwinPage() {
  const router = useRouter();
  const { address, did, fetchBalance, authReady } = useWalletStore();
  const { setCounterpart } = useAgentStore();
  const { addTask } = useLogStore();
  const { messages, addMessage, updateMessage, updateStep, isProcessing, setProcessing, loadFromServer, loaded, loading, loadMore, hasMore, loadingMore, clearMessages } = useTwinStore();
  const { submitTaskWithPayment } = useX402Payment();
  const { startTask, resetTask, taskState, artifact, escrowTxHash, settlementTxHash, log } = useTaskStore();

  const [input, setInput] = useState("");
  const [fileContext, setFileContext] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [activeMsgId, setActiveMsgId] = useState<string | null>(null);
  const [activeStepIdx, setActiveStepIdx] = useState<number>(-1);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreScrollRef = useRef<{ height: number; pending: boolean }>({ height: 0, pending: false });
  const startTimeRef = useRef("");
  const chainPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { autonomousMode, setAutonomousMode } = useTwinStore();

  useTaskSSE(activeTaskId);

  useEffect(() => {
    return () => {
      if (chainPollRef.current) {
        clearInterval(chainPollRef.current);
        chainPollRef.current = null;
      }
    };
  }, []);

  const { setWallet } = useTwinStore();

  useEffect(() => {
    if (address && authReady) {
      setWallet(address);
      loadFromServer(address);
    }
  }, [address, authReady, loadFromServer, setWallet]);

  useEffect(() => {
    if (loadMoreScrollRef.current.pending) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useLayoutEffect(() => {
    if (loadMoreScrollRef.current.pending && scrollRef.current) {
      const diff = scrollRef.current.scrollHeight - loadMoreScrollRef.current.height;
      if (diff > 0) scrollRef.current.scrollTop += diff;
      loadMoreScrollRef.current = { height: 0, pending: false };
    }
  }, [messages]);

  const handleLoadMore = () => {
    if (!address || !scrollRef.current) return;
    loadMoreScrollRef.current = { height: scrollRef.current.scrollHeight, pending: true };
    loadMore(address);
  };

  /* ---- Theme override ---- */
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-twin-theme", "true");
    style.textContent = `
      body { background-color: ${DS.bg} !important; color: ${DS.text} !important; }
      main.pt-14 { padding-top: 56px; }
      nav[aria-label="Main navigation"] {
        background-color: ${DS.bg} !important;
        
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      nav[aria-label="Main navigation"] a,
      nav[aria-label="Main navigation"] span {
        color: ${DS.text} !important;
        font-family: ${DS.fontMono} !important;
      }
      nav[aria-label="Main navigation"] a:hover { color: ${DS.textMuted} !important; }
      nav[aria-label="Main navigation"] a[aria-current="page"] { color: ${DS.text} !important; font-weight: 700 !important; }
      nav[aria-label="Main navigation"] .w-2.h-2 { background-color: ${DS.green} !important; }
      nav[aria-label="Main navigation"] .w-px { background-color: ${DS.border} !important; opacity: 0.2; }
      main.pt-14 * { color: #000000 !important; }
      main.pt-14 input::placeholder { color: #555555 !important; }
      main.pt-14 .mp-white-text { color: #ffffff !important; }
      main.pt-14 .ds-accent-text { color: ${DS.green} !important; }
      main.pt-14 .ds-error-text { color: ${DS.error} !important; }
      main.pt-14 .ds-muted-text { color: ${DS.textMuted} !important; }
      main.pt-14 .ds-purple-text { color: ${DS.purple} !important; }
      main.pt-14 select, main.pt-14 option { color: #000 !important; background-color: ${DS.bg} !important; }
      ::-webkit-scrollbar-track { background: ${DS.bg} !important; }
      ::-webkit-scrollbar-thumb { background: ${DS.textMuted} !important; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @media (max-width: 900px) { .ds-title { font-size: 2.5rem !important; } }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  /* ---- Track step completion ---- */
  const handleStepComplete = useCallback(() => {
    if (!activeMsgId || activeStepIdx < 0) return;
    const msg = messages.find((m) => m.id === activeMsgId);
    if (!msg?.steps) return;

    const isCompleted = taskState === "COMPLETED";
    const stepArtifact = artifact ?? undefined;

    updateStep(activeMsgId, activeStepIdx, {
      status: isCompleted ? "completed" : "failed",
      artifact: stepArtifact,
      escrowTxHash: escrowTxHash ?? undefined,
      settlementTxHash: settlementTxHash ?? undefined,
    });

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
      updateMessage(activeMsgId, { state: "failed", content: "Pipeline stopped due to error." });
      setActiveMsgId(null);
      setActiveStepIdx(-1);
      setProcessing(false);
      if (address) fetchBalance(address);
      return;
    }

    const nextIdx = activeStepIdx + 1;
    if (nextIdx < msg.steps.length) {
      const nextStep = msg.steps[nextIdx];
      if (nextStep.inputFromPrev && stepArtifact) {
        updateStep(activeMsgId, nextIdx, { input: stepArtifact });
      }
      updateMessage(activeMsgId, { currentStep: nextIdx });
      setActiveStepIdx(nextIdx);
      const nextInput = nextStep.inputFromPrev && stepArtifact ? stepArtifact : nextStep.input;
      setTimeout(() => executeStep(activeMsgId, nextIdx, nextInput), 500);
    } else {
      const lastArtifact = stepArtifact;
      updateMessage(activeMsgId, { state: "completed", artifact: lastArtifact, content: "Pipeline completed successfully." });
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
  const executeStep = async (msgId: string, stepIdx: number, overrideInput?: string) => {
    const msg = messages.find((m) => m.id === msgId);
    const step = msg?.steps?.[stepIdx];
    if (!step || !did || !address) return;
    const stepInput = overrideInput || step.input;

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
        input: stepInput,
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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16, fontFamily: DS.fontPrimary }}>
        <p style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", color: DS.textMuted }}>
          Connect your wallet to use Digital Twin
        </p>
        <button onClick={() => router.push("/connect")} className="mp-white-text" style={{ padding: "12px 30px", fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", backgroundColor: DS.dark, border: "none", cursor: "pointer" }}>
          Connect Wallet
        </button>
      </div>
    );
  }

  /* ---- Send message ---- */
  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    const userMsg = input.trim();
    const fullMsg = fileContext ? `${userMsg}\n\n${fileContext}` : userMsg;
    setInput("");
    setFileContext(null);
    setFileName(null);

    addMessage({ id: genId(), role: "user", content: fileContext ? `${userMsg} [+ ${fileName}]` : userMsg, timestamp: new Date().toLocaleTimeString() }, address ?? undefined);
    setProcessing(true);
    const planMsgId = genId();
    addMessage({ id: planMsgId, role: "twin", content: "Analyzing your request...", timestamp: new Date().toLocaleTimeString(), state: "planning" }, address ?? undefined);

    try {
      const res = await fetch("/api/twin/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: fullMsg, walletAddress: address }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        updateMessage(planMsgId, { content: `Could not find a suitable agent. ${err.error || ""}`, state: "failed" });
        setProcessing(false);
        return;
      }

      const plan = await res.json().catch(() => null);
      if (!plan || !plan.steps) {
        updateMessage(planMsgId, { content: "Failed to parse agent response. Please try again.", state: "failed" });
        setProcessing(false);
        return;
      }
      const steps = (plan.steps as PipelineStep[]).map((s) => ({ ...s, status: "pending" as const }));

      updateMessage(planMsgId, {
        content: plan.explanation,
        state: "confirming",
        mode: plan.mode,
        steps,
        totalCost: plan.totalCost,
        orchestratorAlt: plan.orchestratorAlternative || undefined,
        hasPipelineAlt: plan.hasPipelineAlternative || false,
        currentStep: 0,
        plan: steps.length === 1 ? steps[0] : undefined,
      });
    } catch (err) {
      updateMessage(planMsgId, { content: `Error: ${err instanceof Error ? err.message : String(err)}`, state: "failed" });
      setProcessing(false);
    }
  };

  /* ---- Autonomous chain execution ---- */
  const executeAutonomousChain = async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.steps?.length || !address || !did) return;

    updateMessage(msgId, { state: "executing", autonomous: true });
    setProcessing(true);

    try {
      const res = await fetch("/api/chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callerAddress: address,
          callerDid: did,
          steps: msg.steps.map((s) => ({
            agentDid: s.agentDid, agentName: s.agentName, agentEndpoint: s.agentEndpoint,
            walletAddress: s.walletAddress || "", capabilityId: s.capabilityId,
            capabilityDescription: s.capabilityDescription, estimatedCost: s.estimatedCost,
            label: s.label, inputFromPrev: s.inputFromPrev, input: s.input || "", status: "pending",
          })),
          totalCost: msg.totalCost || "0",
          depositTxHash: "autonomous-mode",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        updateMessage(msgId, { state: "failed", content: `Chain failed: ${err.error || "Unknown error"}` });
        setProcessing(false);
        return;
      }

      const { chain } = await res.json();
      updateMessage(msgId, { chainId: chain.id });

      if (chainPollRef.current) clearInterval(chainPollRef.current);
      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/chain?id=${chain.id}`);
          if (!pollRes.ok) return;
          const { chain: updated } = await pollRes.json();

          if (updated.steps) {
            const currentMsg = messages.find((m) => m.id === msgId);
            const uiStepCount = currentMsg?.steps?.length ?? 0;
            const limit = Math.min(updated.steps.length, uiStepCount);
            for (let i = 0; i < limit; i++) {
              const chainStep = updated.steps[i];
              updateStep(msgId, i, {
                status: chainStep.status, taskId: chainStep.taskId,
                artifact: chainStep.artifact, escrowTxHash: chainStep.escrowTxHash,
                settlementTxHash: chainStep.settlementTxHash,
              });
            }
            updateMessage(msgId, { currentStep: Math.min(updated.currentStep, uiStepCount - 1) });
          }

          if (updated.status === "completed") {
            clearInterval(pollInterval);
            chainPollRef.current = null;
            const stepSummary = (updated.steps as Array<{ agentName: string; capabilityDescription: string; estimatedCost: string; status: string }>)
              .map((s, i) => `${i + 1}. ${s.agentName} — ${s.capabilityDescription} (${s.status === "completed" ? s.estimatedCost + " USDC" : "FAILED"})`)
              .join("\n");
            updateMessage(msgId, { state: "completed", artifact: updated.finalArtifact, content: `Autonomous pipeline completed.\n\n${stepSummary}\n\nTotal: ${updated.totalSpent} USDC` });
            for (const step of updated.steps as Array<{ taskId?: string; agentName: string; capabilityDescription: string; capabilityId: string; input: string; estimatedCost: string; status: string; artifact?: string; escrowTxHash?: string; settlementTxHash?: string }>) {
              if (step.taskId) {
                addTask({ id: step.taskId, counterpartAgent: step.agentName, capability: step.capabilityId || step.capabilityDescription, input: step.input || "", startedAt: updated.createdAt || new Date().toISOString(), duration: "—", state: step.status === "completed" ? "COMPLETED" : "FAILED", usdcSpent: step.status === "completed" ? step.estimatedCost : "0.00", artifact: step.artifact, escrowTxHash: step.escrowTxHash, settlementTxHash: step.settlementTxHash, log: [], isAgentTask: true, delegatedBy: did || undefined, chainId: chain.id });
              }
            }
            setProcessing(false);
            if (address) fetchBalance(address);
          } else if (updated.status === "failed") {
            clearInterval(pollInterval);
            chainPollRef.current = null;
            const failedStep = updated.steps.find((s: { status: string }) => s.status === "failed");
            for (const step of updated.steps as Array<{ taskId?: string; agentName: string; capabilityDescription: string; capabilityId: string; input: string; estimatedCost: string; status: string; artifact?: string; escrowTxHash?: string; settlementTxHash?: string }>) {
              if (step.taskId && (step.status === "completed" || step.status === "failed")) {
                addTask({ id: step.taskId, counterpartAgent: step.agentName, capability: step.capabilityId || step.capabilityDescription, input: step.input || "", startedAt: updated.createdAt || new Date().toISOString(), duration: "—", state: step.status === "completed" ? "COMPLETED" : "FAILED", usdcSpent: step.status === "completed" ? step.estimatedCost : "0.00", artifact: step.artifact, escrowTxHash: step.escrowTxHash, settlementTxHash: step.settlementTxHash, log: [], isAgentTask: true, delegatedBy: did || undefined, chainId: chain.id });
              }
            }
            updateMessage(msgId, { state: "failed", content: `Pipeline failed at step ${updated.currentStep + 1}: ${failedStep?.error || "Unknown error"}` });
            setProcessing(false);
            if (address) fetchBalance(address);
          }
        } catch { /* retry on next poll */ }
      }, 1000);
      chainPollRef.current = pollInterval;
      setTimeout(() => { clearInterval(pollInterval); chainPollRef.current = null; }, 300000);
    } catch (err) {
      updateMessage(msgId, { state: "failed", content: `Error: ${err instanceof Error ? err.message : String(err)}` });
      setProcessing(false);
    }
  };

  const hasOrchestratorStep = (steps: PipelineStep[]) =>
    steps.some((s) => s.agentEndpoint?.includes("/api/hosted-agent"));

  const handleConfirm = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.steps?.length) return;
    if (autonomousMode && hasOrchestratorStep(msg.steps)) {
      executeAutonomousChain(msgId);
      return;
    }
    updateMessage(msgId, { state: "executing" });
    executeStep(msgId, 0);
  };

  const handleDirectPipeline = async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;
    const msgIdx = messages.findIndex((m) => m.id === msgId);
    const userMsg = messages.slice(0, msgIdx).reverse().find((m) => m.role === "user");
    const originalInput = userMsg?.content || msg.content;

    updateMessage(msgId, { content: "Replanning as direct pipeline...", state: "planning" });
    try {
      const res = await fetch("/api/twin/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: originalInput, walletAddress: address, skipOrchestrator: true }) });
      if (!res.ok) { updateMessage(msgId, { content: "Failed to replan.", state: "failed" }); setProcessing(false); return; }
      const plan = await res.json().catch(() => null);
      if (!plan || !plan.steps) { updateMessage(msgId, { content: "Failed to parse replan response.", state: "failed" }); setProcessing(false); return; }
      const steps = (plan.steps as PipelineStep[]).map((s) => ({ ...s, status: "pending" as const }));
      updateMessage(msgId, { content: plan.explanation, state: "confirming", mode: plan.mode, steps, totalCost: plan.totalCost, hasPipelineAlt: false, orchestratorAlt: plan.orchestratorAlternative || undefined });
    } catch { updateMessage(msgId, { content: "Replan failed.", state: "failed" }); setProcessing(false); }
  };

  const handleUseOrchestrator = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.orchestratorAlt) return;
    const orch = msg.orchestratorAlt;
    const orchStep: PipelineStep = { agentName: orch.agentName, agentEndpoint: orch.agentEndpoint, agentDid: orch.agentDid, walletAddress: orch.walletAddress, capabilityId: orch.capabilityId, capabilityDescription: orch.capabilityDescription, input: input || msg.content || "", inputFromPrev: false, estimatedCost: orch.estimatedCost, label: `${orch.agentName}: ${orch.capabilityDescription}`, status: "pending" };
    updateMessage(msgId, { mode: "single", steps: [orchStep], totalCost: orch.estimatedCost, orchestratorAlt: undefined });
    if (autonomousMode) { setTimeout(() => executeAutonomousChain(msgId), 100); }
  };

  const handleCancel = (msgId: string) => {
    updateMessage(msgId, { state: "failed", content: "Cancelled by user." });
    setProcessing(false);
  };

  /* ─── Shared styles ─── */
  const bandLabel: React.CSSProperties = { fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" };
  const btnDark: React.CSSProperties = { padding: "10px 24px", fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", backgroundColor: DS.dark, color: DS.bg, border: "none", cursor: "pointer" };
  const btnOutline: React.CSSProperties = { ...btnDark, backgroundColor: "transparent", border: `1px solid ${DS.border}`, color: DS.text };

  return (
    <div style={{ width: "100%", maxWidth: 1920, margin: "0 auto", display: "flex", flexDirection: "column", height: "calc(100vh - 56px)", fontFamily: DS.fontPrimary, WebkitFontSmoothing: "antialiased" }}>

      {/* ═══ Header ═══ */}
      <header style={{ padding: "30px 30px 20px", borderBottom: `1px solid ${DS.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h2 className="ds-title" style={{ fontSize: "3rem", fontWeight: 400, lineHeight: 0.95, textTransform: "uppercase", letterSpacing: "-0.02em", color: DS.text, fontFamily: DS.fontPrimary }}>
            Digital Twin
          </h2>
          <p style={{ ...bandLabel, color: DS.textMuted, marginTop: 8, fontWeight: 400 }}>
            Your AI assistant / Tell me what you need
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Autonomous toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <span style={{ ...bandLabel, color: DS.textMuted, fontSize: "0.65rem" }}>AUTONOMOUS</span>
            <button onClick={() => setAutonomousMode(!autonomousMode)} style={{ position: "relative", width: 36, height: 20, borderRadius: 10, backgroundColor: autonomousMode ? DS.green : "#bbb", border: "none", cursor: "pointer", transition: "background-color 0.2s" }}>
              <span style={{ position: "absolute", top: 2, width: 16, height: 16, borderRadius: "50%", backgroundColor: "#fff", transition: "left 0.2s", left: autonomousMode ? 18 : 2 }} />
            </button>
          </label>
          {messages.length > 0 && !isProcessing && (
            <button onClick={() => clearMessages()} style={{ ...bandLabel, color: DS.error, fontSize: "0.65rem", background: "none", border: "none", cursor: "pointer" }} className="ds-error-text">
              CLEAR
            </button>
          )}
        </div>
      </header>

      {/* ═══ Messages ═══ */}
      <div ref={scrollRef} role="log" aria-label="Chat messages" aria-live="polite" style={{ flex: 1, overflowY: "auto", padding: "20px 30px", display: "flex", flexDirection: "column", gap: 16 }}>

        {!loaded && loading && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ ...bandLabel, color: DS.textMuted }}>LOADING CHAT HISTORY...</span>
          </div>
        )}

        {hasMore && (
          <button onClick={handleLoadMore} disabled={loadingMore} style={{ alignSelf: "center", ...bandLabel, color: DS.textMuted, fontSize: "0.6rem", border: `1px solid #ccc`, padding: "6px 16px", backgroundColor: "transparent", cursor: "pointer", opacity: loadingMore ? 0.5 : 1 }}>
            {loadingMore ? "LOADING..." : "LOAD OLDER MESSAGES"}
          </button>
        )}

        {messages.length === 0 && loaded && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "60px 0" }}>
            <div style={{ width: 64, height: 64, border: `1px solid ${DS.border}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: DS.fontPrimary, fontSize: "1.8rem", fontWeight: 400 }}>T</span>
            </div>
            <p style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, color: DS.textMuted, maxWidth: 400, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Tell me what you need — I can use single agents or chain multiple agents together
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, justifyContent: "center" }}>
              {["Summarize the AIP protocol", "Fetch Solana staking data and summarize it", "Audit the Jupiter swap contract"].map((s) => (
                <button key={s} onClick={() => setInput(s)} style={{ fontFamily: DS.fontMono, fontSize: "0.65rem", fontWeight: 700, color: DS.textMuted, border: `1px solid #ccc`, padding: "8px 14px", backgroundColor: "transparent", cursor: "pointer", textTransform: "none" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "80%", padding: "16px 20px", borderTop: `1px solid ${DS.border}`, borderRight: `1px solid ${DS.border}`, borderBottom: `1px solid ${DS.border}`, borderLeft: msg.role === "twin" ? `4px solid ${msg.state === "failed" ? DS.error : msg.state === "completed" ? DS.green : DS.text}` : `1px solid ${DS.border}`, backgroundColor: msg.role === "user" ? "#d5d0c8" : DS.bg }}>

              {msg.role === "twin" && (
                <span className={msg.state === "failed" ? "ds-error-text" : msg.state === "completed" ? "ds-accent-text" : "ds-purple-text"} style={{ ...bandLabel, fontSize: "0.6rem", display: "block", marginBottom: 6 }}>
                  {msg.state === "planning" ? "THINKING..." : msg.state === "executing" ? "EXECUTING..." : msg.state === "failed" ? "FAILED" : msg.state === "completed" ? "COMPLETED" : "TWIN"}
                </span>
              )}

              <p style={{ fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, lineHeight: 1.5, whiteSpace: "pre-wrap", color: DS.text }}>{msg.content}</p>

              {/* Pipeline confirming */}
              {msg.steps && msg.state === "confirming" && (
                <div style={{ marginTop: 12, border: `1px solid ${DS.border}`, padding: 16 }}>
                  {msg.mode === "pipeline" && (
                    <span className="ds-purple-text" style={{ ...bandLabel, fontSize: "0.6rem", display: "block", marginBottom: 10 }}>
                      PIPELINE — {msg.steps.length} STEPS
                    </span>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                    {msg.steps.map((step, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: i < msg.steps!.length - 1 ? "1px solid #ccc" : "none" }}>
                        <span style={{ ...bandLabel, fontSize: "0.6rem", color: DS.textMuted, width: 16 }}>{i + 1}.</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700 }}>{step.label}</span>
                          <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.6rem", marginLeft: 8 }}>{step.agentName}</span>
                        </div>
                        <span style={{ fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700 }}>{step.estimatedCost} USDC</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `1px solid ${DS.border}` }}>
                      <span style={{ ...bandLabel, fontSize: "0.6rem", color: DS.textMuted }}>TOTAL</span>
                      <span style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700 }}>{msg.totalCost} USDC</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {msg.orchestratorAlt && autonomousMode && (
                      <button onClick={() => handleUseOrchestrator(msg.id)} className="mp-white-text" style={{ ...btnDark, backgroundColor: "#7DB342", width: "100%", textAlign: "center" }}>
                        Use {msg.orchestratorAlt.agentName} ({msg.orchestratorAlt.estimatedCost} USDC)
                      </button>
                    )}
                    {msg.hasPipelineAlt && autonomousMode && (
                      <button onClick={() => handleDirectPipeline(msg.id)} style={{ ...btnOutline, width: "100%", textAlign: "center" }}>
                        Switch to Direct Pipeline
                      </button>
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => handleConfirm(msg.id)} className="mp-white-text" style={{ ...btnDark, flex: 1, textAlign: "center" }}>
                        {autonomousMode && hasOrchestratorStep(msg.steps || []) ? (msg.orchestratorAlt ? "Direct Pipeline" : "Run Autonomously") : msg.mode === "pipeline" ? "Execute Pipeline" : "Confirm & Pay"}
                      </button>
                      <button onClick={() => handleCancel(msg.id)} className="ds-error-text" style={{ ...btnOutline, color: DS.error }}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Executing progress */}
              {msg.steps && msg.state === "executing" && (
                <div style={{ marginTop: 12, border: `1px solid ${DS.border}`, padding: 16 }}>
                  {msg.steps.map((step, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "start", gap: 10, padding: "8px 0" }}>
                      <StepIcon status={step.status} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span className={step.status === "completed" ? "ds-accent-text" : ""} style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700 }}>{step.label}</span>
                          <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.6rem" }}>{step.estimatedCost} USDC</span>
                        </div>
                        {step.status === "completed" && step.artifact && (
                          <p className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.65rem", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{step.artifact.slice(0, 100)}...</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Completed artifact */}
              {msg.state === "completed" && msg.artifact && (
                <div style={{ marginTop: 12, border: `1px solid ${DS.border}`, borderLeft: `4px solid ${DS.green}`, padding: 16 }}>
                  <span className="ds-accent-text" style={{ ...bandLabel, fontSize: "0.6rem", display: "block", marginBottom: 2 }}>FINAL RESULT</span>
                  <div style={{ fontSize: "1rem", lineHeight: 1.6 }}>
                    <ArtifactRenderer artifact={parseArtifact(msg.artifact)} />
                  </div>
                </div>
              )}

              {/* Completed pipeline steps */}
              {msg.state === "completed" && msg.steps && msg.mode === "pipeline" && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  {msg.steps.filter((s) => s.artifact).map((step, i) => (
                    <details key={i} style={{ border: `1px solid #ccc` }}>
                      <summary style={{ padding: "8px 12px", fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
                        Step {i + 1}: {step.label} — {step.agentName}
                      </summary>
                      <div style={{ padding: "8px 12px", borderTop: "1px solid #ccc", fontSize: "0.9rem", lineHeight: 1.5 }}>
                        <ArtifactRenderer artifact={parseArtifact(step.artifact!)} />
                      </div>
                    </details>
                  ))}
                </div>
              )}

              {/* Tx links */}
              {msg.steps?.some((s) => s.escrowTxHash || s.settlementTxHash) && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  {msg.steps.filter((s) => s.escrowTxHash).map((s, i) => (
                    <a key={`e${i}`} href={`${SOLANA_EXPLORER}/${s.escrowTxHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.6rem", textDecoration: "none" }}>
                      STEP {i + 1} ESCROW: {s.escrowTxHash!.slice(0, 16)}...
                    </a>
                  ))}
                  {msg.steps.filter((s) => s.settlementTxHash).map((s, i) => (
                    <a key={`s${i}`} href={`${SOLANA_EXPLORER}/${s.settlementTxHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.6rem", textDecoration: "none" }}>
                      STEP {i + 1} SETTLEMENT: {s.settlementTxHash!.slice(0, 16)}...
                    </a>
                  ))}
                </div>
              )}

              <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.55rem", display: "block", marginTop: 8 }}>{msg.timestamp}</span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ═══ File indicator ═══ */}
      {fileName && (
        <div style={{ padding: "6px 30px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: DS.fontMono, fontSize: "0.65rem", fontWeight: 700, backgroundColor: "#d5d0c8", padding: "2px 8px" }}>{fileName}</span>
          <button onClick={() => { setFileContext(null); setFileName(null); }} className="ds-error-text" style={{ fontFamily: DS.fontMono, fontSize: "0.6rem", background: "none", border: "none", cursor: "pointer" }}>REMOVE</button>
        </div>
      )}

      {/* ═══ Input Bar ═══ */}
      <div style={{ borderTop: `1px solid ${DS.border}`, padding: "16px 30px", display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ flexShrink: 0 }}>
          <FileUpload disabled={isProcessing} onFileContent={(content, name) => { setFileContext(content); setFileName(name); }} />
        </div>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          disabled={isProcessing}
          placeholder={fileName ? `Ask about ${fileName}...` : "Tell your Twin what to do..."}
          aria-label="Message your AI Twin"
          style={{ flex: 1, padding: "12px 16px", fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, border: `1px solid ${DS.border}`, backgroundColor: "transparent", outline: "none", color: DS.text, opacity: isProcessing ? 0.5 : 1 }}
        />
        <button onClick={handleSend} disabled={!input.trim() || isProcessing} className="mp-white-text" style={{ ...btnDark, opacity: !input.trim() || isProcessing ? 0.4 : 1, cursor: !input.trim() || isProcessing ? "not-allowed" : "pointer" }} aria-label={isProcessing ? "Processing" : "Send message"}>
          {isProcessing ? "WORKING..." : "SEND"}
        </button>
      </div>
    </div>
  );
}
