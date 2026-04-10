import { NextRequest, NextResponse } from "next/server";
import {
  dbListAutomations,
  dbCreateAutomation,
  dbUpdateAutomation,
  dbDeleteAutomation,
  type DbAutomation,
  type TriggerType,
} from "@/lib/supabase/automations";
import { generateWebhookSecret } from "@/lib/trigger/webhook";
import { verifyWalletOwnership, isAuthError } from "@/lib/auth/wallet-auth";

/**
 * GET /api/automations?wallet=xxx
 * List automations for a wallet.
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  const auth = verifyWalletOwnership(request, wallet);
  if (isAuthError(auth)) return auth;

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

  const { walletAddress, name, prompt, schedule, budgetLimit, budgetPeriod, triggerType, watchAddress } = body as {
    walletAddress?: string; name?: string; prompt?: string;
    schedule?: string; budgetLimit?: number; budgetPeriod?: string;
    triggerType?: TriggerType; watchAddress?: string;
  };

  if (!walletAddress || !name || !prompt) {
    return NextResponse.json({ error: "walletAddress, name, prompt required" }, { status: 400 });
  }

  const auth = verifyWalletOwnership(request, walletAddress);
  if (isAuthError(auth)) return auth;

  const trigger = triggerType || "schedule";
  const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const auto: DbAutomation = {
    id,
    wallet_address: walletAddress,
    name: name.trim(),
    prompt: prompt.trim(),
    schedule: trigger === "schedule" ? (schedule || "daily") : "manual",
    budget_limit: budgetLimit ?? 1.0,
    budget_period: budgetPeriod || "daily",
    enabled: true,
    total_spent: 0,
    run_count: 0,
    trigger_type: trigger,
    webhook_secret: trigger === "webhook" ? generateWebhookSecret() : undefined,
    watch_address: trigger === "onchain" ? watchAddress : undefined,
  };

  await dbCreateAutomation(auto);
  return NextResponse.json({ ok: true, automation: auto }, { status: 201 });
}

/**
 * PATCH /api/automations
 * Update an automation.
 */
export async function PATCH(request: NextRequest) {
  const auth = verifyWalletOwnership(request, null);
  if (isAuthError(auth)) return auth;

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
  const auth = verifyWalletOwnership(request, null);
  if (isAuthError(auth)) return auth;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await dbDeleteAutomation(id);
  return NextResponse.json({ ok: true });
}
