import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

async function main() {
  try {
    const env = readFileSync(".env.local", "utf8");
    for (const line of env.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb
    .from("hosted_agents")
    .select("agent_id, owner_address, name, active, is_public, can_orchestrate, created_at")
    .eq("agent_id", "auto-hustler-agent")
    .maybeSingle();
  console.log(JSON.stringify(data, null, 2));
}
main();
