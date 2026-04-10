"use client";

import { useEffect } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useLogStore } from "@/store/logStore";
import { signedFetch } from "@/lib/auth/signed-fetch";
import StatsRow from "@/components/log/StatsRow";
import TaskTable from "@/components/log/TaskTable";

export default function LogPage() {
  const { address } = useWalletStore();
  const { loaded, loadFromServer } = useLogStore();

  // Load history from Supabase on mount
  useEffect(() => {
    if (address && !loaded) {
      loadFromServer(address);
    }
  }, [address, loaded, loadFromServer]);

  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12">
      <div className="mb-8 border-b border-mint/20 pb-6 flex items-end justify-between">
        <div>
          <span className="font-mono text-xs text-muted uppercase">Transaction Log</span>
          <h2 className="font-display text-3xl text-mint uppercase tracking-tight mt-1">
            History
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <p className="font-mono text-sm text-muted max-w-xs text-right">
            Full history of all agent tasks, payments, and state transitions.
          </p>
          {address && (
            <button
              onClick={async () => {
                const res = await signedFetch(`/api/tasks/history?address=${address}&format=csv`);
                if (!res.ok) return;
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `task-history-${address.slice(0, 8)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="font-mono text-[10px] text-mint border border-mint/30 px-3 py-1.5 rounded-lg hover:bg-mint/10 transition-colors whitespace-nowrap"
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <StatsRow />
        <TaskTable />
      </div>
    </div>
  );
}
