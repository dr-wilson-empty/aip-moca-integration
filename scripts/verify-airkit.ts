/**
 * Local verification of the AIR Kit signing chain (no dashboard, no browser):
 *   1. build the JWKS JWK from the public key (same as the /api/jwks route)
 *   2. sign a Partner JWT with the private key (same as airkit-jwt.ts)
 *   3. verify that JWT against the JWKS
 * This proves the key format (PKCS8 / SPKI), the jose pipeline and the critical
 * kid match are all correct, so the real AIR Kit calls will authenticate.
 *
 *   set -a && . ./.env.local && set +a && npx tsx scripts/verify-airkit.ts
 */
import { importSPKI, exportJWK, importPKCS8, SignJWT, jwtVerify, createLocalJWKSet } from "jose";

const partnerId = process.env.NEXT_PUBLIC_AIRKIT_PARTNER_ID!;
const alg = process.env.AIRKIT_SIGNING_ALGORITHM ?? "RS256";
const privB64 = process.env.AIRKIT_PARTNER_PRIVATE_KEY_B64!;
const pubB64 = process.env.AIRKIT_PARTNER_PUBLIC_KEY_B64!;

async function main() {
  if (!partnerId || !privB64 || !pubB64) throw new Error("AIR Kit env vars not loaded (source .env.local)");

  // 1. JWKS JWK from the public key (mirrors src/app/api/jwks/route.ts)
  const pubPem = Buffer.from(pubB64, "base64").toString("utf8");
  const pubKey = await importSPKI(pubPem, alg);
  const jwk = await exportJWK(pubKey);
  jwk.kid = partnerId;
  jwk.use = "sig";
  jwk.alg = alg;
  console.log("1) JWKS jwk:", { kty: jwk.kty, kid: jwk.kid, alg: jwk.alg, use: jwk.use });

  // 2. Sign a Partner JWT (mirrors src/lib/moca/airkit-jwt.ts)
  const privPem = Buffer.from(privB64, "base64").toString("utf8");
  const privKey = await importPKCS8(privPem, alg);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ partnerId, scope: "issue on-behalf", email: "demo@example.com" })
    .setProtectedHeader({ alg, kid: partnerId, typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privKey);
  console.log("2) signed JWT:", jwt.slice(0, 32) + "...");

  // 3. Verify the JWT against the JWKS (proves kid match + signature)
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const { payload, protectedHeader } = await jwtVerify(jwt, jwks);
  console.log("3) verified header:", JSON.stringify(protectedHeader));
  console.log("   verified payload:", JSON.stringify(payload));

  console.log("\nAIR Kit JWKS + Partner JWT chain verified locally (kid match OK).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
