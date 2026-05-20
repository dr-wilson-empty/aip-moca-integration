import type { AgentRecord, DidDocument, ResolutionMetadata } from "@aipagents/did-resolver";
import type { AgentCard, ProbeResult } from "../core/agent-card.js";
import { c, glyph } from "../core/theme.js";
import { log } from "../core/logger.js";
import {
  explorerAddressUrl,
  formatTimestamp,
  lamportsToSol,
  shortenAddress,
} from "../core/format.js";

export interface OnChainReport {
  kind: "on-chain";
  did: string;
  record: AgentRecord;
  metadata: ResolutionMetadata;
  document: DidDocument;
}

export interface OnChainMissingReport {
  kind: "on-chain-missing";
  did: string;
  pda?: string;
  cluster: "devnet" | "mainnet-beta";
  reason: "not-found" | "invalid-did" | "decode-failed";
}

export interface UrlReport {
  kind: "url-probe";
  input: string;
  probe: ProbeResult;
}

export interface UnsupportedDidReport {
  kind: "unsupported-did";
  method: string;
  did: string;
}

export interface MarketplaceOnlyReport {
  kind: "marketplace-only";
  did: string;
  card: AgentCard;
  /** Why on-chain resolution was skipped */
  reason: "non-canonical-did" | "no-base58-owner";
}

export type IdentityReport =
  | OnChainReport
  | OnChainMissingReport
  | UrlReport
  | UnsupportedDidReport
  | MarketplaceOnlyReport;

const SEPARATOR = "─".repeat(56);

function header(title: string, subtitle?: string): void {
  log.blank();
  log.raw(`  ${c.dim(SEPARATOR)}`);
  log.raw(`  ${c.brandBold(title)}`);
  if (subtitle) log.raw(`  ${c.dim(subtitle)}`);
  log.raw(`  ${c.dim(SEPARATOR)}`);
  log.blank();
}

function row(label: string, value: string, labelWidth: number): void {
  log.raw(`  ${c.label(label.padEnd(labelWidth))}  ${value}`);
}

function rows(pairs: Array<[string, string]>): void {
  const width = Math.max(...pairs.map(([l]) => l.length));
  for (const [l, v] of pairs) row(l, v, width);
}

function statusBadge(ok: boolean, text: string): string {
  return ok ? `${c.success(glyph.success)} ${c.success(text)}` : `${c.error(glyph.failure)} ${c.error(text)}`;
}

function renderCapabilitiesFromCard(caps: AgentCard["capabilities"]): void {
  if (caps.length === 0) return;
  log.blank();
  log.raw(`  ${c.label("capabilities")}`);
  const idWidth = Math.max(...caps.map((cap) => cap.id.length));
  for (const cap of caps) {
    const price = `${cap.pricing.amount} ${cap.pricing.token}`;
    log.raw(
      `    ${c.brand(glyph.bullet)} ${c.value(cap.id.padEnd(idWidth))}  ${c.success(price)}`,
    );
    if (cap.description) log.raw(`      ${c.dim(cap.description)}`);
  }
}

function renderCapabilitiesFromRecord(caps: AgentRecord["capabilities"]): void {
  if (caps.length === 0) return;
  log.blank();
  log.raw(`  ${c.label("capabilities")}`);
  const nameWidth = Math.max(...caps.map((cap) => cap.name.length));
  for (const cap of caps) {
    log.raw(`    ${c.brand(glyph.bullet)} ${c.value(cap.name.padEnd(nameWidth))}`);
    if (cap.description) log.raw(`      ${c.dim(cap.description)}`);
  }
}

export function renderIdentityReport(report: IdentityReport): void {
  switch (report.kind) {
    case "on-chain":
      return renderOnChain(report);
    case "on-chain-missing":
      return renderOnChainMissing(report);
    case "url-probe":
      return renderUrlProbe(report);
    case "unsupported-did":
      return renderUnsupportedDid(report);
    case "marketplace-only":
      return renderMarketplaceOnly(report);
  }
}

function renderMarketplaceOnly({ did, card, reason }: MarketplaceOnlyReport): void {
  header(card.name, did);
  rows([
    ["status", statusBadge(true, "marketplace-listed (off-chain only)")],
    ["type", c.value(card.type)],
    ["version", c.value(card.version)],
    ["endpoint", c.value(card.endpoint)],
    ...(card.walletAddress
      ? [["wallet", c.value(card.walletAddress)] as [string, string]]
      : []),
  ]);

  renderCapabilitiesFromCard(card.capabilities);

  log.blank();
  const explanation =
    reason === "no-base58-owner"
      ? "DID owner segment is not a valid 32-byte base58 pubkey (e.g. 'platform' / 'sdk' / truncated)."
      : "DID is not in canonical did:aip:<owner-pubkey>:<agent-id> form.";
  log.raw(`  ${c.dim(explanation)}`);
  log.raw(`  ${c.dim("On-chain registry lookup was skipped because no PDA can be derived.")}`);
  log.raw(`  ${c.dim("Marketplace data above comes from the backend's AgentCard registry.")}`);
  log.blank();
}

