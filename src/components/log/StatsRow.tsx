"use client";

import { useLogStore } from "@/store/logStore";

export default function StatsRow() {
  const { tasks } = useLogStore();

  const total = tasks.length;
  const successful = tasks.filter((t) => t.state === "COMPLETED").length;
  const failed = tasks.filter((t) => t.state === "FAILED").length;
  const cancelled = tasks.filter((t) => t.state === "CANCELLED").length;
  const totalUsdc = tasks
    .reduce((sum, t) => sum + parseFloat(t.usdcSpent), 0)
    .toFixed(2);
  const successRate = total > 0 ? ((successful / total) * 100).toFixed(0) : "—";
  const avgDuration =
    total > 0
      ? (
          tasks.reduce((sum, t) => sum + parseFloat(t.duration), 0) / total
        ).toFixed(1)
      : "—";

  const stats = [
    { label: "Total Tasks", value: total.toString(), color: "text-off-white" },
    { label: "Completed", value: successful.toString(), color: "text-accent" },
    { label: "Failed", value: failed.toString(), color: "text-red-400" },
    { label: "Cancelled", value: cancelled.toString(), color: "text-yellow-400" },
    { label: "USDC Spent", value: `${totalUsdc}`, color: "text-accent" },
    { label: "Success Rate", value: successRate === "—" ? "—" : `${successRate}%`, color: "text-off-white" },
  ];

  // Mini bar chart: last 10 tasks success/fail
  const recentTasks = tasks.slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-6 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="border border-forest-deep/60 bg-forest-deep/20 p-4 rounded-lg flex flex-col gap-2"
          >
            <span className="font-mono text-[9px] text-muted uppercase tracking-wider">
              {s.label}
            </span>
            <span className={`font-display text-xl uppercase ${s.color}`}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Mini activity bar chart */}
      {recentTasks.length > 0 && (
        <div className="border border-forest-deep/60 bg-forest-deep/20 p-4 rounded-lg">
          <span className="font-mono text-[9px] text-muted uppercase tracking-wider block mb-3">
            Recent Activity
          </span>
          <div className="flex items-end gap-1 h-12">
            {recentTasks.map((task) => {
              const dur = parseFloat(task.duration) || 1;
              const heightPct = Math.min(100, (dur / 8) * 100);
              const color =
                task.state === "COMPLETED"
                  ? "bg-accent"
                  : task.state === "FAILED"
                  ? "bg-red-500"
                  : "bg-yellow-500";
              return (
                <div
                  key={task.id}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div
                    className={`w-full ${color} opacity-40 hover:opacity-100 transition-opacity cursor-pointer rounded-sm`}
                    style={{ height: `${heightPct}%`, minHeight: "4px" }}
                    title={`${task.counterpartAgent} — ${task.capability} — ${task.duration}`}
                  />
                </div>
              );
            })}
            {/* Fill empty slots */}
            {Array.from({ length: Math.max(0, 10 - recentTasks.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="flex-1">
                <div className="w-full bg-forest-deep/40 h-1" />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-mono text-[8px] text-muted">Latest</span>
            <span className="font-mono text-[8px] text-muted">Oldest</span>
          </div>
        </div>
      )}
    </div>
  );
}
