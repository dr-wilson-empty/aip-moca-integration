import { Command } from "commander";
import { readFile } from "node:fs/promises";
import * as p from "@clack/prompts";
import { z } from "zod";
import { Connection, PublicKey } from "@solana/web3.js";
import { ApiClient } from "../core/api-client.js";
import { loadConfig } from "../core/config.js";
import { AgentCardSchema, type AgentCard, probeAgentCard } from "../core/agent-card.js";
import { log } from "../core/logger.js";
import { c, glyph } from "../core/theme.js";
import { unlockKeypair } from "../core/unlock.js";
import { rpcEndpointFor } from "../core/solana.js";
import {
  registerAgentOnChain,
  deregisterAgentOnChain,
  isAgentOnChain,
  deriveAgentRecordPDA,
  extractAgentIdFromDid,
} from "../core/registry.js";
import {
  AipError,
  NetworkError,
  ValidationError,
} from "../core/errors.js";

const RegisterResponseSchema = z.object({
  ok: z.boolean(),
  did: z.string(),
  message: z.string().optional(),
});

interface RegisterOpts {
  url?: string;
  cardFile?: string;
  publicKey?: string;
  yes?: boolean;
  onChain?: boolean;
  agentId?: string;
  deregisterFirst?: boolean;
  network?: "devnet" | "mainnet-beta";
  rpc?: string;
}

