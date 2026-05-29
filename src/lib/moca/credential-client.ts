/**
 * AIR Credential issuance — server-side (no browser).
 *
 * Issues credentials with the "Issue on Behalf" REST API, authenticated by a
 * Partner JWT (scope "issue on-behalf"). Used to give a registered AIP agent a
 * verifiable "Verified Agent" credential on Moca, mapping AIP's reputation idea
 * onto AIR Credentials.
 */
import { signPartnerJwt } from "./airkit-jwt";

const API_BASE = process.env.AIRKIT_API_BASE ?? "https://api.sandbox.mocachain.org/v1";

export interface IssueCredentialParams {
  /** target user's AIR Account email (the credential holder). */
  email: string;
  /** Issuance Program ID from the dashboard (the API calls this credentialId). */
  programId: string;
  /** claims matching the schema attributes. */
  credentialSubject: Record<string, unknown>;
  onDuplicate?: "ignore" | "revoke";
}

export interface IssueResult {
  coreClaimHash: string;
  credentialId: string;
  userUuid: string;
}

export async function issueCredentialOnBehalf(params: IssueCredentialParams): Promise<IssueResult> {
  const issuerDid = process.env.AIRKIT_ISSUER_DID;
  if (!issuerDid) throw new Error("AIRKIT_ISSUER_DID is not set");

  const token = await signPartnerJwt({ scope: "issue on-behalf", email: params.email });

  const res = await fetch(`${API_BASE}/credentials/issue-on-behalf`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-partner-auth": token },
    body: JSON.stringify({
      issuerDid,
      credentialId: params.programId,
      credentialSubject: params.credentialSubject,
      onDuplicate: params.onDuplicate ?? "revoke",
    }),
  });

  if (!res.ok) {
    throw new Error(`issue-on-behalf failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export interface IssuanceStatus {
  vcStatus: string; // "ONCHAIN" when complete
}

export async function checkIssuanceStatus(coreClaimHash: string): Promise<IssuanceStatus> {
  const token = await signPartnerJwt({ scope: "issue on-behalf" });
  const res = await fetch(
    `${API_BASE}/credentials/status?coreClaimHash=${encodeURIComponent(coreClaimHash)}`,
    { headers: { "x-partner-auth": token } },
  );
  if (!res.ok) throw new Error(`status check failed: ${res.status}`);
  return res.json();
}

/**
 * Convenience: issue a "Verified Agent" credential for an AIP agent.
 * `programId` is the issuance program created from the AIPVerifiedAgent schema.
 */
export async function issueVerifiedAgentCredential(params: {
  email: string;
  programId: string;
  agentId: string;
  did: string;
  rating?: number;
}): Promise<IssueResult> {
  return issueCredentialOnBehalf({
    email: params.email,
    programId: params.programId,
    credentialSubject: {
      agentId: params.agentId,
      did: params.did,
      verifiedAt: new Date().toISOString(),
      ...(params.rating !== undefined ? { rating: params.rating } : {}),
    },
  });
}
