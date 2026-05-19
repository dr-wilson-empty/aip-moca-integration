import { c, glyph } from "../core/theme.js";
import { log } from "../core/logger.js";
import { explorerAddressUrl, formatTimestamp } from "../core/format.js";
import type { Balances } from "../core/solana.js";

const SEPARATOR = "─".repeat(56);

function header(title: string, subtitle?: string): void {
  log.blank();
  log.raw(`  ${c.dim(SEPARATOR)}`);
  log.raw(`  ${c.brandBold(title)}`);
  if (subtitle) log.raw(`  ${c.value(subtitle)}`);
  log.raw(`  ${c.dim(SEPARATOR)}`);
  log.blank();
}

function row(label: string, value: string, width: number): void {
  log.raw(`  ${c.label(label.padEnd(width))}  ${value}`);
}

function rows(pairs: Array<[string, string]>): void {
  const width = Math.max(...pairs.map(([l]) => l.length));
  for (const [l, v] of pairs) row(l, v, width);
}

export interface WalletReport {
  publicKey: string;
  keystorePath: string;
  cluster: "devnet" | "mainnet-beta";
  createdAt: string;
  balances?: Balances;
  balanceError?: string;
}

function formatSol(amount: number): string {
  return amount.toFixed(4);
}

function formatUsdc(amount: number): string {
  return amount.toFixed(2);
}

export function renderWalletReport(report: WalletReport): void {
  header("wallet", report.publicKey);

  const pairs: Array<[string, string]> = [
    ["keystore", c.value(report.keystorePath)],
    ["network", c.value(`solana:${report.cluster}`)],
    ["created", c.value(formatTimestamp(report.createdAt))],
  ];

  if (report.balances) {
    pairs.push([
      "SOL",
      `${c.value(formatSol(report.balances.sol))} ${c.dim("SOL")} ${c.dim(`(${report.cluster})`)}`,
    ]);
    pairs.push([
      "USDC",
      `${c.value(formatUsdc(report.balances.usdc))} ${c.dim("USDC")} ${c.dim(`(${report.cluster})`)}`,
    ]);
  } else if (report.balanceError) {
    pairs.push(["balances", c.warning(`${glyph.warn} ${report.balanceError}`)]);
  }

  rows(pairs);

  log.blank();
  log.raw(
    `  ${c.label("explorer")}  ${c.underline(c.brand(explorerAddressUrl(report.publicKey, report.cluster)))}`,
  );
  log.blank();
}

export function renderLoginSuccess(opts: {
  publicKey: string;
  keystorePath: string;
  cluster: "devnet" | "mainnet-beta";
  generated: boolean;
}): void {
  header(opts.generated ? "wallet created" : "wallet imported", opts.publicKey);
  rows([
    ["keystore", c.value(opts.keystorePath)],
    ["network", c.value(`solana:${opts.cluster}`)],
  ]);
  log.blank();
  log.raw(
    `  ${c.warning(glyph.warn)} ${c.warning("Back up the keystore file and remember the passphrase.")}`,
  );
  log.raw(`  ${c.dim("Without both, this wallet cannot be recovered.")}`);
  log.blank();
}
