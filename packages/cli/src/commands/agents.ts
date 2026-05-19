import { Command } from "commander";
import ora from "ora";
import { ApiClient } from "../core/api-client.js";
import { loadConfig } from "../core/config.js";
import {
  AgentDetailResponseSchema,
  AgentListResponseSchema,
  AgentStatusListSchema,
  applyFilters,
  type AgentStatus,
  type ListFilters,
} from "../core/agent-list.js";
import { renderAgentTable } from "../ui/agent-table.js";
import { renderAgentDetail } from "../ui/agent-detail.js";
import { log } from "../core/logger.js";
import { c } from "../core/theme.js";
import { NetworkError, NotFoundError, ValidationError } from "../core/errors.js";
import { resolveAgent } from "../core/agent-resolver.js";

interface ListOpts {
  type?: "Task" | "LLM" | "Execution";
  maxPrice?: string;
  onlineOnly?: boolean;
  limit?: string;
  page?: string;
  noStatus?: boolean;
  json?: boolean;
}

interface ShowOpts {
  noStatus?: boolean;
  json?: boolean;
}

export function agentsCommand(): Command {
  const cmd = new Command("agents")
    .description("Discover marketplace agents")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip agents ls                                  ${c.dim("# all live agents")}
  $ aip agents ls --type Task --max-price 0.10
  $ aip agents ls --online-only
  $ aip agents ls --limit 10 --page 2
  $ aip agents ls --json | jq '.agents[].did'
  $ aip agents show did:aip:7im…:translator
`,
    );

  cmd
    .command("ls")
    .description("List agents")
    .option("-t, --type <kind>", "Filter by type (Task | LLM | Execution)", (v) => {
      if (v !== "Task" && v !== "LLM" && v !== "Execution") {
        throw new ValidationError(`Unknown type '${v}'`, "Use Task, LLM, or Execution.");
      }
      return v;
    })
    .option("-p, --max-price <usdc>", "Filter to agents with at least one capability ≤ this USDC price")
    .option("-o, --online-only", "Only show agents whose endpoint pings successfully")
    .option("-l, --limit <n>", "Page size (server-side)")
    .option("--page <n>", "Page number (server-side)")
    .option("--no-status", "Skip the status ping (faster, no online column)")
    .option("--json", "Print the raw JSON response")
    .action(async (opts: ListOpts) => {
      await runList(opts);
    });

  cmd
    .command("show <did>")
    .description("Show full detail for one agent")
    .option("--no-status", "Skip the status ping")
    .option("--json", "Print the raw JSON detail")
    .action(async (did: string, opts: ShowOpts) => {
      await runShow(did, opts);
    });

  return cmd;
}

async function runList(opts: ListOpts): Promise<void> {
  const config = await loadConfig();
  const client = new ApiClient({ baseUrl: config.apiUrl });

  const filters: ListFilters = {
    type: opts.type,
    maxPrice: parseFloatOrUndefined(opts.maxPrice, "--max-price"),
    onlineOnly: Boolean(opts.onlineOnly),
  };

  const spinner = startSpinner(`Fetching agents from ${config.apiUrl}`);

  const limitNum = parseIntOrUndefined(opts.limit, "--limit");
  const pageNum = parseIntOrUndefined(opts.page, "--page");
  const query: Record<string, string | number | boolean | undefined> = { list: true };
  if (limitNum !== undefined) query.limit = limitNum;
  if (pageNum !== undefined) query.page = pageNum;

  let listResp;
  try {
    listResp = await client.get("/api/agent-card", AgentListResponseSchema, { query });
  } catch (err) {
    spinner.stop();
    rethrowFriendly(err, config.apiUrl);
  }

  const wantStatus = !opts.noStatus || filters.onlineOnly;
  let statusByDid: Map<string, AgentStatus> | undefined;
  if (wantStatus) {
    try {
      const statuses = await client.get("/api/agent-card/status", AgentStatusListSchema);
      statusByDid = new Map(statuses.map((s) => [s.did, s]));
    } catch {
      statusByDid = undefined;
    }
  }
  spinner.stop();

  const filtered = applyFilters(listResp.agents, filters, statusByDid);

  if (opts.json) {
    const out = {
      agents: filtered,
      total: filtered.length,
      ...(listResp.page !== undefined ? { page: listResp.page } : {}),
      ...(listResp.totalPages !== undefined ? { totalPages: listResp.totalPages } : {}),
    };
    log.raw(JSON.stringify(out, null, 2));
    return;
  }

  renderAgentTable(filtered, statusByDid);

  if (listResp.totalPages && (listResp.page ?? 1) < listResp.totalPages) {
    log.raw(
      `  ${c.dim("page")} ${listResp.page}/${listResp.totalPages} ${c.dim(`— next: aip agents ls --limit ${listResp.limit} --page ${(listResp.page ?? 1) + 1}`)}`,
    );
    log.blank();
  }
}

async function runShow(identifier: string, opts: ShowOpts): Promise<void> {
  const config = await loadConfig();
  const client = new ApiClient({ baseUrl: config.apiUrl });

  const spinner = startSpinner(`Fetching ${identifier}`);
  let agent;
  let resolvedDid = identifier;
  try {
    const resolution = await resolveAgent(identifier, client);
    resolvedDid = resolution.did;
    agent = await client.get("/api/agent-card/detail", AgentDetailResponseSchema, {
      query: { did: resolvedDid },
    });
  } catch (err) {
    spinner.stop();
    if (err instanceof NotFoundError) {
      throw new NotFoundError(
        `Agent not found: ${identifier}`,
        "Use 'aip agents ls' to see what's available, or 'aip whois <did>' for a direct on-chain lookup.",
      );
    }
    rethrowFriendly(err, config.apiUrl);
  }

  let status: AgentStatus | undefined;
  if (!opts.noStatus) {
    try {
      const statuses = await client.get("/api/agent-card/status", AgentStatusListSchema);
      status = statuses.find((s) => s.did === resolvedDid);
    } catch {
      /* status is optional */
    }
  }
  spinner.stop();

  if (opts.json) {
    log.raw(JSON.stringify({ agent, status }, null, 2));
    return;
  }

  renderAgentDetail({ agent: agent!, status });
}

function startSpinner(text: string): { stop: () => void } {
  if (!process.stderr.isTTY) {
    log.step(text);
    return { stop: () => {} };
  }
  const spinner = ora({ text, stream: process.stderr, color: "cyan" }).start();
  return { stop: () => spinner.stop() };
}

function parseFloatOrUndefined(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError(`${flag} must be a non-negative number (got '${value}')`);
  }
  return n;
}

function parseIntOrUndefined(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new ValidationError(`${flag} must be a positive integer (got '${value}')`);
  }
  return n;
}

function rethrowFriendly(err: unknown, baseUrl: string): never {
  if (err instanceof NotFoundError) {
    throw new NetworkError(
      `Marketplace API not reachable at ${baseUrl}`,
      404,
      "The backend may be private or down. Set AIP_API_URL to a deployment you control, or start a local 'npm run dev' on the parent project.",
    );
  }
  if (err instanceof NetworkError) {
    throw err;
  }
  throw err as Error;
}
