import { AipDidResolver, DEFAULT_PROGRAM_ID } from "@aipagents/did-resolver";
import type { Config } from "./config.js";

const DEVNET_RPC = "https://api.devnet.solana.com";
const MAINNET_RPC = "https://api.mainnet-beta.solana.com";

export interface ResolverContext {
  resolver: AipDidResolver;
  network: "solana:devnet" | "solana:mainnet-beta";
  cluster: "devnet" | "mainnet-beta";
  rpcEndpoint: string;
  programId: string;
}

export interface ResolverOverrides {
  network?: "devnet" | "mainnet-beta";
  rpcUrl?: string;
}

export function buildResolver(config: Config, overrides: ResolverOverrides = {}): ResolverContext {
  const cluster = overrides.network ?? config.network;
  const rpcEndpoint =
    overrides.rpcUrl ?? config.rpcUrl ?? (cluster === "mainnet-beta" ? MAINNET_RPC : DEVNET_RPC);
  const network = (cluster === "mainnet-beta" ? "solana:mainnet-beta" : "solana:devnet") as
    | "solana:devnet"
    | "solana:mainnet-beta";
  const programId = DEFAULT_PROGRAM_ID;
  const resolver = new AipDidResolver({ rpcEndpoint, programId, network });
  return { resolver, network, cluster, rpcEndpoint, programId };
}

export type IdentityInputKind =
  | { kind: "aip-did"; did: string }
  | { kind: "other-did"; method: string; did: string }
  | { kind: "url"; url: string }
  | { kind: "unknown"; raw: string };

export function classifyIdentityInput(raw: string): IdentityInputKind {
  const trimmed = raw.trim();
  if (/^did:aip:/i.test(trimmed)) return { kind: "aip-did", did: trimmed };
  const otherDid = /^did:([a-z0-9]+):/i.exec(trimmed);
  if (otherDid) return { kind: "other-did", method: otherDid[1]!, did: trimmed };
  if (/^https?:\/\//i.test(trimmed)) return { kind: "url", url: trimmed };
  return { kind: "unknown", raw: trimmed };
}
