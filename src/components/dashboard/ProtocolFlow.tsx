"use client";

import { useTaskStore } from "@/store/taskStore";
import MonoLabel from "@/components/ui/MonoLabel";
import type { ProtocolNode } from "@/types/aip";

function NodeDot({ state }: { state: ProtocolNode["state"] }) {
  const map = {
    idle: "bg-forest-deep border-forest-mid",
    active: "bg-transparent border-accent",
    done: "bg-accent border-accent",
    error: "bg-red-500 border-red-500",
  };
  return (
    <div
      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${map[state]}`}
    >
      {state === "active" && (
        <span className="w-2 h-2 border border-accent border-t-transparent rounded-full animate-spin-slow block" />
      )}
    </div>
  );
}

function Connector({ done }: { done: boolean }) {
  return (
    <div
      className={`flex-1 h-px transition-colors duration-500 ${
        done ? "bg-accent" : "bg-forest-mid/40"
      }`}
    />
  );
}

export default function ProtocolFlow() {
  const { nodes } = useTaskStore();

  return (
    <div className="border border-forest-deep/60 bg-forest-deep/20 p-6">
      <MonoLabel className="text-accent mb-5">Protocol Flow</MonoLabel>
      <div className="flex items-center gap-0">
        {nodes.map((node, i) => (
          <div key={node.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <NodeDot state={node.state} />
              <span
                className={`font-mono text-[9px] uppercase tracking-wider text-center transition-colors duration-300 ${
                  node.state === "done"
                    ? "text-accent"
                    : node.state === "active"
                    ? "text-off-white"
                    : node.state === "error"
                    ? "text-red-400"
                    : "text-muted"
                }`}
              >
                {node.label}
              </span>
              {node.timestamp && (
                <span className="font-mono text-[8px] text-muted">
                  {node.timestamp}
                </span>
              )}
            </div>
            {i < nodes.length - 1 && (
              <Connector done={node.state === "done"} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
