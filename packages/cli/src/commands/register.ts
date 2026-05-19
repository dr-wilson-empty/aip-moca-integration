import { Command } from "commander";
import { readFile } from "node:fs/promises";
import * as p from "@clack/prompts";
import { z } from "zod";
import { ApiClient } from "../core/api-client.js";
import { loadConfig } from "../core/config.js";
import { AgentCardSchema, type AgentCard, probeAgentCard } from "../core/agent-card.js";
import { log } from "../core/logger.js";
import { c, glyph } from "../core/theme.js";
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
}

export function registerCommand(): Command {
  return new Command("register")
    .description("Publish an AgentCard to the AIP marketplace")
    .option("-u, --url <url>", "Probe a running agent at this URL (defaults to its /.well-known/agent.json)")
    .option("-f, --card-file <path>", "Read AgentCard JSON from a file instead")
    .option("--public-key <ed25519>", "Public key to bind to the DID (optional, server verifies)")
    .option("-y, --yes", "Skip the confirmation prompt")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip register --url http://localhost:4010
  $ aip register --card-file ./agent-card.json --yes
  $ aip register --url https://my-agent.example.com --public-key z6Mk...
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

  const config = await loadConfig();
  const api = new ApiClient({ baseUrl: config.apiUrl });

  const card = opts.url ? await loadCardFromUrl(opts.url) : await loadCardFromFile(opts.cardFile!);

  log.blank();
  log.raw(`  ${c.dim("about to register:")}`);
  log.raw(`    ${c.label("name")}     ${c.value(card.name)}`);
  log.raw(`    ${c.label("did")}      ${c.value(card.did)}`);
  log.raw(`    ${c.label("endpoint")} ${c.value(card.endpoint)}`);
  log.raw(`    ${c.label("type")}     ${c.value(card.type)}`);
  log.raw(`    ${c.label("caps")}     ${c.value(card.capabilities.map((cap) => cap.id).join(", "))}`);
  log.raw(`    ${c.label("target")}   ${c.value(config.apiUrl)}`);
  log.blank();

  if (!opts.yes) {
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
  log.success(`Registered ${c.value(response.did)}`);
  if (response.message) log.step(response.message);
  log.blank();
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
