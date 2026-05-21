/**
 * `aip create` - end-to-end agent creation from the terminal.
 *
 * Mirrors the no-code creation flow on /create-agent in the web UI:
 *
 *   1. Interactive prompts collect every field the marketplace needs
 *      (agent id, name, description, system prompt, capabilities with
 *      per-capability pricing, public/private flag, tier/provider,
 *      and an optional API key for custom-tier agents).
 *   2. POST /api/hosted-agent/register with the AIP-AUTH headers so
 *      the row lands in Supabase and the in-memory agent-card-store.
 *   3. Optionally write the AgentRecord PDA on-chain so the agent has
 *      a permanent did:aip identity that anyone can resolve.
 *   4. Print a success card with the DID, the marketplace URL, the
 *      Solana Explorer link, and copy-paste hints for the next steps.
 *
 * The hosted-agent row is what makes the agent discoverable in the
 * marketplace; the on-chain step is what makes it cryptographically
 * verifiable. Both are done by default to match the web UI's
 * behaviour.
 */
import { Command } from "commander";
import * as p from "@clack/prompts";
import { z } from "zod";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Connection } from "@solana/web3.js";
import { ApiClient } from "../core/api-client.js";
import { loadConfig } from "../core/config.js";
import { unlockKeypair } from "../core/unlock.js";
import { buildAipAuthHeaders } from "../core/auth.js";
import { registerAgentOnChain, isAgentOnChain } from "../core/registry.js";
import { rpcEndpointFor } from "../core/solana.js";
import { explorerAddressUrl } from "../core/format.js";
import { log } from "../core/logger.js";
import { c, glyph } from "../core/theme.js";
import {
  AipError,
  NetworkError,
  ValidationError,
} from "../core/errors.js";
import type { AgentCard } from "../core/agent-card.js";

/* ------------------------------------------------------------------ */
/*  CLI surface                                                        */
/* ------------------------------------------------------------------ */

interface CreateOpts {
  agentId?: string;
  name?: string;
  promptFile?: string;
  noOnChain?: boolean;
  network?: "devnet" | "mainnet-beta";
  rpc?: string;
}

