import * as p from "@clack/prompts";
import { Keypair } from "@solana/web3.js";
import { decryptKeystore, loadKeystore } from "./wallet.js";
import { AipError, WalletError } from "./errors.js";
import { c } from "./theme.js";

let cachedKeypair: Keypair | null = null;
let cachedAt: number = 0;
const CACHE_TTL_MS = 5 * 60_000;

export interface UnlockOptions {
  prompt?: string;
}

export async function unlockKeypair(opts: UnlockOptions = {}): Promise<Keypair> {
  if (cachedKeypair && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedKeypair;
  }

  const keystore = await loadKeystore();

  if (!process.stderr.isTTY) {
    throw new AipError(
      "Cannot prompt for passphrase outside an interactive terminal",
      undefined,
      "Run the command from a TTY, or feed input through expect/script if you must automate.",
    );
  }

  const headline = opts.prompt
    ? `${opts.prompt} — enter your wallet passphrase`
    : `Enter the wallet passphrase for ${c.dim(keystore.publicKey)}`;
  const passphrase = await p.password({
    message: headline,
    mask: "•",
    validate: (v) => (v && v.length > 0 ? "" : "Passphrase required."),
  });
  if (p.isCancel(passphrase)) {
    p.cancel("Cancelled.");
    throw new AipError("Unlock cancelled");
  }

  const keypair = await decryptKeystore(keystore, String(passphrase));
  cachedKeypair = keypair;
  cachedAt = Date.now();
  return keypair;
}

export function lockKeypair(): void {
  cachedKeypair = null;
  cachedAt = 0;
}

export async function maybeKeystorePublicKey(): Promise<string | null> {
  try {
    const keystore = await loadKeystore();
    return keystore.publicKey;
  } catch (err) {
    if (err instanceof WalletError || (err as { name?: string }).name === "NotFoundError") return null;
    throw err;
  }
}
