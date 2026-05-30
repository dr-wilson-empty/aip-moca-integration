/**
 * Live verification of AIR Credential issuance (server-side, Issue-on-Behalf).
 * Issues a "Verified Agent" credential to a holder email, then polls until the
 * credential is on-chain. Proves the JWKS + Partner JWT auth and the issuance
 * client actually work against Moca AIR Kit.
 *
 *   set -a && . ./.env.local && set +a && npx tsx scripts/verify-credential.ts
 */
import { issueVerifiedAgentCredential, checkIssuanceStatus } from "../src/lib/moca/credential-client";

const PROGRAM_ID = process.env.AIRKIT_VERIFIED_AGENT_PROGRAM_ID ?? "c294h0g1lhijuhdr66a6jw";
const EMAIL = process.env.TEST_HOLDER_EMAIL ?? "emptylabs0@gmail.com";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("Issuing Verified Agent credential (Issue-on-Behalf)...");
  console.log("program:", PROGRAM_ID);
  console.log("holder :", EMAIL);

  const result = await issueVerifiedAgentCredential({
    email: EMAIL,
    programId: PROGRAM_ID,
    agentId: "summary-agent",
    did: "did:aip:0x8a277c1f8b520c55cbb438e23dd916e0d11d435e:summary-agent",
    rating: 5,
  });
  console.log("issued:", JSON.stringify(result));

  console.log("polling status (coreClaimHash)...");
  for (let i = 0; i < 12; i++) {
    const s = await checkIssuanceStatus(result.coreClaimHash);
    console.log("  vcStatus:", s.vcStatus);
    if (s.vcStatus === "ONCHAIN") {
      console.log("\nCredential is on-chain. AIR credential issuance verified live.");
      return;
    }
    await sleep(4000);
  }
  console.log("(still processing; coreClaimHash returned, so the issuance call itself succeeded)");
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
