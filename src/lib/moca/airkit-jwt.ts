/**
 * Partner JWT signing for AIR Kit (server-side only).
 *
 * Signs a JWT with the partner private key (RS256). The `kid` equals the Partner
 * ID so AIR Kit can find the matching key in our JWKS endpoint. Used to
 * authenticate credential operations (x-partner-auth header).
 *
 * Never import this in client/browser code: it reads the private key.
 */
import { SignJWT, importPKCS8 } from "jose";

const ALG = process.env.AIRKIT_SIGNING_ALGORITHM ?? "RS256";

function getPartnerId(): string {
  const id = process.env.NEXT_PUBLIC_AIRKIT_PARTNER_ID;
  if (!id) throw new Error("NEXT_PUBLIC_AIRKIT_PARTNER_ID is not set");
  return id;
}

async function getPrivateKey() {
  const b64 = process.env.AIRKIT_PARTNER_PRIVATE_KEY_B64;
  if (!b64) throw new Error("AIRKIT_PARTNER_PRIVATE_KEY_B64 is not set");
  const pem = Buffer.from(b64, "base64").toString("utf8");
  return importPKCS8(pem, ALG);
}

export interface PartnerJwtOptions {
  /** e.g. "issue on-behalf" for server issuance, "verify" for verification. Omit for plain auth. */
  scope?: string;
  /** target user's AIR Account email — required for issue-on-behalf. */
  email?: string;
  /** token lifetime in seconds (default 300, AIR Kit recommends ~5 min). */
  ttlSeconds?: number;
}

export async function signPartnerJwt(opts: PartnerJwtOptions = {}): Promise<string> {
  const key = await getPrivateKey();
  const partnerId = getPartnerId();

  const payload: Record<string, unknown> = { partnerId };
  if (opts.scope) payload.scope = opts.scope;
  if (opts.email) payload.email = opts.email;

  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG, kid: partnerId, typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${opts.ttlSeconds ?? 300}s`)
    .sign(key);
}
