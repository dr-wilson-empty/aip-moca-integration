import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { randomBytes, createCipheriv, createDecipheriv, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { paths, ensureRoot } from "./paths.js";
import { ConfigError, NotFoundError, WalletError } from "./errors.js";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1, keyLen: 32, maxmem: 256 * 1024 * 1024 };
const KEYSTORE_VERSION = 1 as const;
const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const SECRET_KEY_LENGTH = 64;

export const KeystoreSchema = z.object({
  version: z.literal(KEYSTORE_VERSION),
  publicKey: z.string().min(32),
  algorithm: z.literal(ALGORITHM),
  kdf: z.object({
    name: z.literal("scrypt"),
    salt: z.string(),
    N: z.number().int().positive(),
    r: z.number().int().positive(),
    p: z.number().int().positive(),
    keyLen: z.number().int().positive(),
  }),
  iv: z.string(),
  ciphertext: z.string(),
  authTag: z.string(),
  createdAt: z.string(),
});

export type Keystore = z.infer<typeof KeystoreSchema>;

export function generateKeypair(): Keypair {
  return Keypair.generate();
}

export function importFromBase58(secretBase58: string): Keypair {
  const trimmed = secretBase58.trim();
  let bytes: Uint8Array;
  try {
    bytes = bs58.decode(trimmed);
  } catch {
    throw new WalletError(
      "Invalid base58 secret key",
      "Expected the 64-byte secret key as a base58 string (the format Phantom exports).",
    );
  }
  if (bytes.length !== SECRET_KEY_LENGTH) {
    throw new WalletError(
      `Secret key must be ${SECRET_KEY_LENGTH} bytes (got ${bytes.length})`,
      "Phantom exports a 64-byte secret key. 32-byte seeds are not yet supported.",
    );
  }
  return Keypair.fromSecretKey(bytes);
}

export function importFromJsonArray(content: string): Keypair {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new WalletError(
      "File is not valid JSON",
      "Expected a JSON array of integers - the format Solana CLI uses.",
    );
  }
  if (!Array.isArray(parsed) || parsed.length !== SECRET_KEY_LENGTH || !parsed.every((n) => Number.isInteger(n))) {
    throw new WalletError(
      `Expected a JSON array of ${SECRET_KEY_LENGTH} integers`,
      "This is the Solana CLI keypair format (e.g. ~/.config/solana/id.json).",
    );
  }
  const bytes = Uint8Array.from(parsed as number[]);
  return Keypair.fromSecretKey(bytes);
}

export async function encryptKeystore(keypair: Keypair, passphrase: string): Promise<Keystore> {
  if (passphrase.length < 8) {
    throw new WalletError(
      "Passphrase must be at least 8 characters",
      "Pick something memorable but hard to guess.",
    );
  }
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(passphrase, salt, SCRYPT_PARAMS.keyLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_PARAMS.maxmem,
  });
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(keypair.secretKey), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    version: KEYSTORE_VERSION,
    publicKey: keypair.publicKey.toBase58(),
    algorithm: ALGORITHM,
    kdf: {
      name: "scrypt",
      salt: salt.toString("base64"),
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      keyLen: SCRYPT_PARAMS.keyLen,
    },
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: authTag.toString("base64"),
    createdAt: new Date().toISOString(),
  };
}

export async function decryptKeystore(keystore: Keystore, passphrase: string): Promise<Keypair> {
  const salt = Buffer.from(keystore.kdf.salt, "base64");
  const iv = Buffer.from(keystore.iv, "base64");
  const ciphertext = Buffer.from(keystore.ciphertext, "base64");
  const authTag = Buffer.from(keystore.authTag, "base64");
  const key = await scrypt(passphrase, salt, keystore.kdf.keyLen, {
    N: keystore.kdf.N,
    r: keystore.kdf.r,
    p: keystore.kdf.p,
    maxmem: SCRYPT_PARAMS.maxmem,
  });
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new WalletError(
      "Could not decrypt keystore",
      "The passphrase is wrong, or the keystore file has been tampered with.",
    );
  }
  if (plaintext.length !== SECRET_KEY_LENGTH) {
    throw new WalletError("Decrypted secret key has unexpected length");
  }
  return Keypair.fromSecretKey(new Uint8Array(plaintext));
}

export async function loadKeystore(): Promise<Keystore> {
  let raw: string;
  try {
    raw = await readFile(paths.keystoreFile(), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new NotFoundError(
        "Not logged in",
        "Run 'aip login' to create or import a wallet.",
      );
    }
    throw new ConfigError(`Could not read ${paths.keystoreFile()}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError(
      `Keystore at ${paths.keystoreFile()} is not valid JSON`,
      "Delete it and run 'aip login' again, or restore from your backup.",
    );
  }
  const result = KeystoreSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(
      `Keystore at ${paths.keystoreFile()} is malformed`,
      "Delete it and run 'aip login' again, or restore from your backup.",
    );
  }
  return result.data;
}

export async function saveKeystore(keystore: Keystore): Promise<void> {
  await ensureRoot();
  const target = paths.keystoreFile();
  const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(keystore, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, target);
}

export async function deleteKeystore(): Promise<void> {
  try {
    await unlink(paths.keystoreFile());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}

export async function keystoreExists(): Promise<boolean> {
  try {
    await readFile(paths.keystoreFile(), "utf8");
    return true;
  } catch {
    return false;
  }
}
