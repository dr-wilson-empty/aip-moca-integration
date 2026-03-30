import { NextRequest, NextResponse } from "next/server";
import { validateAgentCard } from "@/lib/protocol/agent-card-schema";
import {
  registerCard,
  getCardByDid,
  listCards,
} from "@/lib/protocol/agent-card-store";
import { verifyDID } from "@/lib/identity/did";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";

// Demo ajanlarini yukle
seedDemoAgents();

/**
 * GET /api/agent-card
 * - ?did=xxx  -> belirli bir ajanin card'ini dondur
 * - ?list=true -> tum kayitli ajanlari listele
 */
export async function GET(request: NextRequest) {
  seedDemoAgents();

  const did = request.nextUrl.searchParams.get("did");
  const list = request.nextUrl.searchParams.get("list");

  if (list === "true") {
    return NextResponse.json({ agents: listCards() });
  }

  if (!did) {
    return NextResponse.json(
      { error: "did or list query parameter is required" },
      { status: 400 }
    );
  }

  const card = getCardByDid(did);
  if (!card) {
    return NextResponse.json(
      { error: "Agent card not found", did },
      { status: 404 }
    );
  }

  return NextResponse.json(card);
}

/**
 * POST /api/agent-card
 * Yeni Agent Card kaydet. DID'in gecerli oldugu dogrulanir.
 */
export async function POST(request: NextRequest) {
  seedDemoAgents();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const card = validateAgentCard(body);
  if (!card) {
    return NextResponse.json(
      { error: "Invalid Agent Card format. Required: did, name, version, endpoint, type, capabilities (min 1)" },
      { status: 400 }
    );
  }

  // Opsiyonel: publicKey parametresi ile DID eslestirme dogrulama
  const publicKey = (body as Record<string, unknown>).publicKey as string | undefined;
  if (publicKey && !verifyDID(card.did, publicKey)) {
    return NextResponse.json(
      { error: "DID does not match the provided publicKey" },
      { status: 403 }
    );
  }

  registerCard(card);

  return NextResponse.json(
    { ok: true, message: "Agent card registered", did: card.did },
    { status: 201 }
  );
}
