import { NextRequest } from "next/server";
import { getTask, onTaskEvent } from "@/lib/protocol/task-machine";
import type { LogEntry } from "@/types/aip";

/**
 * GET /api/task/:taskId/stream
 * Server-Sent Events endpoint.
 * Task ilerledikce event'leri gercek zamanli olarak frontend'e akar.
 */
export async function GET(
  _request: NextRequest,
  context: { params: { taskId: string } }
) {
  const { taskId } = context.params;

  const task = getTask(taskId);
  if (!task) {
    return new Response(
      JSON.stringify({ error: "Task not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Mevcut log entry'lerini hemen gonder (catch-up)
      for (const entry of task.log) {
        const data = JSON.stringify(formatEvent(entry, task.state));
        controller.enqueue(encoder.encode(`event: log\ndata: ${data}\n\n`));
      }

      // Task zaten tamamlanmissa veya basarisizsa stream'i kapat
      if (task.state === "COMPLETED" || task.state === "FAILED" || task.state === "CANCELLED") {
        const endData = JSON.stringify({
          type: "end",
          state: task.state,
          artifact: task.artifact ?? null,
          escrowTxHash: task.escrowTxHash,
          settlementTxHash: task.settlementTxHash ?? null,
        });
        controller.enqueue(encoder.encode(`event: end\ndata: ${endData}\n\n`));
        controller.close();
        return;
      }

      // Yeni event'leri dinle
      const unsubscribe = onTaskEvent(taskId, (_id, entry, updatedTask) => {
        try {
          const data = JSON.stringify(formatEvent(entry, updatedTask.state));
          controller.enqueue(encoder.encode(`event: log\ndata: ${data}\n\n`));

          // Task tamamlandi veya basarisiz oldu — stream'i kapat
          if (
            updatedTask.state === "COMPLETED" ||
            updatedTask.state === "FAILED" ||
            updatedTask.state === "CANCELLED"
          ) {
            const endData = JSON.stringify({
              type: "end",
              state: updatedTask.state,
              artifact: updatedTask.artifact ?? null,
              escrowTxHash: updatedTask.escrowTxHash,
              settlementTxHash: updatedTask.settlementTxHash ?? null,
            });
            controller.enqueue(encoder.encode(`event: end\ndata: ${endData}\n\n`));
            controller.close();
            unsubscribe();
          }
        } catch {
          // Stream kapandiysa ignore et
          unsubscribe();
        }
      });

      // Client baglantisi kesildiginde temizle
      _request.signal.addEventListener("abort", () => {
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function formatEvent(entry: LogEntry, taskState: string) {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    eventType: entry.eventType,
    message: entry.message,
    taskState,
  };
}
