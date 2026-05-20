import { Command } from "commander";
import * as p from "@clack/prompts";
import { deleteKeystore, keystoreExists } from "../core/wallet.js";
import { paths } from "../core/paths.js";
import { log } from "../core/logger.js";
import { c, glyph } from "../core/theme.js";
import { AipError } from "../core/errors.js";

interface LogoutOptions {
  purge?: boolean;
  yes?: boolean;
}

export function logoutCommand(): Command {
  return new Command("logout")
    .description("Sign out - and optionally delete the keystore file")
    .option("--purge", "Delete the keystore file from disk")
    .option("-y, --yes", "Skip the confirmation prompt (use with --purge)")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip logout                ${c.dim("# show what would happen, no destructive action")}
  $ aip logout --purge        ${c.dim("# delete the keystore (with confirmation)")}
  $ aip logout --purge --yes  ${c.dim("# delete without prompt (scripts)")}
`,
    )
    .action(async (opts: LogoutOptions) => {
      await runLogout(opts);
    });
}

async function runLogout(opts: LogoutOptions): Promise<void> {
  const exists = await keystoreExists();

  if (!exists) {
    log.info("No keystore on disk - nothing to do.");
    return;
  }

  if (!opts.purge) {
    log.blank();
    log.raw(`  ${c.dim("keystore:")} ${c.value(paths.keystoreFile())}`);
    log.blank();
    log.raw(`  ${c.warning(glyph.warn)} ${c.warning("aip does not yet cache session tokens, so 'logout' alone is a no-op.")}`);
    log.raw(`  ${c.dim("To remove the keystore file from disk, run:")} ${c.brand("aip logout --purge")}`);
    log.blank();
    return;
  }

  if (!opts.yes) {
    p.intro(c.error("aip logout --purge"));
    p.log.warn("This permanently deletes:");
    p.log.message(`  ${paths.keystoreFile()}`);
    p.log.message("");
    p.log.warn("Without your keystore, this wallet cannot be recovered.");

    const confirm = await p.text({
      message: "Type 'delete' to confirm",
      validate: (v) => (v === "delete" ? undefined : "Type 'delete' to proceed, or press Esc to cancel."),
    });
    if (p.isCancel(confirm)) {
      p.cancel("Cancelled. Keystore was not touched.");
      throw new AipError("Logout cancelled");
    }
  }

  await deleteKeystore();
  log.success(`Keystore deleted: ${paths.keystoreFile()}`);
}