export function createCommand(): Command {
  return new Command("create")
    .description("Create a new hosted agent end-to-end (marketplace + on-chain)")
    .option("--agent-id <slug>", "Owner-scoped agent id (lowercase, hyphens, max 32)")
    .option("--name <name>", "Display name shown on the marketplace")
    .option(
      "-f, --prompt-file <path>",
      "Read the system prompt from a file ('-' for stdin) instead of opening an editor",
    )
    .option("--no-on-chain", "Skip the Solana PDA write (marketplace-only)")
    .option("-n, --network <cluster>", "Override Solana cluster (devnet | mainnet-beta)")
    .option("--rpc <url>", "Override Solana RPC endpoint")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip create                                       ${c.dim("# fully interactive; $EDITOR opens for the prompt")}
  $ aip create --agent-id meeting-notes --name "Meeting Notes"
  $ aip create -f ./prompt.md                        ${c.dim("# load the system prompt from a file")}
  $ cat prompt.md | aip create -f -                  ${c.dim("# read the system prompt from stdin")}
  $ aip create --no-on-chain                         ${c.dim("# skip the PDA write")}
`,
    )
    .action(async (opts: CreateOpts) => {
      await runCreate(opts);
    });
}

/* ------------------------------------------------------------------ */
/*  Server response shapes (validated at runtime)                      */
/* ------------------------------------------------------------------ */

const RegisterResponseSchema = z.object({
  ok: z.boolean(),
  agentId: z.string(),
  endpoint: z.string(),
  did: z.string(),
});

type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

/* ------------------------------------------------------------------ */
/*  Internal types — what the prompts collect                          */
/* ------------------------------------------------------------------ */

interface CapabilityDraft {
  id: string;
  description: string;
  price: string;
}

interface AgentDraft {
  agentId: string;
  name: string;
  description: string;
  systemPrompt: string;
  tier: "platform" | "custom";
  provider: "anthropic" | "openai";
  customApiKey?: string;
  capabilities: CapabilityDraft[];
  isPublic: boolean;
}

/* ------------------------------------------------------------------ */
/*  Main flow                                                          */
/* ------------------------------------------------------------------ */

async function runCreate(opts: CreateOpts): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new ValidationError(
      "aip create needs an interactive terminal",
      "Run from a real TTY, or use the web UI at https://app.aipagents.xyz/create-agent.",
    );
  }

  p.intro(c.brand("aip create"));

  // Unlock the wallet up front. The auth headers + on-chain register
  // both need the keypair, and asking for the passphrase 30 seconds
  // into a wizard feels worse than asking at the start.
  const keypair = await unlockKeypair({
    prompt: "Unlock your wallet to sign create + on-chain register",
  });
  const ownerAddress = keypair.publicKey.toBase58();

  let draft = await collectDraft(opts, ownerAddress);

  // Review loop. After the initial pass through the prompts, show the
  // collected values and let the user either publish, edit any single
  // field, or abandon the whole thing. This keeps the wizard linear
  // (no jumping back mid-flow, which clack does not support) while
  // still letting them fix a typo without restarting from scratch.
  for (;;) {
    log.blank();
    log.raw(renderSummary(draft, ownerAddress));
    log.blank();
    const action = await p.select({
      message: "What next?",
      options: [
        { value: "publish", label: "Publish to the marketplace" },
        { value: "edit", label: "Edit a field" },
        { value: "cancel", label: "Cancel and exit" },
      ],
      initialValue: "publish" as "publish" | "edit" | "cancel",
    });
    if (p.isCancel(action) || action === "cancel") {
      p.cancel("Aborted. Nothing was sent to the server.");
      return;
    }
    if (action === "publish") break;
    draft = await editFieldFlow(draft, opts);
  }

  /* -------------- Step 1: marketplace register -------------- */
  const config = await loadConfig();
  const api = new ApiClient({ baseUrl: config.apiUrl });

  const authHeaders = buildAipAuthHeaders(keypair);
  log.step("Registering on the marketplace");
  let registered: RegisterResponse;
  try {
    registered = await api.post(
      "/api/hosted-agent/register",
      buildBackendPayload(draft, ownerAddress),
      RegisterResponseSchema,
      { headers: authHeaders },
    );
  } catch (err) {
    if (err instanceof NetworkError) {
      // Surface the server-side error message verbatim - it tells the
      // user precisely what went wrong (duplicate id, custom-tier API
      // key missing, etc.).
      throw err;
    }
    throw new AipError(
      `Marketplace register failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  log.success(`Listed as ${c.value(registered.did)}`);

  /* -------------- Step 2: on-chain register (optional) -------------- */
  let onChainResult: { signature: string; pda: string } | null = null;
  if (opts.noOnChain) {
    log.step("Skipping on-chain register (per --no-on-chain)");
  } else {
    const cluster = opts.network ?? config.network;
    const rpcUrl = rpcEndpointFor(cluster, opts.rpc ?? config.rpcUrl);
    const connection = new Connection(rpcUrl, "confirmed");

    log.step(`Checking if ${draft.agentId} already exists on ${cluster}`);
    const exists = await isAgentOnChain(connection, keypair.publicKey, draft.agentId).catch(
      () => false,
    );
    if (exists) {
      log.warn(
        `An AgentRecord PDA already exists for ${draft.agentId} under this wallet. ` +
          `Skipping on-chain register. Use 'aip register --on-chain --deregister-first ...' to overwrite.`,
      );
    } else {
      const card: AgentCard = {
        did: registered.did,
        name: draft.name,
        version: "1.0.0",
        endpoint: registered.endpoint,
        type: "Task",
        walletAddress: ownerAddress,
        capabilities: draft.capabilities.map((cap) => ({
          id: cap.id,
          description: cap.description,
          pricing: { amount: cap.price, token: "USDC", network: "solana" },
        })),
      };
      log.step(`Submitting AgentRecord PDA on ${cluster}`);
      try {
        const result = await registerAgentOnChain(connection, keypair, draft.agentId, card);
        onChainResult = { signature: result.signature, pda: result.pda };
        log.success(`On-chain PDA ${c.value(result.pda)}`);
      } catch (err) {
        log.warn(
          `On-chain register failed: ${err instanceof Error ? err.message : String(err)}. ` +
            "The marketplace entry is still live; you can retry the on-chain step with " +
            `'aip register --on-chain --agent-id ${draft.agentId}'.`,
        );
      }
    }
  }

  /* -------------- Step 3: success card -------------- */
  printSuccess(draft, registered, onChainResult, config);
  p.outro(c.success("Agent created."));
}

