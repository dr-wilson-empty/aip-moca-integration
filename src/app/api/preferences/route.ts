import { NextRequest, NextResponse } from "next/server";
import { dbGetPreferences, dbUpsertPreferences } from "@/lib/supabase/preferences";
import { verifyWalletOwnership, isAuthError } from "@/lib/auth/wallet-auth";

/**
 * GET /api/preferences?wallet=xxx
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  const auth = verifyWalletOwnership(request, wallet);
  if (isAuthError(auth)) return auth;

  const prefs = await dbGetPreferences(wallet);
  return NextResponse.json(prefs);
}

/**
 * POST /api/preferences
 * Upsert preferences.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const wallet = body.wallet_address as string;
  if (!wallet) return NextResponse.json({ error: "wallet_address required" }, { status: 400 });

  const auth = verifyWalletOwnership(request, wallet);
  if (isAuthError(auth)) return auth;

  await dbUpsertPreferences(body as Parameters<typeof dbUpsertPreferences>[0]);
  return NextResponse.json({ ok: true });
}
