import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  encryptKeystore,
  decryptKeystore,
  generateKeypair,
  importFromBase58,
  importFromJsonArray,
  keystoreExists,
  loadKeystore,
  saveKeystore,
  deleteKeystore,
  KeystoreSchema,
} from "../src/core/wallet.js";

describe("generateKeypair", () => {
  it("produces distinct keypairs", () => {
    const a = generateKeypair();
    const b = generateKeypair();
    expect(a.publicKey.toBase58()).not.toBe(b.publicKey.toBase58());
  });

  it("produces a 64-byte secret key", () => {
    expect(generateKeypair().secretKey.length).toBe(64);
  });
});

describe("importFromBase58", () => {
  it("round-trips through base58", () => {
    const original = Keypair.generate();
    const imported = importFromBase58(bs58.encode(original.secretKey));
    expect(imported.publicKey.toBase58()).toBe(original.publicKey.toBase58());
  });

  it("rejects garbage input", () => {
    expect(() => importFromBase58("not-a-key")).toThrow();
  });

  it("rejects keys of the wrong length", () => {
    const tooShort = bs58.encode(new Uint8Array(32));
    expect(() => importFromBase58(tooShort)).toThrow(/64 bytes/);
  });

  it("trims whitespace", () => {
    const original = Keypair.generate();
    const padded = `  ${bs58.encode(original.secretKey)}\n`;
    const imported = importFromBase58(padded);
    expect(imported.publicKey.toBase58()).toBe(original.publicKey.toBase58());
  });
});

describe("importFromJsonArray", () => {
  it("imports a Solana CLI keypair file", () => {
    const original = Keypair.generate();
    const json = JSON.stringify(Array.from(original.secretKey));
    const imported = importFromJsonArray(json);
    expect(imported.publicKey.toBase58()).toBe(original.publicKey.toBase58());
  });

  it("rejects non-JSON content", () => {
    expect(() => importFromJsonArray("hello")).toThrow();
  });

  it("rejects arrays of the wrong length", () => {
    expect(() => importFromJsonArray("[1,2,3]")).toThrow(/64 integers/);
  });
});

describe("encryptKeystore / decryptKeystore", () => {
  it("round-trips a keypair through encryption", async () => {
    const original = generateKeypair();
    const keystore = await encryptKeystore(original, "correct horse battery staple");
    const recovered = await decryptKeystore(keystore, "correct horse battery staple");
    expect(recovered.publicKey.toBase58()).toBe(original.publicKey.toBase58());
    expect(Buffer.from(recovered.secretKey)).toEqual(Buffer.from(original.secretKey));
  }, 15_000);

  it("fails with the wrong passphrase", async () => {
    const keystore = await encryptKeystore(generateKeypair(), "correct horse");
    await expect(decryptKeystore(keystore, "wrong horse")).rejects.toThrow(/decrypt/);
  }, 15_000);

  it("rejects short passphrases", async () => {
    await expect(encryptKeystore(generateKeypair(), "short")).rejects.toThrow(/at least 8/);
  });

  it("produces schema-valid output", async () => {
    const keystore = await encryptKeystore(generateKeypair(), "a-decent-passphrase");
    expect(KeystoreSchema.safeParse(keystore).success).toBe(true);
  }, 15_000);

  it("uses unique salts and IVs across keystores", async () => {
    const kp = generateKeypair();
    const a = await encryptKeystore(kp, "same-passphrase-twice");
    const b = await encryptKeystore(kp, "same-passphrase-twice");
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  }, 15_000);

  it("authenticates the ciphertext (tamper detection)", async () => {
    const keystore = await encryptKeystore(generateKeypair(), "a-decent-passphrase");
    const tampered = {
      ...keystore,
      ciphertext: Buffer.from("totally-different-ciphertext-bytes-here").toString("base64"),
    };
    await expect(decryptKeystore(tampered, "a-decent-passphrase")).rejects.toThrow(/decrypt/);
  }, 15_000);
});

describe("keystore disk I/O", () => {
  let sandbox: string;
  let originalHome: string | undefined;
  let originalXdg: string | undefined;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "aip-cli-test-"));
    originalHome = process.env.HOME;
    originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = sandbox;
    delete process.env.XDG_CONFIG_HOME;
  });

  afterEach(async () => {
    if (originalHome !== undefined) process.env.HOME = originalHome;
    else delete process.env.HOME;
    if (originalXdg !== undefined) process.env.XDG_CONFIG_HOME = originalXdg;
    await rm(sandbox, { recursive: true, force: true });
  });

  it("reports no keystore initially", async () => {
    expect(await keystoreExists()).toBe(false);
  });

  it("round-trips a keystore through disk with 0600 permissions", async () => {
    const original = generateKeypair();
    const keystore = await encryptKeystore(original, "disk-test-passphrase");
    await saveKeystore(keystore);

    expect(await keystoreExists()).toBe(true);

    const onDisk = await loadKeystore();
    expect(onDisk.publicKey).toBe(original.publicKey.toBase58());

    const recovered = await decryptKeystore(onDisk, "disk-test-passphrase");
    expect(recovered.publicKey.toBase58()).toBe(original.publicKey.toBase58());

    const stats = await stat(join(sandbox, ".aip", "keystore.json"));
    expect((stats.mode & 0o777).toString(8)).toBe("600");
  }, 15_000);

  it("throws NotFoundError when loadKeystore has no file", async () => {
    await expect(loadKeystore()).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("deletes the keystore", async () => {
    const keystore = await encryptKeystore(generateKeypair(), "soon-to-delete");
    await saveKeystore(keystore);
    expect(await keystoreExists()).toBe(true);
    await deleteKeystore();
    expect(await keystoreExists()).toBe(false);
  }, 15_000);

  it("delete is idempotent when no keystore exists", async () => {
    await expect(deleteKeystore()).resolves.toBeUndefined();
  });
});
