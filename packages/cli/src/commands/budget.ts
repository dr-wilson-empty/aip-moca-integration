import { Command } from "commander";
import { z } from "zod";
import { ApiClient } from "../core/api-client.js";
import { loadConfig } from "../core/config.js";
import { log } from "../core/logger.js";
import { c, glyph } from "../core/theme.js";
import { NetworkError, NotFoundError, ValidationError } from "../core/errors.js";
import { formatTimestamp, shortenAddress } from "../core/format.js";

const BudgetSchema = z
  .object({
    agentDid: z.string(),
    ownerWallet: z.string(),
    available: z.union([z.number(), z.string()]),
    reserved: z.union([z.number(), z.string()]).optional(),
    spent: z.union([z.number(), z.string()]).optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

const BudgetInfoResponseSchema = z.object({
  budget: BudgetSchema.nullable(),
  transactions: z.array(z.unknown()).optional(),
});

const OwnerBudgetsResponseSchema = z.object({
  budgets: z.array(BudgetSchema),
});

type Budget = z.infer<typeof BudgetSchema>;

interface InfoOpts {
  owner?: string;
  history?: boolean;
  json?: boolean;
}

export function budgetCommand(): Command {
  const cmd = new Command("budget")
    .description("Inspect agent operating budgets used for orchestrator delegation")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip budget info did:aip:platform:summary-agent
  $ aip budget info did:aip:platform:summary-agent --history
  $ aip budget info --owner 7imsPo1owz6arqjqHpHvEfNgTepXnm9vtjmHQoVWmABX
  $ aip budget info <did> --json

${c.dim("Deposit / withdraw require an on-chain transfer. Phase 9 will add:")}
  ${c.dim("aip budget deposit / aip budget withdraw")}
`,
    );

  cmd
    .command("info [did]")
    .description("Show a budget summary (by DID or by owner)")
    .option("-o, --owner <pubkey>", "List all budgets for an owner wallet")
    .option("--history", "Include the transaction history (DID mode only)")
    .option("--json", "Print machine-readable JSON")
    .action(async (did: string | undefined, opts: InfoOpts) => {
      await runBudgetInfo(did, opts);
    });

  return cmd;
}

async function runBudgetInfo(did: string | undefined, opts: InfoOpts): Promise<void> {
  if (!did && !opts.owner) {
    throw new ValidationError(
      "Provide either an agent DID or --owner <pubkey>",
      "Run 'aip agents ls' to find DIDs, or 'aip whoami' for your owner address.",
    );
  }
  if (did && opts.owner) {
    throw new ValidationError("Choose one of [DID] or --owner, not both");
  }

  const config = await loadConfig();
  const api = new ApiClient({ baseUrl: config.apiUrl });

  if (did) {
    const resp = await fetchOne(api, did, Boolean(opts.history));
    if (opts.json) {
      log.raw(JSON.stringify(resp, null, 2));
      return;
    }
    renderSingle(resp.budget, did);
    if (opts.history && resp.transactions && resp.transactions.length > 0) {
      renderTransactions(resp.transactions);
    }
    return;
  }

  const owner = opts.owner!;
  const resp = await fetchOwner(api, owner);
  if (opts.json) {
    log.raw(JSON.stringify(resp, null, 2));
    return;
  }
  renderOwner(owner, resp.budgets);
}

async function fetchOne(api: ApiClient, did: string, history: boolean) {
  try {
    return await api.get("/api/budget", BudgetInfoResponseSchema, {
      query: { agentDid: did, ...(history ? { history: true } : {}) },
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new NotFoundError(`No budget for ${did}`);
    }
    if (err instanceof NetworkError && err.status === 404) {
      throw new NotFoundError(`No budget for ${did}`);
    }
    throw err;
  }
}

async function fetchOwner(api: ApiClient, owner: string) {
  return api.get("/api/budget", OwnerBudgetsResponseSchema, {
    query: { owner },
  });
}

function asNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

function renderSingle(budget: Budget | null, did: string): void {
  log.blank();
  log.raw(`  ${c.dim("─".repeat(56))}`);
  log.raw(`  ${c.brandBold("budget")} ${c.dim(did)}`);
  log.raw(`  ${c.dim("─".repeat(56))}`);
  log.blank();
  if (!budget) {
    log.raw(`  ${c.warning(glyph.warn)} ${c.warning("No budget on file.")}`);
    log.raw(`  ${c.dim("Top up via the website once 'aip budget deposit' lands (phase 9).")}`);
    log.blank();
    return;
  }

  const rows: Array<[string, string]> = [
    ["owner", c.value(shortenAddress(budget.ownerWallet)) + c.dim(`  ${budget.ownerWallet}`)],
    ["available", `${c.success(asNumber(budget.available).toFixed(2))} ${c.dim("USDC")}`],
  ];
  if (budget.reserved !== undefined) {
    rows.push(["reserved", `${c.warning(asNumber(budget.reserved).toFixed(2))} ${c.dim("USDC")}`]);
  }
  if (budget.spent !== undefined) {
    rows.push(["spent", `${c.dim(asNumber(budget.spent).toFixed(2))} ${c.dim("USDC")}`]);
  }
  if (budget.updatedAt) {
    rows.push(["updated", c.value(formatTimestamp(budget.updatedAt))]);
  }
  const width = Math.max(...rows.map(([l]) => l.length));
  for (const [l, v] of rows) {
    log.raw(`  ${c.label(l.padEnd(width))}  ${v}`);
  }
  log.blank();
}

function renderTransactions(transactions: unknown[]): void {
  log.raw(`  ${c.label("history")}`);
  for (const raw of transactions.slice(0, 20)) {
    const obj = raw as Record<string, unknown>;
    const ts = typeof obj.createdAt === "string" ? formatTimestamp(obj.createdAt) : "?";
    const kind = String(obj.kind ?? obj.type ?? "?");
    const amount = asNumber(obj.amount).toFixed(4);
    log.raw(`    ${c.dim(glyph.bullet)} ${c.value(ts)}  ${c.brand(kind.padEnd(10))} ${c.success(amount)} ${c.dim("USDC")}`);
  }
  log.blank();
}

function renderOwner(owner: string, budgets: Budget[]): void {
  log.blank();
  log.raw(`  ${c.brand("budgets for")} ${c.value(owner)}`);
  log.blank();
  if (budgets.length === 0) {
    log.raw(`  ${c.dim("(none)")}`);
    log.blank();
    return;
  }
  for (const budget of budgets) {
    log.raw(
      `  ${c.dim(glyph.bullet)} ${c.value(budget.agentDid)}  ${c.success(asNumber(budget.available).toFixed(2))} ${c.dim("USDC")}`,
    );
  }
  log.blank();
}
