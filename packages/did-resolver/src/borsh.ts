/**
 * Minimal Borsh decoder targeting the AgentRecord layout exactly.
 *
 * We do not pull in a generic borsh library because the on-chain layout is
 * stable and small enough to be hand-decoded, which keeps the package
 * dependency footprint minimal for downstream consumers.
 */

import { AgentRecord, AgentTypeName, Capability } from "./types.js";
import bs58 from "bs58";

/**
 * Anchor account discriminator computed from sha256("account:AgentRecord")[0..8].
 * Encoded as a hex literal so we do not need to recompute on every load.
 */
const AGENT_RECORD_DISCRIMINATOR = Uint8Array.from([
  4, 201, 129, 70, 197, 134, 47, 169,
]);

class Reader {
  private offset = 0;
  constructor(private readonly buf: Uint8Array) {}

  remaining(): number {
    return this.buf.length - this.offset;
  }

  readBytes(n: number): Uint8Array {
    if (this.offset + n > this.buf.length) {
      throw new Error(
        `borsh: out-of-bounds read of ${n} bytes at offset ${this.offset} (buffer length ${this.buf.length})`,
      );
    }
    const slice = this.buf.slice(this.offset, this.offset + n);
    this.offset += n;
    return slice;
  }

  readU8(): number {
    return this.readBytes(1)[0];
  }

  readU32(): number {
    const b = this.readBytes(4);
    return b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
  }

  readU64(): bigint {
    const b = this.readBytes(8);
    let v = 0n;
    for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[i]);
    return v;
  }

  readI64(): bigint {
    const u = this.readU64();
    return u >= 1n << 63n ? u - (1n << 64n) : u;
  }

  readString(): string {
    const len = this.readU32();
    const bytes = this.readBytes(len);
    return new TextDecoder("utf-8").decode(bytes);
  }

  readPubkey(): string {
    return bs58.encode(this.readBytes(32));
  }
}

/**
 * Set the discriminator override. Exposed for tests so that a freshly built
 * registry program with a different account name can be exercised without
 * editing this file. Production callers should never need this.
 */
export function setDiscriminatorForTest(value: Uint8Array): void {
  if (value.length !== 8) throw new Error("discriminator must be 8 bytes");
  AGENT_RECORD_DISCRIMINATOR.set(value);
}

export function decodeAgentRecord(data: Uint8Array): AgentRecord {
  if (data.length < 8) {
    throw new Error("account data too short to contain Anchor discriminator");
  }
  for (let i = 0; i < 8; i++) {
    if (data[i] !== AGENT_RECORD_DISCRIMINATOR[i]) {
      throw new Error(
        "discriminator mismatch: account is not an AgentRecord under the expected program",
      );
    }
  }

  const r = new Reader(data.subarray(8));

  const owner = r.readPubkey();
  const agentId = r.readString();
  const did = r.readString();
  const name = r.readString();
  const endpoint = r.readString();
  const walletAddress = r.readPubkey();

  const agentTypeTag = r.readU8();
  const agentType = decodeAgentType(agentTypeTag);

  const capCount = r.readU32();
  const capabilities: Capability[] = [];
  for (let i = 0; i < capCount; i++) {
    capabilities.push({
      name: r.readString(),
      description: r.readString(),
    });
  }

  const pricePerTask = r.readU64();
  const version = r.readString();
  const registeredAt = r.readI64();
  const updatedAt = r.readI64();
  const bump = r.readU8();

  return {
    owner,
    agentId,
    did,
    name,
    endpoint,
    walletAddress,
    agentType,
    capabilities,
    pricePerTask,
    version,
    registeredAt,
    updatedAt,
    bump,
  };
}

function decodeAgentType(tag: number): AgentTypeName {
  switch (tag) {
    case 0: return "Llm";
    case 1: return "Task";
    case 2: return "Execution";
    default:
      throw new Error(`unknown AgentType tag: ${tag}`);
  }
}