/* ------------------------------------------------------------------ */
/*  Draft collection (interactive prompts)                             */
/* ------------------------------------------------------------------ */

async function collectDraft(opts: CreateOpts, ownerAddress: string): Promise<AgentDraft> {
  void ownerAddress;
  const agentId = await collectAgentId(opts.agentId);
  const name = await collectName(opts.name);
  const description = await collectDescription();
  const systemPrompt = await collectSystemPrompt(opts.promptFile);
  const { tier, provider, customApiKey } = await collectModel();
  const capabilities = await collectCapabilities();
  const isPublic = await collectPublic();
  return { agentId, name, description, systemPrompt, tier, provider, customApiKey, capabilities, isPublic };
}

async function collectAgentId(initial: string | undefined): Promise<string> {
  if (initial) {
    assertValidAgentId(initial);
    return initial;
  }
  const value = await p.text({
    message: "Agent id (lowercase, hyphens, max 32)",
    placeholder: "meeting-notes",
    validate: (v) => {
      try {
        assertValidAgentId(v);
        return undefined;
      } catch (err) {
        return err instanceof Error ? err.message : "Invalid agent id";
      }
    },
  });
  if (p.isCancel(value)) cancelOut("Cancelled at agent id");
  return String(value);
}

function assertValidAgentId(value: string): void {
  if (!value || value.trim().length === 0) {
    throw new ValidationError("agentId is required");
  }
  if (value.length > 32) {
    throw new ValidationError("agentId must be at most 32 characters");
  }
  if (!/^[a-z0-9-]+$/.test(value)) {
    throw new ValidationError(
      "agentId may only contain lowercase letters, digits, and hyphens",
    );
  }
}

async function collectName(initial: string | undefined): Promise<string> {
  if (initial) return initial;
  const value = await p.text({
    message: "Display name",
    placeholder: "Meeting Notes",
    validate: (v) => (v && v.trim().length > 0 ? undefined : "Required"),
  });
  if (p.isCancel(value)) cancelOut("Cancelled at name");
  return String(value).trim();
}

async function collectDescription(): Promise<string> {
  const value = await p.text({
    message: "Short description (optional)",
    placeholder: "Summarises meeting transcripts into action items.",
  });
  if (p.isCancel(value)) cancelOut("Cancelled at description");
  return String(value ?? "").trim();
}

async function collectSystemPrompt(promptFile: string | undefined): Promise<string> {
  // 1. Explicit file path (or '-' for stdin) wins. This is the scripted
  //    happy path for multi-line prompts.
  if (promptFile) {
    const text = await readSystemPromptFromFile(promptFile);
    log.raw(`  ${c.dim(glyph.bullet)} Loaded ${c.value(`${text.length} chars`)} from ${c.value(promptFile === "-" ? "stdin" : promptFile)}`);
    return text;
  }

  // 2. Otherwise: ask the user how they want to compose it. The clack
  //    `p.text` widget can only do single-line input and silently
  //    truncates anything pasted with a newline (this is what bit
  //    Thread Forge earlier). For comfortable multi-line composition
  //    we spawn the user's $EDITOR with a temp file, git-style.
  const choice = await p.select({
    message: "How do you want to provide the system prompt?",
    options: [
      {
        value: "editor",
        label: "Open my $EDITOR for multi-line composition",
        hint: "recommended for prompts longer than one sentence",
      },
      {
        value: "inline",
        label: "Type a single-line prompt right here",
        hint: "fast for short prompts; multi-line pastes will be truncated",
      },
    ],
    initialValue: "editor" as "editor" | "inline",
  });
  if (p.isCancel(choice)) cancelOut("Cancelled at system prompt");

  if (choice === "inline") {
    const value = await p.text({
      message: "System prompt (single line)",
      placeholder: "You are a concise assistant that ...",
      validate: (v) => (v && v.trim().length > 0 ? undefined : "Required"),
    });
    if (p.isCancel(value)) cancelOut("Cancelled at system prompt");
    return String(value).trim();
  }

  return await openEditorForSystemPrompt();
}

