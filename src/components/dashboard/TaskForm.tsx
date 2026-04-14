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
import type { Task } from "@/types/aip";

const DS = {
  bg: "#e6e5e0",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  dark: "#222222",
  green: "#7cb342",
  error: "#c62828",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

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

  useTaskSSE(activeTaskId);

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
      <div
        style={{
          borderBottom: `1px solid ${DS.border}`,
          padding: "60px 30px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: DS.fontMono,
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: DS.textMuted,
            marginBottom: 20,
          }}
        >
          No agent selected yet
        </p>
        <button
          onClick={() => router.push("/marketplace")}
          style={{
            padding: "12px 30px",
            fontFamily: DS.fontMono,
            fontSize: "0.7rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            backgroundColor: DS.dark,
            color: DS.bg,
            border: "none",
            cursor: "pointer",
          }}
          className="mp-white-text"
        >
          Select an Agent from Marketplace
        </button>
      </div>
    );
  }

  const bandStyle: React.CSSProperties = {
    padding: "14px 30px",
    fontFamily: DS.fontMono,
    fontSize: "0.8rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    borderBottom: `1px solid ${DS.border}`,
    color: DS.text,
  };

  return (
    <div>
      {/* Header band */}
      <div
        style={{
          ...bandStyle,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "#d5d0c8",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span>TASK CONFIGURATION</span>
          <span style={{ color: DS.textMuted, fontWeight: 400 }}>
            Target: {counterpartCard.name}
          </span>
        </div>
        {(taskState === "COMPLETED" || taskState === "FAILED") && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleNewTask}
              style={{
                padding: "6px 16px",
                fontFamily: DS.fontMono,
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                backgroundColor: "transparent",
                border: `1px solid ${DS.border}`,
                cursor: "pointer",
                color: DS.text,
              }}
            >
              New Task
            </button>
            <button
              onClick={() => router.push("/log")}
              style={{
                padding: "6px 16px",
                fontFamily: DS.fontMono,
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                backgroundColor: DS.dark,
                border: "none",
                cursor: "pointer",
                color: DS.bg,
              }}
              className="mp-white-text"
            >
              View Tx Log
            </button>
          </div>
        )}
      </div>

      {/* Capability band */}
      <div style={{ ...bandStyle, display: "flex", alignItems: "center", gap: 20 }}>
        <span style={{ whiteSpace: "nowrap" }}>CAPABILITY</span>
        <select
          value={selectedCapId}
          onChange={(e) => { setSelectedCapId(e.target.value); setInput(""); }}
          disabled={isRunning || taskState === "COMPLETED" || taskState === "FAILED"}
          style={{
            flex: 1,
            fontFamily: DS.fontMono,
            fontSize: "0.7rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            backgroundColor: "transparent",
            border: "none",
            outline: "none",
            color: DS.text,
            cursor: "pointer",
            appearance: "none",
            WebkitAppearance: "none",
            opacity: isRunning || taskState === "COMPLETED" || taskState === "FAILED" ? 0.5 : 1,
          }}
        >
          {counterpartCard.capabilities.map((cap) => (
            <option key={cap.id} value={cap.id}>
              {cap.description} — {cap.pricing.amount} {cap.pricing.token}
            </option>
          ))}
        </select>
      </div>

      {/* Presets */}
      {presets.length > 0 && !isRunning && taskState !== "COMPLETED" && taskState !== "FAILED" && (
        <div style={{ ...bandStyle, padding: "16px 30px" }}>
          <span style={{ display: "block", marginBottom: 10, color: DS.textMuted }}>
            QUICK START
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {presets.map((preset) => (
              <button
                key={preset}
                onClick={() => setInput(preset)}
                style={{
                  textAlign: "left",
                  fontFamily: DS.fontMono,
                  fontSize: "0.75rem",
                  padding: "8px 14px",
                  border: `1px solid ${input === preset ? DS.border : "#ccc"}`,
                  backgroundColor: input === preset ? "#d5d0c8" : "transparent",
                  cursor: "pointer",
                  color: DS.text,
                  fontWeight: input === preset ? 700 : 400,
                  textTransform: "none",
                  letterSpacing: "normal",
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ ...bandStyle, padding: "16px 30px" }}>
        <span style={{ display: "block", marginBottom: 10, color: DS.textMuted }}>
          {presets.length > 0 ? "OR TYPE YOUR OWN" : "TASK INPUT"}
        </span>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isRunning || taskState === "COMPLETED" || taskState === "FAILED"}
          placeholder={selectedCap ? `e.g. "${presets[0] ?? `Use ${selectedCap.id} to...`}"` : "Describe the task..."}
          rows={2}
          style={{
            width: "100%",
            fontFamily: DS.fontMono,
            fontSize: "0.85rem",
            padding: "12px 14px",
            border: `1px solid ${DS.border}`,
            backgroundColor: "transparent",
            outline: "none",
            resize: "none",
            color: DS.text,
            opacity: isRunning || taskState === "COMPLETED" || taskState === "FAILED" ? 0.5 : 1,
          }}
        />
      </div>

      {/* Payment error */}
      {paymentError && (
        <div
          style={{
            ...bandStyle,
            backgroundColor: "#f5e6e6",
            color: DS.error,
          }}
          className="ds-error-text"
        >
          X402 PAYMENT FAILED: {paymentError.slice(0, 80)}
        </div>
      )}

      {/* Action band */}
      <div
        style={{
          ...bandStyle,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <span style={{ color: DS.textMuted }}>ESTIMATED COST</span>
          <p
            style={{
              fontFamily: DS.fontPrimary,
              fontSize: "1.4rem",
              fontWeight: 400,
              marginTop: 4,
              color: DS.text,
            }}
          >
            {selectedCap?.pricing.amount ?? "—"}{" "}
            <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>USDC</span>
          </p>
        </div>
        {taskState !== "COMPLETED" && taskState !== "FAILED" && (
          <button
            onClick={handleStart}
            disabled={isRunning || !input.trim()}
            style={{
              padding: "14px 32px",
              fontFamily: DS.fontMono,
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              backgroundColor: isRunning || !input.trim() ? "#999" : DS.dark,
              color: DS.bg,
              border: "none",
              cursor: isRunning || !input.trim() ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
            className="mp-white-text"
          >
            {isRunning ? "RUNNING..." : "START TASK & LOCK ESCROW"}
          </button>
        )}
      </div>
    </div>
  );
}
