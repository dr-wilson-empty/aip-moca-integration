import bs58 from "bs58";

/**
 * Ed25519 multicodec prefix: 0xed 0x01
 * W3C DID Key Method spesifikasyonuna gore:
 * did:key = "did:key:z" + base58btc(multicodec_prefix + public_key_bytes)
 */
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);

/**
 * Solana public key'den (base58) gercek W3C DID uretir.
 * Solana adresleri zaten Ed25519 public key'dir.
 *
 * Ornek cikti: did:key:z6MktguV29Uf5fiqg6fhDJjukNwyrzgeKTYZ1phF6ZHKCh9C
 */
export function generateDIDFromPublicKey(publicKeyBase58: string): string {
  const pubkeyBytes = bs58.decode(publicKeyBase58);

  if (pubkeyBytes.length !== 32) {
    throw new Error(
      `Invalid Ed25519 public key: expected 32 bytes, got ${pubkeyBytes.length}`
    );
  }

  const combined = new Uint8Array(
    ED25519_MULTICODEC_PREFIX.length + pubkeyBytes.length
  );
  combined.set(ED25519_MULTICODEC_PREFIX);
  combined.set(pubkeyBytes, ED25519_MULTICODEC_PREFIX.length);

  const multibaseEncoded = bs58.encode(combined);
  return `did:key:z${multibaseEncoded}`;
}

/**
 * did:key string'inden Ed25519 public key byte'larini cikarir.
 * Ters islem: did:key -> public key bytes
 */
export function resolveDID(did: string): {
  publicKey: Uint8Array;
  publicKeyBase58: string;
} {
  if (!did.startsWith("did:key:z")) {
    throw new Error(`Unsupported DID method: ${did.split(":").slice(0, 2).join(":")}`);
  }

  const multibasePayload = did.slice("did:key:z".length);
  const decoded = bs58.decode(multibasePayload);

  // Ilk 2 byte multicodec prefix olmali (0xed 0x01)
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error(
      `Unsupported key type: expected Ed25519 (0xed01), got 0x${decoded[0]?.toString(16)}${decoded[1]?.toString(16)}`
    );
  }

  const publicKey = decoded.slice(2);

  if (publicKey.length !== 32) {
    throw new Error(
      `Invalid key length after decoding: expected 32 bytes, got ${publicKey.length}`
    );
  }

  return {
    publicKey,
    publicKeyBase58: bs58.encode(publicKey),
  };
}

/**
 * Bir DID'in belirli bir Solana public key'e ait oldugunu dogrular.
 * DID'den cikan public key ile verilen public key eslesiyorsa true doner.
 */
export function verifyDID(did: string, publicKeyBase58: string): boolean {
  try {
    const resolved = resolveDID(did);
    return resolved.publicKeyBase58 === publicKeyBase58;
  } catch {
    return false;
  }
}
