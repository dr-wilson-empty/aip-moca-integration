/**
 * Shared identity-resolution logic for the CLI.
 *
 * `aip resolve` (the command) is a thin wrapper around `runResolution`,
 * which classifies the input string (DID / URL / marketplace ref) and
 * dispatches to the appropriate resolver — on-chain via
 * `@aipagents/did-resolver`, off-chain via `probeAgentCard`, or
 * marketplace-only fallback via the `/api/agent-card` backend.
 *
 * This file is the source of truth for the resolution pipeline. Tests
 * and other commands that need to inspect an identifier should call
 * `runResolution` rather than re-implementing the dispatch.
 */
import ora from "ora";
import { loadConfig } from "./config.js";
import { buildResolver, classifyIdentityInput } from "./resolver.js";
import { probeAgentCard } from "./agent-card.js";
import { ApiClient } from "./api-client.js";
import { resolveAgent, isCanonicalAipDid, findMarketplaceAgent } from "./agent-resolver.js";
import { NotFoundError, ValidationError } from "./errors.js";
import { log } from "./logger.js";
import { type IdentityReport } from "../ui/card.js";

export interface ResolutionOptions {
  network?: "devnet" | "mainnet-beta";
  rpc?: string;
  json?: boolean;
}

/**
 * Inspect an identifier and return a structured report. The caller is
 * responsible for rendering — see `ui/card.ts:renderIdentityReport` and
 * `serializeIdentityReport` below.
 */
export async function runResolution(
  identifier: string,
  opts: ResolutionOptions,
): Promise<IdentityReport> {
  // Detect truncated DIDs — these usually come from copying a DID
  // straight out of `aip agents ls`, which shortens long pubkeys
  // for terminal display.
  if (identifier.includes("…") || /\.{3,}/.test(identifier)) {
    throw new ValidationError(
      `This DID looks shortened (contains an ellipsis): '${identifier}'`,
      "Terminal tables truncate long base58 pubkeys for display. " +
      "Use the 'ref' column from `aip agents ls` instead, e.g. " +
      "`aip resolve summary-agent` or `aip resolve web-search`.",
    );
  }

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

async function tryMarketplaceFallback(
  did: string,
  reason: "non-canonical-did" | "no-base58-owner",
): Promise<IdentityReport | undefined> {
  const config = await loadConfig();
  const api = new ApiClient({ baseUrl: config.apiUrl });
  try {
    const card = await findMarketplaceAgent(did, api);
    if (!card) return undefined;
    return { kind: "marketplace-only", did, card, reason };
  } catch {
    return undefined;
  }
}

async function resolveAipDid(
  did: string,
  opts: ResolutionOptions,
): Promise<IdentityReport> {
  if (!isCanonicalAipDid(did)) {
    const fallback = await tryMarketplaceFallback(did, "no-base58-owner");
    if (fallback) return fallback;
    // Else fall through to on-chain attempt so the user still sees a clear error.
  }

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
      /* invalid DID format - pda stays undefined */
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

/**
 * Flatten the report into something safe for `JSON.stringify` — main
 * concern is the bigints inside `AgentRecord`, which throw otherwise.
 */
export function serializeIdentityReport(report: IdentityReport): unknown {
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
    case "marketplace-only":
      return { kind: report.kind, did: report.did, card: report.card, reason: report.reason };
  }
}
