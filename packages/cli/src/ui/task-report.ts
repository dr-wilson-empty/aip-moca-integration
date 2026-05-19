import { c, glyph } from "../core/theme.js";
import { log } from "../core/logger.js";
import { explorerTxUrl } from "../core/format.js";
import type { Task, TaskState } from "../core/task-types.js";

const SEPARATOR = "─".repeat(56);

function header(title: string, subtitle?: string): void {
  log.blank();
  log.raw(`  ${c.dim(SEPARATOR)}`);
  log.raw(`  ${c.brandBold(title)}`);
  if (subtitle) log.raw(`  ${c.dim(subtitle)}`);
  log.raw(`  ${c.dim(SEPARATOR)}`);
  log.blank();
}

function stateBadge(state: TaskState): string {
  switch (state) {
    case "COMPLETED":
      return `${c.success(glyph.success)} ${c.success(state)}`;
    case "FAILED":
    case "CANCELLED":
      return `${c.error(glyph.failure)} ${c.error(state)}`;
    case "WORKING":
      return `${c.warning(glyph.pending)} ${c.warning(state)}`;
    case "SUBMITTED":
      return `${c.dim(glyph.bullet)} ${c.dim(state)}`;
  }
}

function rows(pairs: Array<[string, string]>): void {
  const width = Math.max(...pairs.map(([l]) => l.length));
  for (const [l, v] of pairs) log.raw(`  ${c.label(l.padEnd(width))}  ${v}`);
}

export function renderTaskSummary(task: Task, cluster: "devnet" | "mainnet-beta"): void {
  header("task", task.id);
  const pairs: Array<[string, string]> = [
    ["state", stateBadge(task.state)],
    ["agent", c.value(task.counterpartAgent)],
    ["capability", c.value(task.capability)],
    ["spent", `${c.value(task.usdcSpent)} ${c.dim("USDC")}`],
    ["started", c.value(task.startedAt)],
    ["duration", c.value(task.duration)],
  ];
  if (task.escrowTxHash) {
    pairs.push(["escrow tx", c.underline(c.brand(explorerTxUrl(task.escrowTxHash, cluster)))]);
  }
  if (task.settlementTxHash) {
    pairs.push(["settlement tx", c.underline(c.brand(explorerTxUrl(task.settlementTxHash, cluster)))]);
  }
  rows(pairs);

  if (task.artifact || task.parsedArtifact) {
    log.blank();
    log.raw(`  ${c.label("artifact")}`);
    const content =
      task.parsedArtifact?.content ??
      task.artifact ??
      JSON.stringify(task.parsedArtifact?.data ?? {}, null, 2);
    for (const line of content.split("\n")) {
      log.raw(`    ${c.value(line)}`);
    }
  }

  log.blank();
}

export function renderStreamEvent(event: {
  event: string;
  data: string;
}): void {
  if (event.event === "end") {
    try {
      const parsed = JSON.parse(event.data) as {
        state?: TaskState;
        artifact?: string | null;
        escrowTxHash?: string;
      };
      log.blank();
      log.raw(`  ${stateBadge(parsed.state ?? "COMPLETED")}`);
      if (parsed.artifact) {
        log.blank();
        for (const line of parsed.artifact.split("\n")) {
          log.raw(`    ${c.value(line)}`);
        }
      }
      log.blank();
    } catch {
      log.step(event.data);
    }
    return;
  }

  let line: string;
  try {
    const parsed = JSON.parse(event.data) as {
      eventType?: string;
      message?: string;
      timestamp?: string;
    };
    const tag = parsed.eventType ? c.brand(parsed.eventType) : c.dim("log");
    line = `${c.dim(glyph.bullet)} ${tag} ${c.value(parsed.message ?? event.data)}`;
  } catch {
    line = `${c.dim(glyph.bullet)} ${c.value(event.data)}`;
  }
  log.raw(`  ${line}`);
}
