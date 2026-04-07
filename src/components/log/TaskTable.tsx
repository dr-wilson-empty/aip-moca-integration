"use client";

import { useState } from "react";
import { useLogStore } from "@/store/logStore";
import TaskDetailModal from "./TaskDetailModal";
import MonoLabel from "@/components/ui/MonoLabel";
import type { Task, TaskState } from "@/types/aip";

function StateBadge({ state }: { state: TaskState }) {
  const map: Record<TaskState, string> = {
    COMPLETED: "border-accent/40 text-accent bg-accent/10",
    FAILED: "border-red-800/40 text-red-400 bg-red-900/10",
    CANCELLED: "border-yellow-800/40 text-yellow-400 bg-yellow-900/10",
    SUBMITTED: "border-blue-800/40 text-blue-400 bg-blue-900/10",
    WORKING: "border-blue-800/40 text-blue-400 bg-blue-900/10",
  };
  return (
    <span className={`font-mono text-xs uppercase px-2 py-0.5 border rounded ${map[state]}`}>
      {state}
    </span>
  );
}

function AgentBadge() {
  return (
    <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 border border-purple-800/40 text-purple-400 bg-purple-900/10 rounded">
      Agent
    </span>
  );
}

function ChainBadge({ chainId }: { chainId: string }) {
  return (
    <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 border border-cyan-800/40 text-cyan-400 bg-cyan-900/10 rounded" title={chainId}>
      Chain
    </span>
  );
}

type SourceFilter = "ALL" | "MY" | "AGENT";

const SOURCE_OPTIONS: Array<{ label: string; value: SourceFilter }> = [
  { label: "All Tasks", value: "ALL" },
  { label: "My Tasks", value: "MY" },
  { label: "Agent Tasks", value: "AGENT" },
];

const STATE_OPTIONS: Array<{ label: string; value: TaskState | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Failed", value: "FAILED" },
  { label: "Cancelled", value: "CANCELLED" },
];

