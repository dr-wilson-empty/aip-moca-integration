import { NextRequest, NextResponse } from "next/server";
import { dbSubmitRating, dbGetAgentRatings, dbGetTopAgents, dbGetCategories } from "@/lib/supabase/ratings";

/**
 * GET /api/ratings?agentDid=xxx — get ratings for an agent
 * GET /api/ratings?top=true — get top rated agents
 * GET /api/ratings?categories=true — get all categories
 */
export async function GET(request: NextRequest) {
  const agentDid = request.nextUrl.searchParams.get("agentDid");
  const top = request.nextUrl.searchParams.get("top");
  const categories = request.nextUrl.searchParams.get("categories");

  if (categories === "true") {
    const cats = await dbGetCategories();
    return NextResponse.json({ categories: cats });
  }

  if (top === "true") {
    const topAgents = await dbGetTopAgents();
    return NextResponse.json({ topAgents });
  }

  if (agentDid) {
    const data = await dbGetAgentRatings(agentDid);
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "agentDid, top, or categories param required" }, { status: 400 });
}

/**
 * POST /api/ratings
 * Submit a rating.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agentDid, walletAddress, taskId, rating, comment } = body as {
    agentDid?: string; walletAddress?: string; taskId?: string;
    rating?: number; comment?: string;
  };

  if (!agentDid || !walletAddress || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "agentDid, walletAddress, rating (1-5) required" }, { status: 400 });
  }

  const id = `rat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await dbSubmitRating({ id, agent_did: agentDid, wallet_address: walletAddress, task_id: taskId, rating, comment });
  return NextResponse.json({ ok: true });
}
