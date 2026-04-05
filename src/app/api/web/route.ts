import { NextRequest, NextResponse } from "next/server";
import { webSearch } from "@/lib/web/search";

/**
 * POST /api/web
 * Web search endpoint. Used by agents with web.search capability.
 *
 * Body: { query: string, maxResults?: number }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const query = body.query as string | undefined;
  const maxResults = (body.maxResults as number) || 5;

  if (!query?.trim()) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  const result = await webSearch(query.trim(), maxResults);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result);
}
