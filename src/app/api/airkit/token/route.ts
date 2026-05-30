import { NextResponse } from "next/server";
import { signPartnerJwt } from "@/lib/moca/airkit-jwt";

// Mints a short-lived Partner JWT for the browser AIR Kit flows. The private key
// stays server-side; the browser only receives the signed token. Also returns the
// issuer DID and program IDs the client needs for issue/verify.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const scope = typeof body.scope === "string" ? body.scope : undefined; // "issue" | "verify"

  const token = await signPartnerJwt({ scope });

  return NextResponse.json({
    token,
    issuerDid: process.env.AIRKIT_ISSUER_DID ?? null,
    issueProgramId: process.env.AIRKIT_VERIFIED_AGENT_PROGRAM_ID ?? "c294h0g1lhijuhdr66a6jw",
    verifyProgramId: process.env.AIRKIT_VERIFY_PROGRAM_ID ?? null,
  });
}
