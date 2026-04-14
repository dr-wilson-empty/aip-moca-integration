"use client";

import { useLogStore } from "@/store/logStore";

const DS = {
  bg: "#e6e5e0",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  green: "#7cb342",
  error: "#c62828",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

export default function StatsRow() {
  const { tasks } = useLogStore();

  const total = tasks.length;
  const successful = tasks.filter((t) => t.state === "COMPLETED").length;
  const failed = tasks.filter((t) => t.state === "FAILED").length;
  const cancelled = tasks.filter((t) => t.state === "CANCELLED").length;
  const totalUsdc = tasks.reduce((sum, t) => sum + parseFloat(t.usdcSpent), 0).toFixed(2);
  const successRate = total > 0 ? ((successful / total) * 100).toFixed(0) : "—";

  const stats = [
    { label: "TOTAL", value: total.toString() },
    { label: "COMPLETED", value: successful.toString(), color: DS.green },
    { label: "FAILED", value: failed.toString(), color: DS.error },
    { label: "CANCELLED", value: cancelled.toString(), color: "#b8913a" },
    { label: "USDC SPENT", value: totalUsdc, color: DS.green },
    { label: "SUCCESS RATE", value: successRate === "—" ? "—" : `${successRate}%` },
  ];

  const recentTasks = tasks.slice(0, 10);

  return (
    <div>
      {/* Stats band */}
      <div style={{ display: "flex", borderBottom: `1px solid ${DS.border}` }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{ flex: 1, padding: "16px 20px", borderRight: i < stats.length - 1 ? `1px solid ${DS.border}` : "none", textAlign: "center" }}>
            <span style={{ fontFamily: DS.fontPrimary, fontSize: "1.8rem", fontWeight: 400, display: "block", color: s.color || DS.text }}>{s.value}</span>
            <span style={{ fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: DS.textMuted }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Activity bar */}
      {recentTasks.length > 0 && (
        <div style={{ padding: "16px 30px", borderBottom: `1px solid ${DS.border}` }}>
          <span style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: DS.textMuted, display: "block", marginBottom: 10 }}>RECENT ACTIVITY</span>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 48 }}>
            {recentTasks.map((task) => {
              const dur = parseFloat(task.duration) || 1;
              const heightPct = Math.min(100, (dur / 8) * 100);
              const color = task.state === "COMPLETED" ? DS.green : task.state === "FAILED" ? DS.error : "#b8913a";
              return (
                <div key={task.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: "100%", backgroundColor: color, height: `${heightPct}%`, minHeight: 4, opacity: 0.6, transition: "opacity 0.15s", cursor: "pointer" }} title={`${task.counterpartAgent} — ${task.capability} — ${task.duration}`} onMouseEnter={(e) => e.currentTarget.style.opacity = "1"} onMouseLeave={(e) => e.currentTarget.style.opacity = "0.6"} />
                </div>
              );
            })}
            {Array.from({ length: Math.max(0, 10 - recentTasks.length) }).map((_, i) => (
              <div key={`empty-${i}`} style={{ flex: 1 }}>
                <div style={{ width: "100%", backgroundColor: "#ccc", height: 4 }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontFamily: DS.fontMono, fontSize: "0.65rem", fontWeight: 700, color: DS.textMuted }}>LATEST</span>
            <span style={{ fontFamily: DS.fontMono, fontSize: "0.65rem", fontWeight: 700, color: DS.textMuted }}>OLDEST</span>
          </div>
        </div>
      )}
    </div>
  );
}
