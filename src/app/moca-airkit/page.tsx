"use client";
import { useState } from "react";
import {
  loginWithAir,
  logoutFromAir,
  issueCredentialInBrowser,
  verifyAgentCredential,
} from "@/lib/moca/airkit";

const DEMO_DID = "did:aip:0x8a277c1f8b520c55cbb438e23dd916e0d11d435e:summary-agent";

export default function MocaAirKitPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const append = (m: string) => setLog((l) => [...l, m]);

  async function token(scope: string) {
    const res = await fetch("/api/airkit/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope }),
    });
    return res.json();
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    append(`> ${label}...`);
    try {
      await fn();
    } catch (e: unknown) {
      append(`  error: ${(e as Error)?.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "40px auto",
        padding: "0 20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: 1.5,
      }}
    >
      <h1>AIP on Moca — AIR Kit test</h1>
      <p>Login uses the AIR smart account (gasless). Issue/verify need the dashboard programs.</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
        <button
          disabled={busy}
          onClick={() =>
            run("login", async () => {
              const r = await loginWithAir();
              setAddress(r.address);
              append(`  smart account: ${r.address}`);
            })
          }
        >
          1. Login with AIR
        </button>

        <button
          disabled={busy}
          onClick={() =>
            run("issue credential", async () => {
              const { token: authToken, issuerDid, issueProgramId } = await token("issue");
              const r = await issueCredentialInBrowser({
                authToken,
                issuerDid,
                credentialId: issueProgramId,
                credentialSubject: {
                  agentId: "summary-agent",
                  did: DEMO_DID,
                  verifiedAt: Math.floor(Date.now() / 1000),
                  rating: 5,
                },
              });
              append(`  issued: ${JSON.stringify(r)}`);
            })
          }
        >
          2. Issue Verified Agent credential
        </button>

        <button
          disabled={busy}
          onClick={() =>
            run("verify credential", async () => {
              const { token: authToken, verifyProgramId } = await token("verify");
              if (!verifyProgramId) {
                append("  no verify program configured (set AIRKIT_VERIFY_PROGRAM_ID)");
                return;
              }
              const r = await verifyAgentCredential({ authToken, programId: verifyProgramId });
              append(`  verify result: ${JSON.stringify(r)}`);
            })
          }
        >
          3. Verify credential
        </button>

        <button disabled={busy} onClick={() => run("logout", async () => { await logoutFromAir(); setAddress(null); })}>
          Logout
        </button>
      </div>

      {address && (
        <p>
          <strong>Smart account:</strong> {address}
        </p>
      )}

      <pre
        style={{
          background: "#0d1117",
          color: "#c9d1d9",
          padding: 16,
          borderRadius: 8,
          minHeight: 120,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {log.join("\n") || "(actions log will appear here)"}
      </pre>
    </main>
  );
}
