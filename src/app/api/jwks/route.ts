import { NextResponse } from "next/server";
import { importSPKI, exportJWK } from "jose";

// Public JWKS endpoint for AIR Kit. Publishes the partner's public signing key so
// Moca can verify the Partner JWTs we sign. Register this URL in the AIR Kit
// dashboard (Account -> General Settings -> JWKS URL).
//
// The `kid` must equal the Partner ID, matching the `kid` we set on signed JWTs.
export const dynamic = "force-dynamic";

export async function GET() {
  const partnerId = process.env.NEXT_PUBLIC_AIRKIT_PARTNER_ID;
  const alg = process.env.AIRKIT_SIGNING_ALGORITHM ?? "RS256";
  const pubB64 = process.env.AIRKIT_PARTNER_PUBLIC_KEY_B64;

  if (!partnerId || !pubB64) {
    return NextResponse.json({ error: "AIR Kit keys are not configured" }, { status: 500 });
  }

  const pem = Buffer.from(pubB64, "base64").toString("utf8");
  const key = await importSPKI(pem, alg);
  const jwk = await exportJWK(key);
  jwk.kid = partnerId;
  jwk.use = "sig";
  jwk.alg = alg;

  return NextResponse.json(
    { keys: [jwk] },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
