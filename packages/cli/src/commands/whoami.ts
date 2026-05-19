import { Command } from "commander";
import ora from "ora";
import { Connection, PublicKey } from "@solana/web3.js";
import { loadConfig } from "../core/config.js";
import { loadKeystore } from "../core/wallet.js";
import { paths } from "../core/paths.js";
import { getBalances, rpcEndpointFor } from "../core/solana.js";
import { log } from "../core/logger.js";
import { c } from "../core/theme.js";
import { renderWalletReport, type WalletReport } from "../ui/wallet-report.js";

interface WhoamiOptions {
  network?: "devnet" | "mainnet-beta";
  rpc?: string;
  noBalance?: boolean;
  json?: boolean;
}

export function whoamiCommand(): Command {
  return new Command("whoami")
    .description("Show the active wallet, network, and balances")
    .option("-n, --network <cluster>", "Override network (devnet | mainnet-beta)")
    .option("--rpc <url>", "Override Solana RPC endpoint")
    .option("--no-balance", "Skip the RPC call for balances")
    .option("--json", "Print machine-readable JSON")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip whoami
  $ aip whoami --no-balance               ${c.dim("# offline-safe: skip RPC")}
  $ aip whoami --json | jq .publicKey
`,
    )
    .action(async (opts: WhoamiOptions) => {
      const report = await buildReport(opts);
      if (opts.json) {
        log.raw(
          JSON.stringify(
            {
              ...report,
              balances: report.balances
                ? {
                    sol: report.balances.sol,
                    solLamports: report.balances.solLamports.toString(),
                    usdc: report.balances.usdc,
                  }
                : null,
            },
            null,
            2,
          ),
        );
        return;
      }
      renderWalletReport(report);
    });
}

async function buildReport(opts: WhoamiOptions): Promise<WalletReport> {
  const keystore = await loadKeystore();
  const config = await loadConfig();
  const cluster = opts.network ?? config.network;

  const base: WalletReport = {
    publicKey: keystore.publicKey,
    keystorePath: paths.keystoreFile(),
    cluster,
    createdAt: keystore.createdAt,
  };

  if (opts.noBalance) return base;

  const rpcUrl = rpcEndpointFor(cluster, opts.rpc ?? config.rpcUrl);
  const spinner = startSpinner(`Fetching balances from ${rpcUrl}`);
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const balances = await getBalances(connection, new PublicKey(keystore.publicKey), cluster);
    spinner.stop();
    return { ...base, balances };
  } catch (err) {
    spinner.stop();
    return { ...base, balanceError: `RPC error: ${(err as Error).message}` };
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
