import { NextRequest, NextResponse } from "next/server";
import {
  getMemories,
  getAllUserMemories,
  deleteMemory,
  clearMemories,
  clearAllUserMemories,
} from "@/lib/memory/agent-memory";
import { verifyWalletOwnership, isAuthError } from "@/lib/auth/wallet-auth";

/**
 * GET /api/memory?wallet=xxx                    — all memories for user
 * GET /api/memory?wallet=xxx&agentDid=xxx       — memories for user-agent pair
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  const agentDid = request.nextUrl.searchParams.get("agentDid");

  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  const auth = verifyWalletOwnership(request, wallet);
  if (isAuthError(auth)) return auth;

  if (agentDid) {
    const memories = await getMemories(agentDid, wallet);
    return NextResponse.json({ memories });
  }

  const memories = await getAllUserMemories(wallet);
  return NextResponse.json({ memories });
}

/**
 * DELETE /api/memory?id=xxx            — delete single memory
 * DELETE /api/memory?wallet=xxx&agentDid=xxx  — clear agent memories
 * DELETE /api/memory?wallet=xxx&all=true      — clear all user memories
 */
export async function DELETE(request: NextRequest) {
  const auth = verifyWalletOwnership(request, null);
  if (isAuthError(auth)) return auth;

  const id = request.nextUrl.searchParams.get("id");
  const wallet = request.nextUrl.searchParams.get("wallet");
  const agentDid = request.nextUrl.searchParams.get("agentDid");
  const all = request.nextUrl.searchParams.get("all");

  if (id) {
    await deleteMemory(id);
    return NextResponse.json({ ok: true });
  }

  if (wallet && agentDid) {
    await clearMemories(agentDid, wallet);
    return NextResponse.json({ ok: true });
  }

  if (wallet && all === "true") {
    await clearAllUserMemories(wallet);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "id, or wallet+agentDid, or wallet+all required" }, { status: 400 });
}
