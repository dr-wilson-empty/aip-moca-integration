import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "../core/config.js";
import { buildResolver, classifyIdentityInput } from "../core/resolver.js";
import { probeAgentCard } from "../core/agent-card.js";
import { ApiClient } from "../core/api-client.js";
import { resolveAgent } from "../core/agent-resolver.js";
import { NotFoundError, ValidationError } from "../core/errors.js";
import { log } from "../core/logger.js";
import { c } from "../core/theme.js";
import { renderIdentityReport, type IdentityReport } from "../ui/card.js";

interface WhoisOptions {
  network?: "devnet" | "mainnet-beta";
  rpc?: string;
  json?: boolean;
}

export function whoisCommand(): Command {
  return new Command("whois")
    .description("Inspect an agent's identity by DID or URL")
    .argument("<identifier>", "did:aip:… or http(s)://…")
    .option(
      "-n, --network <cluster>",
      "Override network (devnet | mainnet-beta)",
      (value: string) => {
        if (value !== "devnet" && value !== "mainnet-beta") {
          throw new ValidationError(`Unknown network '${value}'`, "Use 'devnet' or 'mainnet-beta'.");
        }
        return value;
      },
    )
    .option("--rpc <url>", "Override Solana RPC endpoint for this call")
    .option("--json", "Print machine-readable JSON instead of the rendered report")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip whois did:aip:7imsPo1owz6arqjqHpHvEfNgTepXnm9vtjmHQoVWmABX:translator
  $ aip whois https://my-agent.example.com
  $ aip whois did:aip:… --network mainnet-beta --rpc https://rpc.example.com
  $ aip whois https://my-agent.example.com --json | jq .capabilities
`,
    )
    .action(async (identifier: string, opts: WhoisOptions) => {
      const report = await runWhois(identifier, opts);
      if (opts.json) {
        log.raw(JSON.stringify(serializeReport(report), null, 2));
      } else {
        renderIdentityReport(report);
      }
    });
}

async function runWhois(identifier: string, opts: WhoisOptions): Promise<IdentityReport> {
  const classified = classifyIdentityInput(identifier);

  if (classified.kind === "unknown") {
    // Last chance: maybe a marketplace short name (e.g. "summary").
    const config = await loadConfig();
    const api = new ApiClient({ baseUrl: config.apiUrl });
    try {
      const resolution = await resolveAgent(classified.raw, api);
      const reclassified = classifyIdentityInput(resolution.did);
      if (reclassified.kind === "aip-did") {
        return await resolveAipDid(reclassified.did, opts);
      }
      throw new ValidationError(
        `Resolved '${classified.raw}' → ${resolution.did}, but that DID isn't did:aip and cannot be inspected here.`,
      );
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw new ValidationError(
          `Cannot tell whether '${classified.raw}' is a DID, URL, or marketplace name`,
          "Expected: 'did:aip:…', 'https://…', or an agent name from 'aip agents ls'.",
        );
      }
      throw err;
    }
  }

  if (classified.kind === "other-did") {
    return { kind: "unsupported-did", method: classified.method, did: classified.did };
  }

  if (classified.kind === "url") {
    const spinner = startSpinner(`Probing ${classified.url}`);
    try {
      const probe = await probeAgentCard(classified.url);
      spinner.stop();
      return { kind: "url-probe", input: classified.url, probe };
    } catch (err) {
      spinner.stop();
      throw err;
    }
  }

  return await resolveAipDid(classified.did, opts);
}

async function resolveAipDid(
  did: string,
  opts: WhoisOptions,
): Promise<IdentityReport> {
  const config = await loadConfig();
  const ctx = buildResolver(config, { network: opts.network, rpcUrl: opts.rpc });
  const spinner = startSpinner(`Resolving ${did} on ${ctx.network}`);
  try {
    const result = await ctx.resolver.resolve(did);
    spinner.stop();

    if (
      result.didDocument &&
      result.agentRecord &&
      "contentType" in result.didResolutionMetadata
    ) {
      return {
        kind: "on-chain",
        did,
        record: result.agentRecord,
        metadata: result.didResolutionMetadata,
        document: result.didDocument,
      };
    }

    let pda: string | undefined;
    try {
      pda = ctx.resolver.derivePda(did).pda.toBase58();
    } catch {
      /* invalid DID format — pda stays undefined */
    }

    const errorCode =
      "error" in result.didResolutionMetadata
        ? result.didResolutionMetadata.error
        : "notFound";
    const reason: "not-found" | "invalid-did" | "decode-failed" =
      errorCode === "invalidDid"
        ? "invalid-did"
        : errorCode === "internalError"
          ? "decode-failed"
          : "not-found";

    return {
      kind: "on-chain-missing",
      did,
      pda,
      cluster: ctx.cluster,
      reason,
    };
  } catch (err) {
    spinner.stop();
    throw err;
  }
}

function startSpinner(text: string): { stop: () => void } {
  if (!process.stderr.isTTY) {
    log.step(text);
    return { stop: () => {} };
  }
  const spinner = ora({ text, stream: process.stderr, color: "cyan" }).start();
  return { stop: () => spinner.stop() };
}

function serializeReport(report: IdentityReport): unknown {
  switch (report.kind) {
    case "on-chain":
      return {
        kind: report.kind,
        did: report.did,
        document: report.document,
        record: {
          ...report.record,
          pricePerTask: report.record.pricePerTask.toString(),
          registeredAt: report.record.registeredAt.toString(),
          updatedAt: report.record.updatedAt.toString(),
        },
        metadata: report.metadata,
      };
    case "on-chain-missing":
      return { kind: report.kind, did: report.did, pda: report.pda, cluster: report.cluster };
    case "url-probe":
      return { kind: report.kind, input: report.input, probe: report.probe };
    case "unsupported-did":
      return { kind: report.kind, did: report.did, method: report.method };
  }
}
