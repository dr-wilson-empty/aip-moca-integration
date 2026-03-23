"use client";

import TaskForm from "@/components/dashboard/TaskForm";
import ProtocolFlow from "@/components/dashboard/ProtocolFlow";
import LiveLog from "@/components/dashboard/LiveLog";

export default function DashboardPage() {
  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12">
      <div className="mb-8 border-b border-mint/20 pb-6 flex items-end justify-between">
        <div>
          <span className="font-mono text-xs text-muted uppercase">Task Dashboard</span>
          <h2 className="font-display text-3xl text-mint uppercase tracking-tight mt-1">
            Protocol Demo
          </h2>
        </div>
        <p className="font-mono text-sm text-muted max-w-xs text-right">
          Start a task and observe the full AIP protocol lifecycle.
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
