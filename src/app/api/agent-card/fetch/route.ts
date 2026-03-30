import { NextRequest, NextResponse } from "next/server";
import { validateAgentCard } from "@/lib/protocol/agent-card-schema";
import { getCardByEndpoint } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";

// Demo ajanlarini yukle
seedDemoAgents();

/**
 * GET /api/agent-card/fetch?url=<endpoint>
 *
 * Karsi ajanin Agent Card'ini ceker:
 * 1. Once in-memory store'da ara (demo ajanlar burada)
 * 2. Bulunamazsa dis endpoint'e HTTP istegi at
 * 3. Card'i dogrula ve dondur
 */
export async function GET(request: NextRequest) {
  seedDemoAgents();

  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "url query parameter is required" },
      { status: 400 }
    );
  }

  // 1. In-memory store'da ara (demo ajanlar)
  const storedCard = getCardByEndpoint(url);
  if (storedCard) {
    return NextResponse.json({
      card: storedCard,
      source: "registry",
      verified: true,
    });
  }

  // 2. Dis endpoint'e HTTP istegi at
  try {
    // A2A konvansiyonu: endpoint/.well-known/agent.json
    const wellKnownUrl = url.endsWith("/")
      ? `${url}.well-known/agent.json`
      : `${url}/.well-known/agent.json`;

    const res = await fetch(wellKnownUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Remote agent returned HTTP ${res.status}`, url: wellKnownUrl },
        { status: 502 }
      );
    }

    const data = await res.json();
    const card = validateAgentCard(data);

    if (!card) {
      return NextResponse.json(
        { error: "Remote agent returned invalid Agent Card format", url: wellKnownUrl },
        { status: 502 }
      );
    }

    return NextResponse.json({
      card,
      source: "remote",
      verified: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // Timeout veya network hatasi
    return NextResponse.json(
      { error: `Failed to fetch agent card: ${message}`, url },
      { status: 502 }
    );
  }
}