export function registerCommand(): Command {
  return new Command("register")
    .description("Publish an AgentCard to the AIP marketplace (and optionally on-chain)")
    .option("-u, --url <url>", "Probe a running agent at this URL (defaults to its /.well-known/agent.json)")
    .option("-f, --card-file <path>", "Read AgentCard JSON from a file instead")
    .option("--public-key <ed25519>", "Public key to bind to the DID (optional, server verifies)")
    .option("-y, --yes", "Skip the confirmation prompt")
    .option("--on-chain", "Also write the agent to the AIP registry program (your wallet signs and pays rent)")
    .option("--agent-id <slug>", "Owner-scoped agent_id (1–32 chars, [a-z0-9_-]); inferred from DID when omitted")
    .option("--deregister-first", "If a PDA already exists for this agent_id under your wallet, close it before re-registering")
    .option("-n, --network <cluster>", "Override network for on-chain tx (devnet | mainnet-beta)")
    .option("--rpc <url>", "Override Solana RPC endpoint")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip register --url http://localhost:4010
  $ aip register --card-file ./agent-card.json --yes
  $ aip register --url https://my-agent.example.com --on-chain
  $ aip register --url http://localhost:4010 --on-chain --agent-id translator --yes
  $ aip register --url http://localhost:4010 --on-chain --deregister-first
`,
    )
    .action(async (opts: RegisterOpts) => {
      await runRegister(opts);
    });
}

async function runRegister(opts: RegisterOpts): Promise<void> {
  if (!opts.url && !opts.cardFile) {
    throw new ValidationError(
      "Provide either --url <endpoint> or --card-file <path>",
      "URL probing fetches /.well-known/agent.json automatically.",
    );
  }
  if (opts.url && opts.cardFile) {
    throw new ValidationError("Use --url or --card-file, not both");
  }
  if (opts.deregisterFirst && !opts.onChain) {
    throw new ValidationError(
      "--deregister-first only makes sense with --on-chain",
      "Pass --on-chain too, or drop --deregister-first.",
    );
  }

  const config = await loadConfig();
  const api = new ApiClient({ baseUrl: config.apiUrl });

  let card = opts.url ? await loadCardFromUrl(opts.url) : await loadCardFromFile(opts.cardFile!);

  // ---- On-chain path: derive agent_id, rewrite DID to canonical, register on-chain first ----
  let onChainResult: { signature: string; pda: string; did: string } | null = null;

  if (opts.onChain) {
    const signer = await unlockKeypair({ prompt: "Sign on-chain register" });
    const owner = signer.publicKey;
    const cluster = opts.network ?? config.network;
    const rpc = rpcEndpointFor(cluster, opts.rpc ?? config.rpcUrl);
    const connection = new Connection(rpc, "confirmed");

    const agentId = opts.agentId ?? extractAgentIdFromDid(card.did);
    if (!agentId) {
      throw new ValidationError(
        "Could not determine agent_id",
        `The card DID '${card.did}' is not in canonical did:aip:<pubkey>:<agent_id> form. Pass --agent-id <slug>.`,
      );
    }
    if (!/^[a-z0-9_-]{1,32}$/.test(agentId)) {
      throw new ValidationError(
        `Invalid agent_id '${agentId}'`,
        "agent_id must be 1–32 chars from [a-z0-9_-].",
      );
    }

    // Force the card's DID + walletAddress onto canonical form before publishing
    const canonicalDid = `did:aip:${owner.toBase58()}:${agentId}`;
    const cardWallet = card.walletAddress || owner.toBase58();
    card = { ...card, did: canonicalDid, walletAddress: cardWallet };

    // Verify the on-chain wallet_address field will be a valid pubkey
    try {
      new PublicKey(cardWallet);
    } catch {
      throw new ValidationError(
        `Card walletAddress '${cardWallet}' is not a valid Solana public key`,
      );
    }

    log.blank();
    log.raw(`  ${c.dim("about to register on-chain:")}`);
    log.raw(`    ${c.label("did")}      ${c.value(canonicalDid)}`);
    log.raw(`    ${c.label("agent_id")} ${c.value(agentId)}`);
    log.raw(`    ${c.label("owner")}    ${c.value(owner.toBase58())}`);
    log.raw(`    ${c.label("pda")}      ${c.value(deriveAgentRecordPDA(owner, agentId)[0].toBase58())}`);
    log.raw(`    ${c.label("network")}  ${c.value(cluster)}`);
    log.raw(`    ${c.label("endpoint")} ${c.value(card.endpoint)}`);
    log.raw(`    ${c.label("caps")}     ${c.value(card.capabilities.map((cap) => cap.id).join(", "))}`);
    log.blank();

    if (!opts.yes) {
      if (!process.stdin.isTTY) {
        throw new AipError(
          "Confirmation required",
          undefined,
          "Re-run with --yes from non-interactive contexts.",
        );
      }
      const ok = await p.confirm({ message: "Sign and submit the on-chain registration?", initialValue: true });
      if (p.isCancel(ok) || ok === false) {
        p.cancel("Cancelled. Nothing was sent.");
        return;
      }
    }

    if (opts.deregisterFirst) {
      try {
        if (await isAgentOnChain(connection, owner, agentId)) {
          log.step(`Existing PDA found - deregistering first…`);
          const sig = await deregisterAgentOnChain(connection, signer, agentId);
          log.success(`Deregistered (tx ${c.value(sig)})`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new AipError(
          `Failed to deregister existing PDA: ${msg}`,
          undefined,
          "Re-run without --deregister-first, or check that this wallet owns the agent.",
        );
      }
    } else {
      if (await isAgentOnChain(connection, owner, agentId)) {
        throw new ValidationError(
          `An on-chain agent already exists at agent_id='${agentId}' for this wallet`,
          "Pass --deregister-first to replace it, or pick a different --agent-id.",
        );
      }
    }

    try {
      onChainResult = await registerAgentOnChain(connection, signer, agentId, card);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new NetworkError(
        `On-chain registration failed: ${msg}`,
        undefined,
        "Marketplace publication was skipped because on-chain registration is the source of truth when --on-chain is set.",
      );
    }

    log.blank();
    log.success(`On-chain registered (tx ${c.value(onChainResult.signature)})`);
    log.raw(`  ${c.dim(glyph.arrow)} ${c.dim("PDA:")} ${c.value(onChainResult.pda)}`);
    log.blank();
  }

  // ---- Marketplace path (runs in both modes) ----
  log.raw(`  ${c.dim("about to publish to marketplace:")}`);
  log.raw(`    ${c.label("name")}     ${c.value(card.name)}`);
  log.raw(`    ${c.label("did")}      ${c.value(card.did)}`);
  log.raw(`    ${c.label("endpoint")} ${c.value(card.endpoint)}`);
  log.raw(`    ${c.label("type")}     ${c.value(card.type)}`);
  log.raw(`    ${c.label("caps")}     ${c.value(card.capabilities.map((cap) => cap.id).join(", "))}`);
  log.raw(`    ${c.label("target")}   ${c.value(config.apiUrl)}`);
  log.blank();

  if (!opts.yes && !opts.onChain) {
    if (!process.stdin.isTTY) {
      throw new AipError(
        "Confirmation required",
        undefined,
        "Re-run with --yes from non-interactive contexts.",
      );
    }
    const ok = await p.confirm({
      message: "Publish this AgentCard?",
      initialValue: true,
    });
    if (p.isCancel(ok) || ok === false) {
      p.cancel("Cancelled. Nothing was sent.");
      return;
    }
  }

  const payload: Record<string, unknown> = { ...card };
  if (opts.publicKey) payload.publicKey = opts.publicKey;

  let response;
  try {
    response = await api.post("/api/agent-card", payload, RegisterResponseSchema);
  } catch (err) {
    if (err instanceof NetworkError && err.status === 403) {
      throw new NetworkError(
        err.message,
        403,
        "The provided publicKey does not match the DID. Re-check the agent's verification material.",
      );
    }
    throw err;
  }

  log.blank();
  log.success(`Marketplace registered ${c.value(response.did)}`);
  if (response.message) log.step(response.message);
  if (onChainResult) {
    log.raw(`  ${c.dim(glyph.arrow)} ${c.dim("on-chain tx:")} ${c.brand(onChainResult.signature)}`);
    log.raw(`  ${c.dim(glyph.arrow)} ${c.dim("PDA:")} ${c.value(onChainResult.pda)}`);
  }
  log.raw(`  ${c.dim(glyph.arrow)} ${c.dim("Visible in marketplace:")} ${c.brand(`aip agents show ${response.did}`)}`);
  log.blank();
}

async function loadCardFromUrl(url: string): Promise<AgentCard> {
  const probe = await probeAgentCard(url);
  if (!probe.ok || !probe.card) {
    throw new ValidationError(
      `No AgentCard found at ${url}`,
      probe.reason ?? "Make sure the agent is running and serves /.well-known/agent.json.",
    );
  }
  return probe.card;
}

async function loadCardFromFile(path: string): Promise<AgentCard> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    throw new ValidationError(
      `Could not read ${path}: ${(err as Error).message}`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ValidationError(`${path} is not valid JSON`);
  }
  const parsed = AgentCardSchema.safeParse(json);
  if (!parsed.success) {
    throw new ValidationError(
      `${path} is not a valid AgentCard: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data;
}
