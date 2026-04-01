"use client";

import { useState, useEffect } from "react";

interface LeaderboardUser {
  rank: number;
  address: string;
  tasks: number;
  spent: string;
}

function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-400 text-lg">1</span>;
  if (rank === 2) return <span className="text-gray-300 text-lg">2</span>;
  if (rank === 3) return <span className="text-amber-600 text-lg">3</span>;
  return <span className="font-mono text-sm text-muted">{rank}</span>;
}

export default function LeaderboardPage() {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12">
      <div className="mb-10 text-center">
        <span className="font-mono text-xs text-muted uppercase tracking-wider">Top Users</span>
        <h2 className="font-display text-3xl text-mint uppercase tracking-tight mt-1">Leaderboard</h2>
        <p className="font-mono text-sm text-muted mt-2">
          Most active agent users ranked by completed tasks.
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        {loading ? (
          <p className="font-mono text-sm text-muted text-center animate-pulse">Loading...</p>
        ) : users.length === 0 ? (
          <div className="border border-forest-deep/40 rounded-xl p-10 text-center">
            <p className="font-mono text-sm text-muted">No completed tasks yet. Be the first!</p>
          </div>
        ) : (
          <div className="border border-mint/10 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[60px_1fr_100px_120px] gap-4 px-6 py-3 bg-forest-deep/40 border-b border-forest-deep/60">
              <span className="font-mono text-xs text-muted uppercase">Rank</span>
              <span className="font-mono text-xs text-muted uppercase">Wallet</span>
              <span className="font-mono text-xs text-muted uppercase text-right">Tasks</span>
              <span className="font-mono text-xs text-muted uppercase text-right">USDC Spent</span>
            </div>

            {/* Rows */}
            {users.map((user) => (
              <div
                key={user.address}
                className={`grid grid-cols-[60px_1fr_100px_120px] gap-4 px-6 py-4 border-b border-forest-deep/20 last:border-0 ${
                  user.rank <= 3 ? "bg-forest-deep/10" : ""
                }`}
              >
                <div className="flex items-center justify-center">
                  <Medal rank={user.rank} />
                </div>
                <div className="flex items-center">
                  <span className="font-mono text-sm text-mint truncate">
                    {user.address.slice(0, 6)}...{user.address.slice(-4)}
                  </span>
                </div>
                <div className="flex items-center justify-end">
                  <span className="font-display text-sm text-off-white">{user.tasks}</span>
                </div>
                <div className="flex items-center justify-end">
                  <span className="font-mono text-sm text-accent">{user.spent} USDC</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
