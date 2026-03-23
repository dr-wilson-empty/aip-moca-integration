"use client";

import { useWalletStore } from "@/store/walletStore";
import { useAgentStore } from "@/store/agentStore";
import { useTaskStore } from "@/store/taskStore";

interface HealthItem {
  label: string;
  status: "active" | "idle" | "error";
}

export default function ProtocolHealth() {
  const { address, did } = useWalletStore();
  const { counterpartCard, counterpartVerified } = useAgentStore();
  const { isRunning } = useTaskStore();

  const items: HealthItem[] = [
    {
      label: "DID",
      status: did ? "active" : "idle",
    },
    {
      label: "Discovery",
      status: counterpartVerified ? "active" : counterpartCard ? "error" : "idle",
    },
    {
      label: "Escrow",
      status: address ? "active" : "idle",
    },
    {
      label: "SSE",
      status: isRunning ? "active" : address ? "active" : "idle",
    },
  ];

  const statusColor = {
    active: "bg-accent",
    idle: "bg-forest-mid/60",
    error: "bg-red-500",
  };

  return (
    <div className="flex items-center gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5" title={`${item.label}: ${item.status}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusColor[item.status]} ${item.status === "active" ? "animate-pulse" : ""}`} />
          <span className="font-mono text-[8px] text-muted uppercase tracking-wider">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
