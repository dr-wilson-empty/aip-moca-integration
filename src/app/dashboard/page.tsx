"use client";

import TaskForm from "@/components/dashboard/TaskForm";
import ProtocolFlow from "@/components/dashboard/ProtocolFlow";
import LiveLog from "@/components/dashboard/LiveLog";
import MonoLabel from "@/components/ui/MonoLabel";

export default function DashboardPage() {
  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12">
      <div className="mb-8 border-b border-forest-deep/40 pb-6 flex items-end justify-between">
        <div>
          <MonoLabel className="mb-2">03 // Task Dashboard</MonoLabel>
          <h2 className="font-display text-3xl text-off-white uppercase tracking-tight">
            Protocol Demo
          </h2>
        </div>
        <p className="font-mono text-xs text-muted max-w-xs text-right">
          Start a task and observe the full AIP protocol lifecycle in real time.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <TaskForm />
        <ProtocolFlow />
        <LiveLog />
      </div>
    </div>
  );
}
