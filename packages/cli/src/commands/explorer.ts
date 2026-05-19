import { Command } from "commander";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { loadConfig } from "../core/config.js";
import { explorerAddressUrl, explorerTxUrl } from "../core/format.js";
import { log } from "../core/logger.js";
import { c } from "../core/theme.js";

interface ExplorerOpts {
  network?: "devnet" | "mainnet-beta";
  open?: boolean;
  tx?: boolean;
  address?: boolean;
}

export function explorerCommand(): Command {
  return new Command("explorer")
    .description("Print a Solana Explorer URL for a tx signature or an address")
    .argument("<id>", "Transaction signature or Solana address")
    .option("-n, --network <cluster>", "Override network (devnet | mainnet-beta)")
    .option("--open", "Open the URL in the default browser")
    .option("--tx", "Treat the argument as a transaction signature")
    .option("--address", "Treat the argument as an address")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip explorer 7imsPo1owz6arqjqHpHvEfNgTepXnm9vtjmHQoVWmABX
  $ aip explorer 5xK9b2Pq... --tx --open
  $ aip explorer <id> --network mainnet-beta
`,
    )
    .action(async (id: string, opts: ExplorerOpts) => {
      const config = await loadConfig();
      const cluster = opts.network ?? config.network;

      const looksLikeTx = opts.tx || (!opts.address && id.length > 60);
      const url = looksLikeTx ? explorerTxUrl(id, cluster) : explorerAddressUrl(id, cluster);

      log.raw(url);

      if (opts.open) {
        openInBrowser(url);
      }
    });
}

function openInBrowser(url: string): void {
  let command: string;
  let args: string[];
  switch (platform()) {
    case "darwin":
      command = "open";
      args = [url];
      break;
    case "win32":
      command = "cmd";
      args = ["/c", "start", "", url];
      break;
    default:
      command = "xdg-open";
      args = [url];
  }
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    /* swallow — URL is already on stdout */
  }
}
