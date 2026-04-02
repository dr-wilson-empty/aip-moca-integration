import { NextRequest, NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  Rate Limiter (in-memory, per IP)                                   */
/* ------------------------------------------------------------------ */

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 120; // requests per window
const RATE_WINDOW = 60_000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  rateLimitMap.forEach((v, k) => { if (now > v.resetAt) rateLimitMap.delete(k); });
}, 300_000);

/* ------------------------------------------------------------------ */
/*  SSRF Protection — blocked hosts                                    */
/* ------------------------------------------------------------------ */

const BLOCKED_HOSTS = [
  "localhost", "127.0.0.1", "0.0.0.0", "::1",
  "169.254.169.254", // AWS metadata
  "metadata.google.internal", // GCP metadata
];

function isSSRFBlocked(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.includes(host)) return true;
    // Block private IP ranges (except localhost for dev)
    if (host.startsWith("10.")) return true;
    if (host.startsWith("172.") && parseInt(host.split(".")[1]) >= 16 && parseInt(host.split(".")[1]) <= 31) return true;
    if (host.startsWith("192.168.")) return true;
    return false;
  } catch {
    return true; // Invalid URL → block
  }
}

/* ------------------------------------------------------------------ */
/*  Security Headers                                                   */
/* ------------------------------------------------------------------ */

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

/* ------------------------------------------------------------------ */
/*  Public routes (no auth required)                                   */
/* ------------------------------------------------------------------ */

const PUBLIC_API_ROUTES = [
  "/api/health",
  "/api/agent-card",
  "/api/ratings",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some((r) => pathname.startsWith(r));
}

/* ------------------------------------------------------------------ */
/*  Middleware                                                          */
/* ------------------------------------------------------------------ */

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // Rate limiting for API routes
  if (pathname.startsWith("/api/")) {
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again in a minute." },
        { status: 429 }
      );
    }
  }

  // SSRF protection for agent-card/fetch
  if (pathname === "/api/agent-card/fetch") {
    const url = request.nextUrl.searchParams.get("url");
    if (url) {
      // Allow localhost in development
      const isDev = process.env.NODE_ENV === "development";
      if (!isDev && isSSRFBlocked(url)) {
        return NextResponse.json(
          { error: "URL not allowed: internal/private addresses are blocked" },
          { status: 403 }
        );
      }
    }
  }

  // Security headers for all responses
  const response = NextResponse.next();
  return addSecurityHeaders(response);
}

export const config = {
  matcher: [
    // Apply to all routes except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
