/**
 * Shared interactive prompts for the CLI.
 *
 * When a command is invoked without required arguments and the
 * process is attached to a TTY, callers should fall back to the
 * helpers here instead of erroring out. The intent is "no required
 * argument means: ask the user."
 *
 * Each helper throws an AipError if the user cancels (Ctrl-C / Esc).
 */
import * as p from "@clack/prompts";
import type { ApiClient } from "./api-client.js";
import { AgentListResponseSchema, type ListedAgent } from "./agent-list.js";
import { AipError, NotFoundError } from "./errors.js";

/**
 * Show a selectable list of marketplace agents and return the picked
 * DID. Fetches the live list from /api/agent-card?list=true.
 */
export async function pickAgentInteractively(
  api: ApiClient,
  opts: { message?: string } = {},
): Promise<string> {
  const listResp = await api.get("/api/agent-card", AgentListResponseSchema, {
    query: { list: true },
  });
  if (listResp.agents.length === 0) {
    throw new NotFoundError("No agents available on the marketplace");
  }
  const choice = await p.select({
    message: opts.message ?? "Pick an agent",
    options: listResp.agents.map((a: ListedAgent) => ({
      value: a.did,
      label: `${a.name}  ${a.type}`,
      hint: `${a.capabilities[0]?.pricing.amount ?? "?"} USDC`,
    })),
  });
  if (p.isCancel(choice)) {
    p.cancel("Cancelled.");
    throw new AipError("Cancelled");
  }
  return String(choice);
}

/**
 * Prompt the user for a single line of text. Used when a command
 * argument like a prompt body / agent name / capability id is omitted
 * but stdin is interactive.
 */
export async function promptForText(
  message: string,
  opts: { placeholder?: string } = {},
): Promise<string> {
  const text = await p.text({
    message,
    placeholder: opts.placeholder,
    validate: (v) => (v && v.trim().length > 0 ? undefined : "Cannot be empty"),
  });
  if (p.isCancel(text)) {
    p.cancel("Cancelled.");
    throw new AipError("Cancelled");
  }
  return String(text).trim();
}

/**
 * Convenience: returns true if the current process can show
 * interactive prompts. Use this guard before calling the helpers
 * above so scripted invocations get a clear error instead of
 * silently waiting on a closed stdin.
 */
export function canPromptInteractively(): boolean {
  return Boolean(process.stdin.isTTY) && Boolean(process.stderr.isTTY);
}
