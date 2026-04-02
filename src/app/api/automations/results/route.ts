import { NextRequest, NextResponse } from "next/server";
import { dbListResults } from "@/lib/supabase/automations";

/**
 * GET /api/automations/results?automationId=xxx
 */
export async function GET(request: NextRequest) {
  const automationId = request.nextUrl.searchParams.get("automationId");
  if (!automationId) return NextResponse.json({ error: "automationId required" }, { status: 400 });

  const results = await dbListResults(automationId);
  return NextResponse.json({ results });
}