/**
 * Read the system prompt from a file path, or stdin when the path is
 * literally `-`. Mirrors the convention used by other CLIs (kubectl,
 * curl, jq). Trims trailing whitespace and rejects empty input.
 */
async function readSystemPromptFromFile(pathOrDash: string): Promise<string> {
  if (pathOrDash === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const text = Buffer.concat(chunks).toString("utf8").trimEnd();
    if (text.trim().length === 0) {
      throw new ValidationError("stdin did not contain a system prompt");
    }
    return text;
  }
  const text = (await readFile(pathOrDash, "utf8")).trimEnd();
  if (text.trim().length === 0) {
    throw new ValidationError(`Prompt file is empty: ${pathOrDash}`);
  }
  return text;
}

/**
 * Spawn the user's `$EDITOR` (falls back to `vi` on Unix, `notepad`
 * on Windows) with a temp file seeded with help comments. Lines that
 * start with `#` are stripped after the editor exits, mirroring git's
 * commit message workflow so users can leave instructions in place
 * without polluting the saved prompt.
 */
async function openEditorForSystemPrompt(): Promise<string> {
  const editor =
    process.env.VISUAL ||
    process.env.EDITOR ||
    (process.platform === "win32" ? "notepad" : "vi");

  const dir = await mkdtemp(join(tmpdir(), "aip-create-prompt-"));
  const file = join(dir, "system_prompt.md");
  const template =
    "# AIP system prompt\n" +
    "# Type your agent's system prompt below. Lines starting with '#' are\n" +
    "# comments and will be removed when you save and close the editor.\n" +
    "# Multi-line, multi-paragraph prompts are fine - newlines are preserved.\n" +
    "\n";
  await writeFile(file, template);

  log.raw(`  ${c.dim(glyph.bullet)} Opening ${c.value(editor)} ${c.dim(`(${file})`)}`);

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(editor, [file], { stdio: "inherit" });
      child.on("error", (err) => reject(err));
      child.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new AipError(`Editor exited with code ${code}`));
      });
    });
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }

  const raw = await readFile(file, "utf8");
  await rm(dir, { recursive: true, force: true });

  const stripped = raw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n")
    .trim();

  if (stripped.length === 0) {
    throw new ValidationError(
      "System prompt is empty",
      "Re-run `aip create` and either type a prompt in the editor or pass `--prompt-file <path>`.",
    );
  }
  log.raw(`  ${c.dim(glyph.bullet)} Captured ${c.value(`${stripped.length} chars`)} from editor`);
  return stripped;
}

async function collectModel(): Promise<{
  tier: "platform" | "custom";
  provider: "anthropic" | "openai";
  customApiKey?: string;
}> {
  const provider = await p.select({
    message: "Model provider",
    options: [
      { value: "anthropic", label: "Anthropic Claude", hint: "platform tier available - no key needed" },
      { value: "openai", label: "OpenAI", hint: "custom tier only - bring your own API key" },
    ],
    initialValue: "anthropic" as "anthropic" | "openai",
  });
  if (p.isCancel(provider)) cancelOut("Cancelled at provider");

  if (provider === "openai") {
    const key = await p.password({
      message: "OpenAI API key",
      validate: (v) => (v && v.startsWith("sk-") ? undefined : "Needs an sk-... OpenAI key"),
    });
    if (p.isCancel(key)) cancelOut("Cancelled at API key");
    return { tier: "custom", provider: "openai", customApiKey: String(key) };
  }

  const tier = await p.select({
    message: "Tier",
    options: [
      { value: "platform", label: "Platform (uses the AIP-hosted Anthropic key)", hint: "recommended" },
      { value: "custom", label: "Custom (bring your own Anthropic key)" },
    ],
    initialValue: "platform" as "platform" | "custom",
  });
  if (p.isCancel(tier)) cancelOut("Cancelled at tier");

  if (tier === "custom") {
    const key = await p.password({
      message: "Anthropic API key",
      validate: (v) => (v && v.startsWith("sk-ant-") ? undefined : "Needs an sk-ant-... Anthropic key"),
    });
    if (p.isCancel(key)) cancelOut("Cancelled at API key");
    return { tier: "custom", provider: "anthropic", customApiKey: String(key) };
  }

  return { tier: "platform", provider: "anthropic" };
}

