import { NextRequest, NextResponse } from "next/server";
import { dbGetTwinMessages, dbGetTwinMessageCount, dbInsertTwinMessage, dbUpdateTwinMessage } from "@/lib/supabase/db";

/**
 * GET /api/twin/messages?wallet=xxx&limit=200&before=ISO_DATE
 * Load twin chat history with pagination.
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "200") || 200, 500);
  const before = request.nextUrl.searchParams.get("before") || undefined;

  const [messages, total] = await Promise.all([
    dbGetTwinMessages(wallet, limit, before),
    dbGetTwinMessageCount(wallet),
  ]);

  return NextResponse.json({ messages, total });
}

/**
 * POST /api/twin/messages
 * Save or update a twin message.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;

  if (action === "insert") {
    await dbInsertTwinMessage(body.message as Parameters<typeof dbInsertTwinMessage>[0]);
    return NextResponse.json({ ok: true });
  }

  if (action === "update") {
    const id = body.id as string;
    const update = body.update as Record<string, unknown>;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await dbUpdateTwinMessage(id, update);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action required: insert | update" }, { status: 400 });
}