/** Group tasks by chainId for visual grouping */
function groupByChain(tasks: Task[]): Array<{ chainId?: string; tasks: Task[] }> {
  const groups: Array<{ chainId?: string; tasks: Task[] }> = [];
  const chainMap = new Map<string, Task[]>();
  const standalone: Task[] = [];

  for (const t of tasks) {
    if (t.chainId) {
      const existing = chainMap.get(t.chainId);
      if (existing) existing.push(t);
      else chainMap.set(t.chainId, [t]);
    } else {
      standalone.push(t);
    }
  }

  // Interleave: chain groups appear at the position of their first task
  const seen = new Set<string>();
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
    // Source filter
    if (sourceFilter === "AGENT" && !t.isAgentTask) return false;
    if (sourceFilter === "MY" && t.isAgentTask) return false;
    // State filter
    if (stateFilter !== "ALL" && t.state !== stateFilter) return false;
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !t.id.toLowerCase().includes(q) &&
        !t.counterpartAgent.toLowerCase().includes(q) &&
        !t.capability.toLowerCase().includes(q) &&
        !t.input.toLowerCase().includes(q) &&
        !(t.chainId || "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const groups = sourceFilter === "AGENT" ? groupByChain(filtered) : filtered.map((t) => ({ chainId: t.chainId, tasks: [t] }));

  const agentCount = tasks.filter((t) => t.isAgentTask).length;
  const myCount = tasks.filter((t) => !t.isAgentTask).length;

  return (
    <>
      {/* Source tabs */}
      <div className="flex items-center gap-6 mb-0">
        <div className="flex gap-0">
          {SOURCE_OPTIONS.map((opt) => {
            const count = opt.value === "ALL" ? tasks.length : opt.value === "AGENT" ? agentCount : myCount;
            return (
              <button
                key={opt.value}
                onClick={() => setSourceFilter(opt.value)}
                className={`font-mono text-xs uppercase tracking-wider px-3 py-2 border transition-colors ${
                  sourceFilter === opt.value
                    ? "border-mint/40 text-mint bg-mint/10"
                    : "border-forest-deep/60 text-muted hover:text-off-white"
                } ${opt.value === "ALL" ? "rounded-l-md" : ""} ${opt.value === "AGENT" ? "rounded-r-md" : ""} ${opt.value !== "ALL" ? "border-l-0" : ""}`}
              >
                {opt.label} ({count})
              </button>
            );
          })}
        </div>

        {/* State filter */}
        <div className="flex gap-0">
          {STATE_OPTIONS.map((opt) => {
            const count =
              opt.value === "ALL"
                ? filtered.length
                : filtered.filter((t) => t.state === opt.value).length;
            return (
              <button
                key={opt.value}
                onClick={() => setStateFilter(opt.value)}
                className={`font-mono text-xs uppercase tracking-wider px-3 py-2 border transition-colors ${
                  stateFilter === opt.value
                    ? "border-accent/40 text-accent bg-accent/10"
                    : "border-forest-deep/60 text-muted hover:text-off-white"
                } ${opt.value === "ALL" ? "rounded-l-md" : ""} ${opt.value === "CANCELLED" ? "rounded-r-md" : ""} ${opt.value !== "ALL" ? "border-l-0" : ""}`}
              >
                {opt.label} ({count})
              </button>
            );
          })}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          className="ml-auto bg-forest-deep/30 border border-forest-deep/60 px-3 py-2 rounded-lg font-mono text-sm text-off-white placeholder-muted/50 outline-none focus:border-accent/60 transition-colors w-64"
        />
      </div>

      {/* Table */}
      <div className="border border-forest-deep/60 rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_80px_80px_70px_80px] gap-0 border-b border-forest-deep/60 bg-forest-deep/40 px-4 py-2">
          {["Task ID", "Agent", "Capability", "Started", "Duration", "State", "USDC", ""].map(
            (h) => (
              <MonoLabel key={h} className="py-1">{h}</MonoLabel>
            )
          )}
        </div>

        {/* Rows */}
        {filtered.length === 0 && (
          <div className="px-4 py-12 flex flex-col items-center gap-3 text-center">
            <div className="w-10 h-10 border border-mint/20 rounded-full flex items-center justify-center">
              <span className="text-mint text-sm">⬡</span>
            </div>
            {tasks.length === 0 ? (
              <>
                <p className="font-mono text-sm text-mint">No tasks yet</p>
                <p className="font-mono text-xs text-muted">
                  Start a task from the Dashboard to see it here.
                </p>
              </>
            ) : (
              <p className="font-mono text-sm text-muted">No tasks match the current filter.</p>
            )}
          </div>
        )}

        {groups.map((group, gi) => (
          <div key={gi}>
            {/* Chain group header */}
            {group.chainId && group.tasks.length > 1 && (
              <div className="px-4 py-1.5 bg-cyan-900/10 border-b border-cyan-800/20 flex items-center gap-2">
                <ChainBadge chainId={group.chainId} />
                <span className="font-mono text-[10px] text-cyan-400">
                  {group.chainId} — {group.tasks.length} steps
                </span>
                <span className="font-mono text-[10px] text-muted ml-auto">
                  Total: {group.tasks.reduce((sum, t) => sum + parseFloat(t.usdcSpent || "0"), 0).toFixed(2)} USDC
                </span>
              </div>
            )}
            {group.tasks.map((task) => (
              <div
                key={task.id}
                className={`grid grid-cols-[1fr_1fr_1fr_1fr_80px_80px_70px_80px] gap-0 border-b border-forest-deep/30 px-4 py-3 hover:bg-forest-deep/30 transition-colors items-center ${group.chainId ? "pl-6" : ""}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-sm text-accent truncate">{task.id}</span>
                  {task.isAgentTask && <AgentBadge />}
                </div>
                <span className="font-mono text-sm text-off-white">{task.counterpartAgent}</span>
                <span className="font-mono text-sm text-muted truncate">{task.capability}</span>
                <span className="font-mono text-sm text-muted">
                  {new Date(task.startedAt).toTimeString().slice(0, 8)}
                </span>
                <span className="font-mono text-sm text-body">{task.duration}</span>
                <StateBadge state={task.state} />
                <span className="font-mono text-sm text-yellow-400">{task.usdcSpent}</span>
                <button
                  onClick={() => setSelected(task)}
                  className="font-mono text-xs text-muted uppercase hover:text-accent transition-colors text-right"
                >
                  Detail →
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {selected && (
        <TaskDetailModal task={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
