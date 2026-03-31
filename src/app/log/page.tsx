"use client";

import { useEffect } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useLogStore } from "@/store/logStore";
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
        <p className="font-mono text-sm text-muted max-w-xs text-right">
          Full history of all agent tasks, payments, and state transitions.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <StatsRow />
        <TaskTable />
      </div>
    </div>
  );
}
