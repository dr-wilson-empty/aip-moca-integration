import { NextRequest, NextResponse } from "next/server";
import { testMcpConnection } from "@/lib/mcp/client-manager";

/**
 * POST /api/mcp/test
 * Test connectivity to an MCP server — connect, discover tools, disconnect.
 * Used by the agent creation UI to validate MCP server URLs.
 *
 * Body: { name: string, url: string, headers?: Record<string, string> }
 * Returns: { ok: boolean, tools: McpToolInfo[], error?: string }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, url, headers } = body as {
    name?: string;
    url?: string;
    headers?: Record<string, string>;
  };

  if (!name || !url) {
    return NextResponse.json(
      { error: "name and url are required" },
      { status: 400 }
    );
  }

  // Validate URL
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json(
        { error: "URL must use http or https protocol" },
        { status: 400 }
      );
    }

    // SSRF protection in production
    if (process.env.NODE_ENV === "production") {
      const hostname = parsed.hostname;
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.startsWith("10.") ||
        hostname.startsWith("172.16.") ||
        hostname.startsWith("192.168.") ||
        hostname === "0.0.0.0"
      ) {
        return NextResponse.json(
          { error: "Private network addresses are not allowed in production" },
          { status: 400 }
        );
      }
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid URL format" },
      { status: 400 }
    );
  }

  const result = await testMcpConnection({ name, url, headers });

  return NextResponse.json(result);
}
