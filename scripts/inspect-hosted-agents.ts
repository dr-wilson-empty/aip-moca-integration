import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";

try {
  const envText = readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* */ }

import { createClient } from "@supabase/supabase-js";

const REGISTRY_PROGRAM_ID = new PublicKey("CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc");

function derivePDA(owner: string, agentId: string): string {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), new PublicKey(owner).toBuffer(), Buffer.from(agentId)],
    REGISTRY_PROGRAM_ID,
  );
  return pda.toBase58();
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data, error } = await supabase
    .from("hosted_agents")
    .select("agent_id, owner_address, name, active, is_public, created_at");

  if (error) { console.error(error); process.exit(1); }

  console.log(`hosted_agents rows: ${data?.length ?? 0}`);
  for (const row of data || []) {
    const pda = (() => { try { return derivePDA(row.owner_address, row.agent_id); } catch { return "<invalid owner>"; } })();
    console.log(`  • agent_id="${row.agent_id}"  owner=${row.owner_address}  active=${row.active}  public=${row.is_public}`);
    console.log(`    name="${row.name}"`);
    console.log(`    derived PDA = ${pda}`);
  }
}

main().catch(console.error);
