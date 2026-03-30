import { NextRequest, NextResponse } from "next/server";
import { createTask, listTasks, getTask } from "@/lib/protocol/task-machine";
import { createEscrowRecord, releaseEscrow, refundEscrow } from "@/lib/payment/escrow";
import { getCardByEndpoint } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { runDemoAgent } from "@/lib/protocol/demo-agent";

seedDemoAgents();

/**
 * GET /api/task
 * - ?taskId=xxx -> belirli bir gorev
 * - ?list=true  -> tum gorevleri listele
 */
export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("taskId");
  const list = request.nextUrl.searchParams.get("list");

  if (taskId) {
    const task = getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json(task);
  }

  if (list === "true") {
    return NextResponse.json({ tasks: listTasks() });
  }

  return NextResponse.json(
    { error: "taskId or list=true required" },
    { status: 400 }
  );
}

/**
 * POST /api/task
 * Gorev baslat — tam protokol akisi:
 * 1. Karsi ajan card'ini dogrula
 * 2. Task kaydini olustur
 * 3. Escrow kaydini olustur
 * 4. Demo ajan akisini baslat (arka planda)
 *
 * Body: {
 *   agentEndpoint, capability, input, amount,
 *   callerDid, callerAddress, escrowTxHash
 * }
 */
export async function POST(request: NextRequest) {
  seedDemoAgents();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    agentEndpoint,
    capability,
    input,
    amount,
    callerDid,
    callerAddress,
    escrowTxHash,
  } = body as {
    agentEndpoint?: string;
    capability?: string;
    input?: string;
    amount?: string;
    callerDid?: string;
    callerAddress?: string;
    escrowTxHash?: string;
  };

  if (!agentEndpoint || !capability || !input || !amount || !callerDid || !callerAddress || !escrowTxHash) {
    return NextResponse.json(
      { error: "Required: agentEndpoint, capability, input, amount, callerDid, callerAddress, escrowTxHash" },
      { status: 400 }
    );
  }

  // Karsi ajan card'ini bul
  const agentCard = getCardByEndpoint(agentEndpoint);
  if (!agentCard) {
    return NextResponse.json(
      { error: "Agent not found for endpoint", agentEndpoint },
      { status: 404 }
    );
  }

  // Task ID uret
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Task kaydini olustur
  const task = createTask({
    id: taskId,
    callerDid,
    callerAddress,
    agentDid: agentCard.did,
    agentName: agentCard.name,
    agentAddress: agentCard.endpoint, // Faz 1: endpoint = adres
    capability,
    input,
    amount,
    escrowTxHash,
  });

  // Escrow kaydini olustur
  createEscrowRecord({
    taskId,
    amount,
    from: callerAddress,
    to: agentCard.endpoint,
    escrowTxHash,
  });

  // Demo ajan akisini arka planda baslat
  runDemoAgent(
    taskId,
    capability,
    input,
    escrowTxHash,
    async (action) => {
      try {
        if (action === "release") {
          const result = await releaseEscrow(taskId);
          return result.txHash;
        } else {
          await refundEscrow(taskId);
          return null;
        }
      } catch {
        // Escrow islemleri basarisiz olabilir (Devnet, SOL yetersiz, vb.)
        // PoC'da hatayi logla ama akisi durdurma
        return null;
      }
    }
  );

  return NextResponse.json(
    { ok: true, taskId, task },
    { status: 201 }
  );
}
