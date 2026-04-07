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
  "localhost", "127.0.0.1", "0.0.0.0",
  "169.254.169.254", // AWS metadata
  "metadata.google.internal", // GCP metadata
];

function isSSRFBlocked(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http/https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) return true;

    const host = parsed.hostname.toLowerCase();

    // Block known internal hostnames
    if (BLOCKED_HOSTS.includes(host)) return true;

    // Block IPv6 loopback and private (::1, ::, fe80::, fc00::, fd00::, etc.)
    if (host === "::1" || host === "::") return true;
    // Brackets stripped by URL parser, but handle bracketed IPv6 too
    const cleanHost = host.replace(/^\[|\]$/g, "");
    if (cleanHost === "::1" || cleanHost === "::") return true;
    if (/^(fe80|fc00|fd|ff0[0-9a-f]):/.test(cleanHost)) return true;
    // IPv4-mapped IPv6 (::ffff:127.0.0.1, ::ffff:10.x.x.x, etc.)
    if (cleanHost.startsWith("::ffff:")) {
      const mapped = cleanHost.slice(7);
      if (isPrivateIPv4(mapped)) return true;
    }

    // Block private IPv4 ranges
    if (isPrivateIPv4(host)) return true;

    // Block .internal, .local, .localhost TLDs (DNS rebinding protection)
    if (host.endsWith(".internal") || host.endsWith(".local") || host.endsWith(".localhost")) return true;

    // Block numeric IPs in octal/hex notation (bypass attempts)
    // e.g. 0x7f000001, 017700000001, 2130706433
    if (/^(0x[0-9a-f]+|0[0-7]+|[0-9]+)$/i.test(host)) return true;

    return false;
  } catch {
    return true; // Invalid URL → block
  }
}

function isPrivateIPv4(host: string): boolean {
  if (host.startsWith("10.")) return true;
  if (host.startsWith("127.")) return true;
  if (host.startsWith("0.")) return true;
  if (host.startsWith("192.168.")) return true;
  if (host.startsWith("169.254.")) return true; // link-local
  if (host.startsWith("172.")) {
    const second = parseInt(host.split(".")[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
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
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.solana.com https://*.supabase.co wss://*.solana.com; frame-ancestors 'none';"
  );
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

  // Rate limiting for API routes (exclude high-frequency polling endpoints)
  const isPolling = pathname.startsWith("/api/chain") || pathname.startsWith("/api/task/stream") || pathname.startsWith("/api/budget");
  if (pathname.startsWith("/api/") && !isPolling) {
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