async function collectCapabilities(): Promise<CapabilityDraft[]> {
  const collected: CapabilityDraft[] = [];
  for (;;) {
    const ordinal = collected.length + 1;
    const id = await p.text({
      message: `Capability #${ordinal} id`,
      placeholder: "text.summarize",
      validate: (v) => {
        if (!v || v.trim().length === 0) return "Required";
        if (v.length > 32) return "Max 32 characters";
        return undefined;
      },
    });
    if (p.isCancel(id)) cancelOut("Cancelled at capability id");

    const description = await p.text({
      message: `Capability #${ordinal} description`,
      placeholder: "Summarize Text",
      validate: (v) => (v && v.trim().length > 0 ? undefined : "Required"),
    });
    if (p.isCancel(description)) cancelOut("Cancelled at capability description");

    const price = await p.text({
      message: `Capability #${ordinal} price (USDC)`,
      placeholder: "0.10",
      validate: (v) => {
        if (!v) return "Required";
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n <= 0) return "Must be a positive USDC amount";
        return undefined;
      },
    });
    if (p.isCancel(price)) cancelOut("Cancelled at capability price");

    collected.push({
      id: String(id).trim(),
      description: String(description).trim(),
      price: String(price).trim(),
    });

    if (collected.length >= 8) {
      log.raw(`  ${c.dim("Reached the on-chain capability limit (8). Stopping.")}`);
      break;
    }
    const another = await p.confirm({
      message: "Add another capability?",
      initialValue: false,
    });
    if (p.isCancel(another)) cancelOut("Cancelled at add-another prompt");
    if (!another) break;
  }
  return collected;
}

async function collectPublic(): Promise<boolean> {
  const value = await p.confirm({
    message: "List this agent publicly on the marketplace?",
    initialValue: true,
  });
  if (p.isCancel(value)) cancelOut("Cancelled at public flag");
  return Boolean(value);
}

function cancelOut(reason: string): never {
  p.cancel(reason);
  throw new AipError("Create cancelled");
}

/* ------------------------------------------------------------------ */
/*  Review-loop helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * Lets the user pick one field from the collected draft and re-prompt
 * for it. The other fields stay untouched. clack's wizard does not
 * support jumping back mid-flow, so this is the equivalent: collect
 * everything once, then offer a "fix any field" affordance before
 * publishing.
 *
 * Cancelling the field-picker just returns the current draft as-is
 * so the user is bounced back to the top-level review menu without
 * accidentally aborting the whole wizard.
 */
async function editFieldFlow(current: AgentDraft, opts: CreateOpts): Promise<AgentDraft> {
  type EditField =
    | "agentId"
    | "name"
    | "description"
    | "systemPrompt"
    | "model"
    | "capabilities"
    | "isPublic"
    | "back";
  const promptPreview = current.systemPrompt.replace(/\s+/g, " ").slice(0, 40);
  const field = await p.select({
    message: "Which field do you want to edit?",
    options: [
      { value: "agentId", label: "Agent id", hint: current.agentId },
      { value: "name", label: "Display name", hint: current.name },
      { value: "description", label: "Description", hint: current.description || "(empty)" },
      {
        value: "systemPrompt",
        label: "System prompt",
        hint: `${current.systemPrompt.length} chars: ${promptPreview}${current.systemPrompt.length > 40 ? "..." : ""}`,
      },
      {
        value: "model",
        label: "Model / provider / tier",
        hint: `${current.provider} (${current.tier})`,
      },
      {
        value: "capabilities",
        label: "Capabilities (replaces the whole list)",
        hint: `${current.capabilities.length} cap${current.capabilities.length === 1 ? "" : "s"}`,
      },
      {
        value: "isPublic",
        label: "Public flag",
        hint: current.isPublic ? "yes" : "no",
      },
      { value: "back", label: "Back to review", hint: "no changes" },
    ],
    initialValue: "agentId" as EditField,
  });
  if (p.isCancel(field) || field === "back") return current;

  switch (field) {
    case "agentId":
      return { ...current, agentId: await collectAgentId(undefined) };
    case "name":
      return { ...current, name: await collectName(undefined) };
    case "description":
      return { ...current, description: await collectDescription() };
    case "systemPrompt":
      return { ...current, systemPrompt: await collectSystemPrompt(opts.promptFile) };
    case "model": {
      const m = await collectModel();
      return { ...current, tier: m.tier, provider: m.provider, customApiKey: m.customApiKey };
    }
    case "capabilities":
      return { ...current, capabilities: await collectCapabilities() };
    case "isPublic":
      return { ...current, isPublic: await collectPublic() };
    default:
      return current;
  }
}

