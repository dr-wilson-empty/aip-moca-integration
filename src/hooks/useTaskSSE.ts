"use client";

import { useEffect, useRef } from "react";
import { useTaskStore } from "@/store/taskStore";
import type { ProtocolNode, LogEntry } from "@/types/aip";

/**
 * SSE event'lerini ProtocolFlow node indeksine mapper.
 */
const EVENT_TO_NODE: Record<string, number> = {
  IDENTITY: 0,
  PAYMENT: 1,
  REQUEST: 2,
  PROCESSING: 3,
  SETTLEMENT: 4,
  COMPLETE: 4,
  ERROR: -1,   // aktif node'u error yapar
  REFUND: -2,  // son node'u error yapar
};

/**
 * SSE event'lerinden ProtocolFlow node state'lerini hesaplar.
 */
function computeNodes(events: LogEntry[]): ProtocolNode[] {
  const nodes: ProtocolNode[] = [
    { id: "did_verify", label: "Verify Identity", state: "idle" },
    { id: "escrow_lock", label: "Lock Payment", state: "idle" },
    { id: "task_sent", label: "Send Request", state: "idle" },
    { id: "executing", label: "Processing", state: "idle" },
    { id: "settlement", label: "Complete", state: "idle" },
  ];

  // Her event type icin kac kez goruldugunu takip et
  const counts: Record<string, number> = {};
  let hasError = false;

  for (const entry of events) {
    const type = entry.eventType;
    counts[type] = (counts[type] ?? 0) + 1;
    const nodeIdx = EVENT_TO_NODE[type];

    if (nodeIdx === undefined) continue;

    if (type === "ERROR") {
      // Aktif olan node'u error yap
      hasError = true;
      for (let i = nodes.length - 1; i >= 0; i--) {
        if (nodes[i].state === "active") {
          nodes[i] = { ...nodes[i], state: "error", timestamp: entry.timestamp };
          break;
        }
      }
      continue;
    }

    if (type === "REFUND") {
      // Settlement node'u error yap
      hasError = true;
      nodes[4] = { ...nodes[4], state: "error", timestamp: entry.timestamp };
      continue;
    }

    if (nodeIdx >= 0 && nodeIdx < nodes.length) {
      const count = counts[type] ?? 0;
      if (count === 1) {
        // Ilk gorunus: active
        nodes[nodeIdx] = { ...nodes[nodeIdx], state: "active" };
      } else {
        // Ikinci gorunus: done
        nodes[nodeIdx] = { ...nodes[nodeIdx], state: "done", timestamp: entry.timestamp };
        // Sonraki node'u active yap (varsa ve idle ise)
        if (nodeIdx + 1 < nodes.length && nodes[nodeIdx + 1].state === "idle" && !hasError) {
          nodes[nodeIdx + 1] = { ...nodes[nodeIdx + 1], state: "active" };
        }
      }
    }
  }

  return nodes;
}

/**
 * Task SSE hook — taskId set edildiginde SSE stream'e baglanir,
 * gelen event'leri taskStore'a yazar.
 */
export function useTaskSSE(taskId: string | null) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const { updateNodes, addLogEntry, completeTask, failTask } = useTaskStore();
  const allEventsRef = useRef<LogEntry[]>([]);

  useEffect(() => {
    if (!taskId) return;

    allEventsRef.current = [];

    const es = new EventSource(`/api/task/${taskId}/stream`);
    eventSourceRef.current = es;

    es.addEventListener("log", (e) => {
      const data = JSON.parse(e.data);
      const entry: LogEntry = {
        id: data.id,
        timestamp: data.timestamp,
        eventType: data.eventType,
        message: data.message,
      };

      allEventsRef.current.push(entry);
      addLogEntry(entry);

      // Node state'lerini yeniden hesapla
      const nodes = computeNodes(allEventsRef.current);
      updateNodes(nodes);
    });

    es.addEventListener("end", (e) => {
      const data = JSON.parse(e.data);

      if (data.state === "COMPLETED") {
        completeTask(
          data.artifact ?? "",
          data.escrowTxHash ?? "",
          data.settlementTxHash ?? ""
        );
      } else if (data.state === "FAILED") {
        failTask(data.escrowTxHash ?? "");
      }

      es.close();
    });

    es.addEventListener("error", () => {
      // SSE baglantisi kesildi — yeniden deneme EventSource tarafindan otomatik yapilir
      // Ama task tamamlandiysa close
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [taskId, updateNodes, addLogEntry, completeTask, failTask]);
}
