import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

const SITE_PASSWORD = process.env.SITE_PASSWORD || "1905Wiener";
const AUTH_COOKIE = "aip-auth";
const AUTH_MAX_AGE = 86400; // 24 hours

function md5(str: string): string {
  return createHash("md5").update(str).digest("hex");
}

// Brute force protection
const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // Rate limit: 5 attempts per minute
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry && now < entry.resetAt && entry.count >= 5) {
    return new Response("Too many attempts. Try again in a minute.", { status: 429 });
  }
  if (!entry || now > entry.resetAt!) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
  } else {
    entry.count++;
  }

  const formData = await request.formData();
  const password = formData.get("password") as string;

  if (!password || password !== SITE_PASSWORD) {
    // Wrong password — redirect back with error
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("auth", "failed");
    return NextResponse.redirect(url);
  }

  // Correct — set auth cookie and redirect to home
  const hash = md5(SITE_PASSWORD);
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.delete("auth");
  const response = NextResponse.redirect(url);
  response.cookies.set(AUTH_COOKIE, hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: AUTH_MAX_AGE,
    path: "/",
  });

  return response;
}