/* ------------------------------------------------------------------ */
/*  Backend payload + summary rendering                                */
/* ------------------------------------------------------------------ */

function buildBackendPayload(draft: AgentDraft, ownerAddress: string): Record<string, unknown> {
  return {
    agentId: draft.agentId,
    ownerAddress,
    name: draft.name,
    description: draft.description || undefined,
    systemPrompt: draft.systemPrompt,
    tier: draft.tier,
    provider: draft.provider,
    customApiKey: draft.customApiKey,
    capabilities: draft.capabilities.map((cap) => ({
      id: cap.id,
      description: cap.description,
      pricing: { amount: cap.price, token: "USDC", network: "solana" },
    })),
    canOrchestrate: false,
    isPublic: draft.isPublic,
    mcpServers: [],
  };
}

function renderSummary(draft: AgentDraft, ownerAddress: string): string {
  const lines: string[] = [];
  lines.push(`  ${c.brand("Ready to publish:")}`);
  lines.push(`    ${c.dim("id")}            ${c.value(draft.agentId)}`);
  lines.push(`    ${c.dim("name")}          ${c.value(draft.name)}`);
  if (draft.description) {
    lines.push(`    ${c.dim("description")}   ${c.value(draft.description)}`);
  }
  lines.push(`    ${c.dim("owner")}         ${c.value(ownerAddress)}`);
  lines.push(`    ${c.dim("provider")}      ${c.value(`${draft.provider} (${draft.tier})`)}`);
  lines.push(`    ${c.dim("public")}        ${c.value(draft.isPublic ? "yes" : "no")}`);
  lines.push(`    ${c.dim("capabilities")}`);
  for (const cap of draft.capabilities) {
    lines.push(
      `      ${c.brand(glyph.bullet)} ${c.value(cap.id)} ${c.dim(`(${cap.description})`)} - ${c.success(`${cap.price} USDC`)}`,
    );
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Success rendering                                                  */
/* ------------------------------------------------------------------ */

function printSuccess(
  draft: AgentDraft,
  registered: RegisterResponse,
  onChain: { signature: string; pda: string } | null,
  config: { apiUrl: string; network: "devnet" | "mainnet-beta" },
): void {
  log.blank();
  log.raw(`  ${c.success(glyph.success)} ${c.brand("Agent created")}`);
  log.raw(`    ${c.dim("did")}          ${c.value(registered.did)}`);
  log.raw(`    ${c.dim("endpoint")}     ${c.value(registered.endpoint)}`);
  const marketplaceUrl = `${config.apiUrl.replace(/\/+$/, "")}/agent/${encodeURIComponent(registered.did)}`;
  log.raw(`    ${c.dim("marketplace")}  ${c.underline(c.brand(marketplaceUrl))}`);
  if (onChain) {
    log.raw(`    ${c.dim("pda")}          ${c.value(onChain.pda)}`);
    log.raw(
      `    ${c.dim("explorer")}     ${c.underline(c.brand(explorerAddressUrl(onChain.pda, config.network)))}`,
    );
  }
  log.blank();
  log.raw(`  ${c.brand("Try it:")}`);
  log.raw(`    ${c.value(`aip ask ${draft.agentId} "..."`)}  ${c.dim("- one-shot paid task")}`);
  log.raw(`    ${c.value(`aip chat ${draft.agentId}`)}      ${c.dim("- interactive REPL")}`);
  log.raw(`    ${c.value(`aip resolve ${draft.agentId}`)}   ${c.dim("- inspect on-chain identity")}`);
  log.blank();
}
