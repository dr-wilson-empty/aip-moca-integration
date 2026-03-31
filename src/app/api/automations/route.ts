import { NextRequest, NextResponse } from "next/server";
import {
  dbListAutomations,
  dbCreateAutomation,
  dbUpdateAutomation,
  dbDeleteAutomation,
  type DbAutomation,
} from "@/lib/supabase/automations";

/**
 * GET /api/automations?wallet=xxx
 * List automations for a wallet.
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  const automations = await dbListAutomations(wallet);
  return NextResponse.json({ automations });
}

/**
 * POST /api/automations
 * Create a new automation.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { walletAddress, name, prompt, schedule, budgetLimit, budgetPeriod } = body as {
    walletAddress?: string; name?: string; prompt?: string;
    schedule?: string; budgetLimit?: number; budgetPeriod?: string;
  };

  if (!walletAddress || !name || !prompt) {
    return NextResponse.json({ error: "walletAddress, name, prompt required" }, { status: 400 });
  }

  const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const auto: DbAutomation = {
    id,
    wallet_address: walletAddress,
    name: name.trim(),
    prompt: prompt.trim(),
    schedule: schedule || "daily",
    budget_limit: budgetLimit ?? 1.0,
    budget_period: budgetPeriod || "daily",
    enabled: true,
    total_spent: 0,
    run_count: 0,
  };

  await dbCreateAutomation(auto);
  return NextResponse.json({ ok: true, automation: auto }, { status: 201 });
}

/**
 * PATCH /api/automations
 * Update an automation.
 */
export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, ...update } = body as { id?: string; [key: string]: unknown };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await dbUpdateAutomation(id, update);
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/automations
 * Delete an automation.
 */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await dbDeleteAutomation(id);
  return NextResponse.json({ ok: true });
}
