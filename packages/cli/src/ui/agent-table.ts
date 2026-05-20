import Table from "cli-table3";
import { c, glyph } from "../core/theme.js";
import { log } from "../core/logger.js";
import { shortenDid, refFromDid } from "../core/format.js";
import { cheapestPrice, type AgentStatus, type ListedAgent } from "../core/agent-list.js";

function statusGlyph(s: AgentStatus | undefined): string {
  if (!s) return c.dim("·");
  return s.online ? c.success("●") : c.dim("○");
}

function priceLabel(agent: ListedAgent): string {
  const min = cheapestPrice(agent);
  if (!Number.isFinite(min)) return c.dim("-");
  return `${c.success(min.toFixed(2))} ${c.dim("USDC")}`;
}

function badge(agent: ListedAgent): string {
  const parts: string[] = [];
  if (agent.onChain) parts.push(c.brand("on-chain"));
  if (agent.hasMcp) parts.push(c.accent("mcp"));
  return parts.join(" ");
}

export function renderAgentTable(
  agents: ListedAgent[],
  statusByDid: Map<string, AgentStatus> | undefined,
): void {
  if (agents.length === 0) {
    log.blank();
    log.info("No agents match the current filters.");
    log.blank();
    return;
  }

  const table = new Table({
    head: [
      c.dim(""),
      c.dim("name"),
      c.dim("ref"),
      c.dim("type"),
      c.dim("caps"),
      c.dim("from"),
      c.dim("did"),
      c.dim("tags"),
    ],
    style: { head: [], border: [] },
    chars: {
      top: "",
      "top-mid": "",
      "top-left": "",
      "top-right": "",
      bottom: "",
      "bottom-mid": "",
      "bottom-left": "",
      "bottom-right": "",
      left: "",
      "left-mid": "",
      mid: "",
      "mid-mid": "",
      right: "",
      "right-mid": "",
      middle: " ",
    },
  });

  for (const agent of agents) {
    table.push([
      statusGlyph(statusByDid?.get(agent.did)),
      c.value(agent.name),
      c.brand(refFromDid(agent.did)),
      c.dim(agent.type),
      c.value(String(agent.capabilities.length)),
      priceLabel(agent),
      c.dim(shortenDid(agent.did)),
      badge(agent),
    ]);
  }

  log.blank();
  log.raw(table.toString());

  if (statusByDid) {
    const online = agents.filter((a) => statusByDid.get(a.did)?.online).length;
    log.blank();
    log.raw(
      `  ${c.dim(glyph.bullet)} ${c.value(String(agents.length))} ${c.dim("agents")}  ${c.dim(glyph.dot)}  ${c.success(String(online))} ${c.dim("online")}`,
    );
  } else {
    log.blank();
    log.raw(`  ${c.dim(glyph.bullet)} ${c.value(String(agents.length))} ${c.dim("agents")}`);
  }
  log.raw(`  ${c.dim("tip: copy the")} ${c.brand("ref")} ${c.dim("column to use any command, e.g.")} ${c.value("aip resolve <ref>")}`);
  log.blank();
}
