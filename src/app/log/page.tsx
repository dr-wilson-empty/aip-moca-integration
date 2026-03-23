"use client";

import StatsRow from "@/components/log/StatsRow";
import TaskTable from "@/components/log/TaskTable";
import MonoLabel from "@/components/ui/MonoLabel";

export default function LogPage() {
  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12">
      <div className="mb-8 border-b border-forest-deep/40 pb-6 flex items-end justify-between">
        <div>
          <MonoLabel className="mb-2">04 // Transaction Log</MonoLabel>
          <h2 className="font-display text-3xl text-off-white uppercase tracking-tight">
            Audit Trail
          </h2>
        </div>
        <p className="font-mono text-xs text-muted max-w-xs text-right">
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