function renderOnChain({ record, metadata, did }: OnChainReport): void {
  header(record.name, did);

  const cluster = metadata.network.includes("mainnet") ? "mainnet-beta" : "devnet";
  rows([
    ["status", statusBadge(true, "resolved on-chain")],
    ["type", c.value(record.agentType)],
    ["owner", c.value(shortenAddress(record.owner)) + c.dim(`  ${record.owner}`)],
    ["wallet", c.value(shortenAddress(record.walletAddress)) + c.dim(`  ${record.walletAddress}`)],
    ["endpoint", c.value(record.endpoint)],
    ["version", c.value(record.version)],
    ["price hint", `${c.value(lamportsToSol(record.pricePerTask))} ${c.dim("SOL  (price_per_task lamports)")}`],
    ["registered", c.value(formatTimestamp(new Date(Number(record.registeredAt) * 1000)))],
    ["updated", c.value(formatTimestamp(new Date(Number(record.updatedAt) * 1000)))],
    ["pda", c.value(shortenAddress(metadata.pda)) + c.dim(`  slot ${metadata.slot}`)],
    ["network", c.value(metadata.network)],
  ]);

  renderCapabilitiesFromRecord(record.capabilities);

  log.blank();
  log.raw(`  ${c.label("explorer")}  ${c.underline(c.brand(explorerAddressUrl(metadata.pda, cluster)))}`);
  log.blank();
}

function renderOnChainMissing({ did, pda, cluster, reason }: OnChainMissingReport): void {
  const titles: Record<OnChainMissingReport["reason"], string> = {
    "not-found": "Unregistered DID",
    "invalid-did": "Invalid DID format",
    "decode-failed": "Record exists but cannot be decoded",
  };
  const statuses: Record<OnChainMissingReport["reason"], string> = {
    "not-found": "no record at derived PDA",
    "invalid-did": "DID does not match did:aip format",
    "decode-failed": "PDA holds data, but the layout did not match this CLI's expected schema",
  };
  const explanations: Record<OnChainMissingReport["reason"], string[]> = {
    "not-found": [
      "This DID parses cleanly but no agent record exists at the derived PDA.",
      "The agent may be deactivated, deregistered, or never registered.",
    ],
    "invalid-did": [
      "Expected: did:aip:<base58-owner-pubkey>:<agent-id>",
    ],
    "decode-failed": [
      "The on-chain account exists but its data could not be decoded.",
      "Likely a registry program version mismatch - the agent may need to be re-registered.",
    ],
  };

  header(titles[reason], did);
  rows([
    ["status", statusBadge(false, statuses[reason])],
    ["network", c.value(`solana:${cluster}`)],
    ...(pda ? [["pda (derived)", c.value(pda)] as [string, string]] : []),
  ]);

  log.blank();
  for (const line of explanations[reason]) log.raw(`  ${c.dim(line)}`);
  log.blank();
}

function renderUrlProbe({ input, probe }: UrlReport): void {
  if (probe.ok && probe.card) {
    header(probe.card.name, probe.card.did);
    rows([
      ["status", statusBadge(true, "AIP-compliant AgentCard found")],
      ["source", c.value(probe.url) + c.dim("  off-chain probe")],
      ["type", c.value(probe.card.type)],
      ["version", c.value(probe.card.version)],
      ["endpoint", c.value(probe.card.endpoint)],
      ...(probe.card.walletAddress
        ? [["wallet", c.value(probe.card.walletAddress)] as [string, string]]
        : []),
    ]);
    renderCapabilitiesFromCard(probe.card.capabilities);
    log.blank();
    log.raw(
      `  ${c.dim("This agent published an AgentCard but is not necessarily registered on-chain.")}`,
    );
    log.raw(`  ${c.dim("Run 'aip resolve ' + did to verify on-chain identity.")}`);
    log.blank();
    return;
  }

  header("Not AIP-compliant", input);
  rows([
    ["status", statusBadge(false, "no AgentCard")],
    ["probed", c.dim(probe.url)],
    ["reason", c.warning(probe.reason ?? "unknown")],
  ]);
  log.blank();
  log.raw(`  ${c.dim("This agent does not publish a verifiable AIP identity. That means:")}`);
  log.raw(`    ${c.dim(glyph.bullet)} No cryptographic ownership proof`);
  log.raw(`    ${c.dim(glyph.bullet)} No transparent pricing`);
  log.raw(`    ${c.dim(glyph.bullet)} No on-chain pay-on-completion guarantee`);
  log.blank();
  log.raw(`  ${c.dim("Help them adopt the standard:")} ${c.underline(c.brand("https://aipagents.xyz"))}`);
  log.blank();
}

function renderUnsupportedDid({ method, did }: UnsupportedDidReport): void {
  header("Unsupported DID method", did);
  rows([
    ["status", statusBadge(false, `did:${method} is not supported`)],
    ["accepted", c.dim("did:aip · http(s)://...")],
  ]);
  log.blank();
}
