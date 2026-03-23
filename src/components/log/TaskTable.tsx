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
    <span className={`font-mono text-[9px] uppercase px-2 py-0.5 border ${map[state]}`}>
      {state}
    </span>
  );
}

const FILTER_OPTIONS: Array<{ label: string; value: TaskState | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Failed", value: "FAILED" },
  { label: "Cancelled", value: "CANCELLED" },
];

export default function TaskTable() {
  const { tasks } = useLogStore();
  const [selected, setSelected] = useState<Task | null>(null);
  const [filter, setFilter] = useState<TaskState | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const filtered = tasks.filter((t) => {
    const matchesFilter = filter === "ALL" || t.state === filter;
    const matchesSearch =
      !search.trim() ||
      t.id.toLowerCase().includes(search.toLowerCase()) ||
      t.counterpartAgent.toLowerCase().includes(search.toLowerCase()) ||
      t.capability.toLowerCase().includes(search.toLowerCase()) ||
      t.input.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <>
      {/* Filter bar */}
      <div className="flex items-center justify-between gap-4 mb-0">
        <div className="flex gap-0">
          {FILTER_OPTIONS.map((opt) => {
            const count =
              opt.value === "ALL"
                ? tasks.length
                : tasks.filter((t) => t.state === opt.value).length;
            return (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`font-mono text-[9px] uppercase tracking-wider px-3 py-2 border transition-colors ${
                  filter === opt.value
                    ? "border-accent/40 text-accent bg-accent/10"
                    : "border-forest-deep/60 text-muted hover:text-off-white"
                } ${opt.value !== "ALL" ? "border-l-0" : ""}`}
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
          className="bg-forest-deep/30 border border-forest-deep/60 px-3 py-2 font-mono text-[10px] text-off-white placeholder-muted/50 outline-none focus:border-accent/60 transition-colors w-64"
        />
      </div>

      {/* Table */}
      <div className="border border-forest-deep/60 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_80px_80px_70px_60px] gap-0 border-b border-forest-deep/60 bg-forest-deep/40 px-4 py-2">
          {["Task ID", "Agent", "Capability", "Started", "Duration", "State", "USDC", ""].map(
            (h) => (
              <MonoLabel key={h} className="py-1">{h}</MonoLabel>
            )
          )}
        </div>

        {/* Rows */}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center font-mono text-xs text-muted">
            {tasks.length === 0 ? "No tasks yet." : "No tasks match the current filter."}
          </div>
        )}
        {filtered.map((task) => (
          <div
            key={task.id}
            className="grid grid-cols-[1fr_1fr_1fr_1fr_80px_80px_70px_60px] gap-0 border-b border-forest-deep/30 px-4 py-3 hover:bg-forest-deep/30 transition-colors items-center"
          >
            <span className="font-mono text-[10px] text-accent">{task.id}</span>
            <span className="font-mono text-[10px] text-off-white">{task.counterpartAgent}</span>
            <span className="font-mono text-[10px] text-muted">{task.capability}</span>
            <span className="font-mono text-[10px] text-muted">
              {new Date(task.startedAt).toLocaleTimeString()}
            </span>
            <span className="font-mono text-[10px] text-body">{task.duration}</span>
            <StateBadge state={task.state} />
            <span className="font-mono text-[10px] text-yellow-400">{task.usdcSpent}</span>
            <button
              onClick={() => setSelected(task)}
              className="font-mono text-[9px] text-muted uppercase hover:text-accent transition-colors text-right"
            >
              Detail →
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <TaskDetailModal task={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
