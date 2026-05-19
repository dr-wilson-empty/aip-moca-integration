import { Command } from "commander";
import * as p from "@clack/prompts";
import { readFile } from "node:fs/promises";
import { Keypair } from "@solana/web3.js";
import { loadConfig } from "../core/config.js";
import {
  encryptKeystore,
  generateKeypair,
  importFromBase58,
  importFromJsonArray,
  keystoreExists,
  saveKeystore,
} from "../core/wallet.js";
import { paths } from "../core/paths.js";
import { log } from "../core/logger.js";
import { c, glyph } from "../core/theme.js";
import { AipError, ValidationError, WalletError } from "../core/errors.js";
import { renderLoginSuccess } from "../ui/wallet-report.js";

interface LoginOptions {
  generate?: boolean;
  keypair?: string;
  force?: boolean;
}

export function loginCommand(): Command {
  return new Command("login")
    .description("Create or import a Solana wallet (encrypted on disk)")
    .option("--generate", "Generate a new keypair non-interactively")
    .option("--keypair <path>", "Import from a Solana CLI keypair JSON file")
    .option("--force", "Overwrite an existing keystore without confirmation")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip login                              ${c.dim("# interactive: choose generate or import")}
  $ aip login --generate                   ${c.dim("# new keypair, passphrase prompt only")}
  $ aip login --keypair ~/.config/solana/id.json
  $ aip login --force                      ${c.dim("# overwrite existing keystore")}
`,
    )
    .action(async (opts: LoginOptions) => {
      await runLogin(opts);
    });
}

async function runLogin(opts: LoginOptions): Promise<void> {
  if ((await keystoreExists()) && !opts.force) {
    p.intro(c.brand("aip login"));
    const overwrite = await p.confirm({
      message: `A wallet already exists at ${paths.keystoreFile()}. Overwrite it?`,
      initialValue: false,
    });
    if (p.isCancel(overwrite) || overwrite === false) {
      p.cancel("Aborted. The existing wallet was not touched.");
      return;
    }
  }

  const keypair = await selectKeypair(opts);

  const passphrase = await readPassphrase();
  const keystore = await encryptKeystore(keypair, passphrase);
  await saveKeystore(keystore);

  const config = await loadConfig();
  renderLoginSuccess({
    publicKey: keypair.publicKey.toBase58(),
    keystorePath: paths.keystoreFile(),
    cluster: config.network,
    generated: opts.keypair === undefined && opts.generate !== false && !opts.keypair,
  });
}

async function selectKeypair(opts: LoginOptions): Promise<Keypair> {
  if (opts.generate) return generateKeypair();
  if (opts.keypair) return importFromJsonArray(await readFile(opts.keypair, "utf8"));

  p.intro(c.brand("aip login"));
  const choice = await p.select({
    message: "How would you like to log in?",
    options: [
      { value: "generate", label: "Generate a new keypair", hint: "recommended for trying AIP" },
      { value: "import-base58", label: "Paste a base58 secret key", hint: "Phantom export format" },
      { value: "import-file", label: "Import a Solana CLI keypair file", hint: "JSON array of integers" },
    ],
    initialValue: "generate",
  });
  if (p.isCancel(choice)) {
    p.cancel("Cancelled.");
    throw new AipError("Login cancelled");
  }

  if (choice === "generate") {
    return generateKeypair();
  }

  if (choice === "import-base58") {
    const secret = await p.password({
      message: "Paste your base58 secret key",
      validate: (v) => {
        if (!v || v.trim().length < 60) return "That doesn't look like a base58 secret key.";
        return undefined;
      },
    });
    if (p.isCancel(secret)) {
      p.cancel("Cancelled.");
      throw new AipError("Login cancelled");
    }
    return importFromBase58(String(secret));
  }

  const file = await p.text({
    message: "Path to keypair file",
    placeholder: "~/.config/solana/id.json",
    validate: (v) => (v && v.trim() ? undefined : "Required."),
  });
  if (p.isCancel(file)) {
    p.cancel("Cancelled.");
    throw new AipError("Login cancelled");
  }
  const expanded = String(file).replace(/^~(?=$|\/|\\)/, process.env.HOME ?? "~");
  try {
    return importFromJsonArray(await readFile(expanded, "utf8"));
  } catch (err) {
    if (err instanceof WalletError) throw err;
    throw new ValidationError(
      `Could not read keypair file: ${(err as Error).message}`,
    );
  }
}

async function readPassphrase(): Promise<string> {
  const first = await p.password({
    message: "Choose a passphrase to encrypt your wallet",
    validate: (v) => {
      if (!v) return "Required.";
      if (v.length < 8) return "Use at least 8 characters.";
      return undefined;
    },
  });
  if (p.isCancel(first)) {
    p.cancel("Cancelled.");
    throw new AipError("Login cancelled");
  }
  const second = await p.password({
    message: "Confirm passphrase",
    validate: (v) => (v === first ? undefined : "Does not match."),
  });
  if (p.isCancel(second)) {
    p.cancel("Cancelled.");
    throw new AipError("Login cancelled");
  }
  log.blank();
  return String(first);
}
