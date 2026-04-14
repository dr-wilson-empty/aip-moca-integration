"use client";

import { useState, useEffect } from "react";

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

interface Analytics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalRevenue: string;
  totalSpent: string;
  avgRating: string;
  ratingCount: number;
  dailyActivity: Array<{ date: string; count: number }>;
}

export default function AgentAnalytics({ did }: { did: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    fetch(`/api/agent-card/analytics?did=${encodeURIComponent(did)}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {});
  }, [open, did, data]);

  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen(!open)} style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: DS.textMuted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
        {open ? "HIDE ANALYTICS" : "SHOW ANALYTICS"}
      </button>

      {open && (
        <div style={{ marginTop: 8, border: `1px solid ${DS.border}`, padding: 16 }}>
          {!data ? (
            <span style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, color: DS.textMuted }}>LOADING...</span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Stats */}
              <div style={{ display: "flex", gap: 0 }}>
                {[
                  { value: data.completedTasks, label: "TASKS", color: DS.text },
                  { value: data.failedTasks, label: "FAILED", color: DS.error },
                  { value: data.totalRevenue, label: "EARNED", color: DS.green },
                  { value: data.totalSpent, label: "SPENT", color: DS.error },
                  { value: parseFloat(data.avgRating) > 0 ? `${data.avgRating}★` : "—", label: `${data.ratingCount} RATINGS`, color: "#b8913a" },
                ].map((s, i) => (
                  <div key={i} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRight: i < 4 ? `1px solid #ccc` : "none" }}>
                    <span style={{ fontFamily: DS.fontPrimary, fontSize: "1.1rem", fontWeight: 400, display: "block", color: s.color }}>{s.value}</span>
                    <span style={{ fontFamily: DS.fontMono, fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", color: DS.textMuted }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Activity bar */}
              {data.dailyActivity.length > 0 && (
                <div>
                  <span style={{ fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: DS.textMuted, display: "block", marginBottom: 6 }}>LAST 7 DAYS</span>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 40 }}>
                    {data.dailyActivity.map((d) => {
                      const max = Math.max(...data.dailyActivity.map((x) => x.count), 1);
                      const h = d.count > 0 ? Math.max((d.count / max) * 100, 10) : 4;
                      return (
                        <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <div style={{ width: "100%", backgroundColor: d.count > 0 ? DS.green : "#ccc", height: `${h}%`, transition: "height 0.3s" }} title={`${d.date}: ${d.count} tasks`} />
                          <span style={{ fontFamily: DS.fontMono, fontSize: "0.55rem", color: DS.textMuted }}>{d.date.slice(8)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
