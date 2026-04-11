"use client";

import { useState } from "react";
import { useLogStore } from "@/store/logStore";
import TaskDetailModal from "./TaskDetailModal";
import type { Task, TaskState } from "@/types/aip";

const DS = {
  bg: "#e6e5e0",
  bgHover: "#d9d8d3",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  green: "#7cb342",
  error: "#c62828",
  cyan: "#4dd0e1",
  purple: "#7c3aed",
  white: "#ffffff",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

const STATE_COLORS: Record<TaskState, { bg: string }> = {
  COMPLETED: { bg: DS.green },
  FAILED: { bg: DS.error },
  CANCELLED: { bg: "#b8913a" },
  SUBMITTED: { bg: "#3b6fa0" },
  WORKING: { bg: "#3b6fa0" },
};

type SourceFilter = "ALL" | "MY" | "AGENT";

function groupByChain(tasks: Task[]): Array<{ chainId?: string; tasks: Task[] }> {
  const groups: Array<{ chainId?: string; tasks: Task[] }> = [];
  const chainMap = new Map<string, Task[]>();
  const seen = new Set<string>();

  for (const t of tasks) {
    if (t.chainId) {
      const existing = chainMap.get(t.chainId);
      if (existing) existing.push(t);
      else chainMap.set(t.chainId, [t]);
    }
  }

  for (const t of tasks) {
    if (t.chainId && !seen.has(t.chainId)) {
      seen.add(t.chainId);
      groups.push({ chainId: t.chainId, tasks: chainMap.get(t.chainId)! });
    } else if (!t.chainId) {
      groups.push({ tasks: [t] });
    }
  }
  return groups;
}

export default function TaskTable() {
  const { tasks } = useLogStore();
  const [selected, setSelected] = useState<Task | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [stateFilter, setStateFilter] = useState<TaskState | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const filtered = tasks.filter((t) => {
    if (sourceFilter === "AGENT" && !t.isAgentTask) return false;
    if (sourceFilter === "MY" && t.isAgentTask) return false;
    if (stateFilter !== "ALL" && t.state !== stateFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!t.id.toLowerCase().includes(q) && !t.counterpartAgent.toLowerCase().includes(q) && !t.capability.toLowerCase().includes(q) && !t.input.toLowerCase().includes(q) && !(t.chainId || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const groups = sourceFilter === "AGENT" ? groupByChain(filtered) : filtered.map((t) => ({ chainId: t.chainId, tasks: [t] }));
  const agentCount = tasks.filter((t) => t.isAgentTask).length;
  const myCount = tasks.filter((t) => !t.isAgentTask).length;

  const bandLabel: React.CSSProperties = { fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" };

  return (
    <>
      {/* Filter band */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${DS.border}`, padding: "0 30px" }}>
        {/* Source tabs */}
        {(["ALL", "MY", "AGENT"] as SourceFilter[]).map((v) => {
          const count = v === "ALL" ? tasks.length : v === "AGENT" ? agentCount : myCount;
          const label = v === "ALL" ? "ALL TASKS" : v === "MY" ? "MY TASKS" : "AGENT TASKS";
          return (
            <button key={v} onClick={() => setSourceFilter(v)} style={{
              ...bandLabel, padding: "12px 16px", border: "none", cursor: "pointer", backgroundColor: "transparent",
              borderBottom: sourceFilter === v ? `3px solid ${DS.green}` : "3px solid transparent",
              color: sourceFilter === v ? DS.text : DS.textMuted,
            }}>
              {label} ({count})
            </button>
          );
        })}

        <div style={{ width: 1, height: 20, backgroundColor: "#ccc", margin: "0 12px" }} />

        {/* State tabs */}
        {(["ALL", "COMPLETED", "FAILED", "CANCELLED"] as Array<TaskState | "ALL">).map((v) => {
          const count = v === "ALL" ? filtered.length : filtered.filter((t) => t.state === v).length;
          return (
            <button key={v} onClick={() => setStateFilter(v)} style={{
              ...bandLabel, fontSize: "0.7rem", padding: "12px 12px", border: "none", cursor: "pointer", backgroundColor: "transparent",
              borderBottom: stateFilter === v ? `3px solid ${DS.text}` : "3px solid transparent",
              color: stateFilter === v ? DS.text : DS.textMuted,
            }}>
              {v} ({count})
            </button>
          );
        })}

        {/* Search */}
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SEARCH TASKS..." style={{
          marginLeft: "auto", fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
          padding: "10px 14px", border: `1px solid ${DS.border}`, backgroundColor: "transparent", outline: "none", color: DS.text, width: 240,
        }} />
      </div>

      {/* Table header */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.2fr 0.8fr 0.6fr 0.7fr 0.5fr 0.5fr", padding: "10px 30px", borderBottom: `1px solid ${DS.border}`, backgroundColor: "#d5d0c8" }}>
        {["TASK ID", "AGENT", "CAPABILITY", "STARTED", "DURATION", "STATE", "USDC", ""].map((h) => (
          <span key={h} style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      {filtered.length === 0 && (
        <div style={{ padding: "60px 30px", textAlign: "center" }}>
          {tasks.length === 0 ? (
            <>
              <p style={{ ...bandLabel, color: DS.textMuted, marginBottom: 8 }}>NO TASKS YET</p>
              <p style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, color: DS.textMuted }}>Start a task from the Dashboard to see it here.</p>
            </>
          ) : (
            <p style={{ ...bandLabel, color: DS.textMuted }}>NO TASKS MATCH THE CURRENT FILTER</p>
          )}
        </div>
      )}

      {groups.map((group, gi) => (
        <div key={gi}>
          {/* Chain header */}
          {group.chainId && group.tasks.length > 1 && (
            <div style={{ padding: "8px 30px", backgroundColor: "#dddcd7", borderBottom: `1px solid ${DS.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <span className="mp-white-text" style={{ fontSize: "0.65rem", padding: "2px 8px", backgroundColor: DS.cyan, fontFamily: DS.fontMono, fontWeight: 700, textTransform: "uppercase" }}>CHAIN</span>
              <span style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700 }}>{group.chainId} — {group.tasks.length} STEPS</span>
              <span style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, marginLeft: "auto" }}>TOTAL: {group.tasks.reduce((sum, t) => sum + parseFloat(t.usdcSpent || "0"), 0).toFixed(2)} USDC</span>
            </div>
          )}

          {group.tasks.map((task) => (
            <div key={task.id} style={{
              display: "grid", gridTemplateColumns: "1.5fr 1fr 1.2fr 0.8fr 0.6fr 0.7fr 0.5fr 0.5fr",
              padding: "12px 30px", paddingLeft: group.chainId ? 46 : 30,
              borderBottom: "1px solid #ccc", alignItems: "center",
              fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700,
              cursor: "pointer", transition: "background-color 0.1s",
            }} onClick={() => setSelected(task)} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = DS.bgHover} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.id}</span>
                {task.isAgentTask && <span className="mp-white-text" style={{ fontSize: "0.6rem", padding: "1px 6px", backgroundColor: DS.purple, flexShrink: 0 }}>AGENT</span>}
              </div>
              <span>{task.counterpartAgent}</span>
              <span style={{ color: DS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.capability}</span>
              <span style={{ color: DS.textMuted }}>{new Date(task.startedAt).toTimeString().slice(0, 8)}</span>
              <span>{task.duration}</span>
              <span className="mp-white-text" style={{ fontSize: "0.65rem", padding: "3px 8px", backgroundColor: STATE_COLORS[task.state]?.bg || DS.textMuted, display: "inline-block", width: "fit-content" }}>{task.state}</span>
              <span style={{ fontWeight: 700 }}>{task.usdcSpent}</span>
              <span style={{ color: DS.textMuted, textAlign: "right", fontSize: "0.75rem" }}>DETAIL</span>
            </div>
          ))}
        </div>
      ))}

      {selected && <TaskDetailModal task={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
