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
    .select("agent_id, name, description, system_prompt, capabilities_json, tier, provider, is_public, can_orchestrate, created_at")
    .eq("agent_id", "thread-forge")
    .maybeSingle();
  if (!data) {
    console.log("not found");
    return;
  }
  console.log("agent_id:    ", data.agent_id);
  console.log("name:        ", data.name);
  console.log("description: ", data.description);
  console.log("tier:        ", data.tier);
  console.log("provider:    ", data.provider);
  console.log("is_public:   ", data.is_public);
  console.log("created_at:  ", data.created_at);
  console.log("");
  console.log("system_prompt (raw):");
  console.log("---");
  console.log(data.system_prompt);
  console.log("---");
  console.log(`(${(data.system_prompt || "").length} chars)`);
  console.log("");
  console.log("capabilities_json (parsed):");
  try {
    const caps = JSON.parse(data.capabilities_json);
    for (const c of caps) {
      console.log(`  ${c.id}  ${c.pricing.amount} USDC  - ${c.description}`);
    }
  } catch (e) {
    console.error("parse error:", e);
  }
}
main();
