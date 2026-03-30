import { NextResponse } from "next/server";
import { MY_AGENT_CARD } from "@/lib/mock/agentCards";

/**
 * GET /.well-known/agent.json
 * A2A konvansiyonu: Bu sunucunun kendi Agent Card'ini dondurur.
 */
export async function GET() {
  return NextResponse.json(MY_AGENT_CARD, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
