"use client";

import { useState, useEffect } from "react";

interface Analytics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalRevenue: string;
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
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="font-mono text-sm text-muted hover:text-mint transition-colors"
      >
        {open ? "Hide Analytics" : "Show Analytics"}
      </button>

      {open && (
        <div className="mt-2 border border-forest-deep/30 rounded-lg p-3 bg-forest-deep/10">
          {!data ? (
            <span className="font-mono text-sm text-muted animate-pulse">Loading...</span>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center">
                  <span className="font-display text-sm text-mint block">{data.completedTasks}</span>
                  <span className="font-mono text-xs text-muted">Completed</span>
                </div>
                <div className="text-center">
                  <span className="font-display text-sm text-red-400 block">{data.failedTasks}</span>
                  <span className="font-mono text-xs text-muted">Failed</span>
                </div>
                <div className="text-center">
                  <span className="font-display text-sm text-accent block">{data.totalRevenue}</span>
                  <span className="font-mono text-xs text-muted">USDC Earned</span>
                </div>
                <div className="text-center">
                  <span className="font-display text-sm text-yellow-400 block">
                    {parseFloat(data.avgRating) > 0 ? `${data.avgRating}★` : "—"}
                  </span>
                  <span className="font-mono text-xs text-muted">{data.ratingCount} ratings</span>
                </div>
              </div>

              {/* Activity bar chart (last 7 days) */}
              {data.dailyActivity.length > 0 && (
                <div>
                  <span className="font-mono text-xs text-muted block mb-1">Last 7 days</span>
                  <div className="flex items-end gap-1 h-10">
                    {data.dailyActivity.map((d) => {
                      const max = Math.max(...data.dailyActivity.map((x) => x.count), 1);
                      const h = d.count > 0 ? Math.max((d.count / max) * 100, 10) : 4;
                      return (
                        <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
                          <div
                            className={`w-full rounded-sm transition-all ${d.count > 0 ? "bg-accent/60" : "bg-forest-deep/40"}`}
                            style={{ height: `${h}%` }}
                            title={`${d.date}: ${d.count} tasks`}
                          />
                          <span className="font-mono text-xs text-muted/40">
                            {d.date.slice(8)}
                          </span>
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
