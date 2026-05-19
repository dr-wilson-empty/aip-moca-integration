import { c, glyph } from "../core/theme.js";
import { log } from "../core/logger.js";
import { shortenAddress } from "../core/format.js";
import type { AgentDetail, AgentStatus } from "../core/agent-list.js";

const SEPARATOR = "─".repeat(56);

function header(title: string, subtitle?: string): void {
  log.blank();
  log.raw(`  ${c.dim(SEPARATOR)}`);
  log.raw(`  ${c.brandBold(title)}`);
  if (subtitle) log.raw(`  ${c.dim(subtitle)}`);
  log.raw(`  ${c.dim(SEPARATOR)}`);
  log.blank();
}

function rows(pairs: Array<[string, string]>): void {
  if (pairs.length === 0) return;
  const width = Math.max(...pairs.map(([l]) => l.length));
  for (const [l, v] of pairs) {
    log.raw(`  ${c.label(l.padEnd(width))}  ${v}`);
  }
}

export interface AgentDetailReport {
  agent: AgentDetail;
  status?: AgentStatus;
}

export function renderAgentDetail({ agent, status }: AgentDetailReport): void {
  header(agent.name, agent.did);

  const statusText = status
    ? status.online
      ? `${c.success("●")} ${c.success("online")} ${c.dim(`${status.latencyMs}ms`)}`
      : `${c.dim("○")} ${c.dim("offline")}`
    : c.dim("(unknown)");

  const tags: string[] = [];
  if (agent.onChain) tags.push(c.brand("on-chain"));
  if (agent.hasMcp) tags.push(c.accent("mcp"));
  if (agent.source) tags.push(c.dim(agent.source));

  rows([
    ["status", statusText],
    ["type", c.value(agent.type)],
    ["version", c.value(agent.version)],
    ["endpoint", c.value(agent.endpoint)],
    ...(agent.walletAddress
      ? [["wallet", c.value(shortenAddress(agent.walletAddress)) + c.dim(`  ${agent.walletAddress}`)] as [string, string]]
      : []),
    ...(tags.length > 0 ? [["tags", tags.join(" ")] as [string, string]] : []),
  ]);

  if (agent.description) {
    log.blank();
    log.raw(`  ${c.dim(agent.description)}`);
  }

  log.blank();
  log.raw(`  ${c.label("capabilities")}`);
  const idWidth = Math.max(...agent.capabilities.map((cap) => cap.id.length));
  for (const cap of agent.capabilities) {
    const price = `${cap.pricing.amount} ${cap.pricing.token}`;
    log.raw(
      `    ${c.brand(glyph.bullet)} ${c.value(cap.id.padEnd(idWidth))}  ${c.success(price)}`,
    );
    if (cap.description) log.raw(`      ${c.dim(cap.description)}`);
  }
  log.blank();
}
