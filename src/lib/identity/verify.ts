import nacl from "tweetnacl";
import { resolveDID } from "./did";

/**
 * Ed25519 imza dogrulama.
 * Mesajin belirtilen public key ile imzalandigini dogrular.
 */
export function verifySignature(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  if (publicKey.length !== 32) return false;
  if (signature.length !== 64) return false;

  return nacl.sign.detached.verify(message, signature, publicKey);
}

/**
 * DID-tabanli imza dogrulama.
 * DID'den public key'i cikartir, sonra imzayi o key ile dogrular.
 */
export function verifySignatureWithDID(
  message: Uint8Array,
  signature: Uint8Array,
  did: string
): boolean {
  try {
    const { publicKey } = resolveDID(did);
    return verifySignature(message, signature, publicKey);
  } catch {
    return false;
  }
}
