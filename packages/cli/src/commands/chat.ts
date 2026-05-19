import { Command } from "commander";
import * as p from "@clack/prompts";
import readline from "node:readline";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Connection } from "@solana/web3.js";
import { ApiClient } from "../core/api-client.js";
import { loadConfig } from "../core/config.js";
import {
  AgentDetailResponseSchema,
  AgentListResponseSchema,
  type AgentDetail,
  type ListedAgent,
} from "../core/agent-list.js";
import { TaskSchema } from "../core/task-types.js";
import { submitTaskWithPayment } from "../core/x402.js";
import { openSse } from "../core/sse.js";
import { unlockKeypair } from "../core/unlock.js";
import { rpcEndpointFor } from "../core/solana.js";
import { paths, ensureDir } from "../core/paths.js";
import { log } from "../core/logger.js";
import { c, glyph } from "../core/theme.js";
import {
  AipError,
  NotFoundError,
  ValidationError,
} from "../core/errors.js";
import { explorerTxUrl } from "../core/format.js";
import { resolveAgent } from "../core/agent-resolver.js";

interface ChatOpts {
  capability?: string;
  network?: "devnet" | "mainnet-beta";
  rpc?: string;
  noHistory?: boolean;
}

interface Turn {
  at: string;
  prompt: string;
  response: string;
  taskId: string;
  usdcSpent: string;
  escrowTxHash?: string;
}

interface Session {
  agent: AgentDetail;
  capabilityId: string;
  startedAt: string;
  turns: Turn[];
  totalSpent: number;
}

const SEPARATOR = "─".repeat(56);

export function chatCommand(): Command {
  return new Command("chat")
    .description("Open an interactive REPL with an agent (x402 pays per turn)")
    .argument("[did]", "Target agent's DID (skip to pick interactively)")
    .option("-c, --capability <id>", "Capability id to call each turn (defaults to the agent's first one)")
    .option("-n, --network <cluster>", "Override Solana cluster")
    .option("--rpc <url>", "Override Solana RPC endpoint")
    .option("--no-history", "Do not persist the transcript to ~/.aip/history/")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip chat                                          ${c.dim("# pick agent interactively")}
  $ aip chat summary                                  ${c.dim("# resolve marketplace shortname")}
  $ aip chat did:aip:7imsPo1owz6arqjqHpHvEfNgTepXnm9vtjmHQoVWmABX:summary-agent
  $ aip chat <did> --capability text.summarize

${c.dim("Slash commands in-session:")}
  /help     show this list
  /cost     total USDC spent this session
  /clear    clear the terminal
  /save     save the transcript to a file
  /exit     end the session
`,
    )
    .action(async (did: string | undefined, opts: ChatOpts) => {
      await runChat(did, opts);
    });
}

async function runChat(did: string | undefined, opts: ChatOpts): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new AipError(
      "aip chat requires an interactive terminal",
      undefined,
      "Use 'aip task submit' for non-interactive task submission.",
    );
  }

  const config = await loadConfig();
  const cluster = opts.network ?? config.network;
  const api = new ApiClient({ baseUrl: config.apiUrl });

  const agent = did ? await fetchAgent(api, did) : await pickAgent(api);
  const capability = chooseCapability(agent, opts.capability);

  printHeader(agent, capability.id, capability.pricing.amount);

  const keypair = await unlockKeypair({ prompt: `Unlock wallet to pay ${capability.pricing.amount} USDC per turn` });
  const connection = new Connection(
    rpcEndpointFor(cluster, opts.rpc ?? config.rpcUrl),
    "confirmed",
  );

  const session: Session = {
    agent,
    capabilityId: capability.id,
    startedAt: new Date().toISOString(),
    turns: [],
    totalSpent: 0,
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  rl.on("SIGINT", () => {
    rl.close();
  });

  try {
    while (true) {
      const input = await prompt(rl, `${c.brand("›")} `);
      if (input === null) break;
      const trimmed = input.trim();
      if (trimmed === "") continue;

      if (trimmed.startsWith("/")) {
        const cont = await handleSlash(trimmed, session, opts);
        if (!cont) break;
        continue;
      }

      await runTurn(trimmed, session, { api, connection, keypair, cluster });
    }
  } finally {
    rl.close();
    await maybePersistTranscript(session, opts);
    printFooter(session);
  }
}

async function runTurn(
  promptText: string,
  session: Session,
  ctx: {
    api: ApiClient;
    connection: Connection;
    keypair: import("@solana/web3.js").Keypair;
    cluster: "devnet" | "mainnet-beta";
  },
): Promise<void> {
  const indicator = startTurnSpinner();
  let submission;
  try {
    submission = await submitTaskWithPayment(
      {
        agentEndpoint: session.agent.endpoint,
        capability: session.capabilityId,
        input: promptText,
        amount: priceFor(session.agent, session.capabilityId),
        callerDid: `did:aip:${ctx.keypair.publicKey.toBase58()}:cli`,
        callerAddress: ctx.keypair.publicKey.toBase58(),
      },
      {
        api: ctx.api,
        connection: ctx.connection,
        signer: ctx.keypair,
        cluster: ctx.cluster,
        onStep: (text) => indicator.text(text),
      },
    );
  } catch (err) {
    indicator.stop();
    if (err instanceof AipError) {
      log.error(err.message, err.hint);
    } else {
      log.error((err as Error).message);
    }
    return;
  }
  indicator.stop();

  const response = await streamUntilEnd(ctx.api, submission.taskId);
  const task = await fetchTask(ctx.api, submission.taskId);
  const cleanResponse = response.trim() || task.artifact?.trim() || "(no output)";

  process.stdout.write("\n");
  for (const line of cleanResponse.split("\n")) {
    process.stdout.write(`  ${c.value(line)}\n`);
  }
  process.stdout.write("\n");

  if (submission.escrowTxHash) {
    process.stdout.write(
      `  ${c.dim(glyph.dot)} ${c.dim("settled")}  ${c.dim(explorerTxUrl(submission.escrowTxHash, ctx.cluster))}\n\n`,
    );
  }

  // Backend's task.usdcSpent is sometimes empty/0 even on success — fall
  // back to the price we actually paid for this capability. If the task
  // ended in FAILED/CANCELLED the escrow program refunds, so don't count.
  const pricePaid = priceFor(session.agent, session.capabilityId);
  const refunded = task.state === "FAILED" || task.state === "CANCELLED";
  const turnSpent = refunded ? 0 : parseFloat(task.usdcSpent) || parseFloat(pricePaid) || 0;

  session.turns.push({
    at: new Date().toISOString(),
    prompt: promptText,
    response: cleanResponse,
    taskId: submission.taskId,
    usdcSpent: turnSpent.toFixed(4),
    escrowTxHash: submission.escrowTxHash || undefined,
  });
  session.totalSpent += turnSpent;
}

async function streamUntilEnd(api: ApiClient, taskId: string): Promise<string> {
  const url = api.url(`/api/task/${encodeURIComponent(taskId)}/stream`);
  const chunks: string[] = [];
  for await (const event of openSse(url)) {
    if (event.event === "end") {
      try {
        const parsed = JSON.parse(event.data) as { artifact?: string };
        if (parsed.artifact) chunks.push(parsed.artifact);
      } catch {
        /* ignore */
      }
      break;
    }
  }
  return chunks.join("");
}

async function fetchTask(api: ApiClient, taskId: string) {
  return api.get("/api/task", TaskSchema, { query: { taskId } });
}

async function handleSlash(command: string, session: Session, opts: ChatOpts): Promise<boolean> {
  const [verb, ...rest] = command.slice(1).split(/\s+/);
  switch (verb) {
    case "exit":
    case "quit":
      return false;
    case "clear":
      process.stdout.write("\x1Bc");
      printHeader(session.agent, session.capabilityId, priceFor(session.agent, session.capabilityId));
      return true;
    case "cost":
      log.raw(
        `  ${c.label("spent")}  ${c.value(session.totalSpent.toFixed(4))} ${c.dim("USDC")}  ${c.dim(`across ${session.turns.length} turn(s)`)}\n`,
      );
      return true;
    case "help":
      printHelp();
      return true;
    case "save": {
      const target = rest.join(" ").trim() || defaultTranscriptPath(session);
      await saveTranscript(session, target, opts);
      log.success(`Saved transcript to ${target}\n`);
      return true;
    }
    default:
      log.warn(`Unknown command: /${verb}  (try /help)`);
      return true;
  }
}

function printHeader(agent: AgentDetail, capability: string, price: string): void {
  process.stdout.write("\n");
  process.stdout.write(`  ${c.dim(SEPARATOR)}\n`);
  process.stdout.write(`  ${c.brandBold("chat")} ${c.dim(glyph.dot)} ${c.value(agent.name)}\n`);
  process.stdout.write(`  ${c.dim(agent.did)}\n`);
  process.stdout.write(`  ${c.dim(SEPARATOR)}\n`);
  process.stdout.write(
    `  ${c.dim("capability:")} ${c.value(capability)}   ${c.dim("price:")} ${c.success(price)} ${c.dim("USDC/turn")}\n`,
  );
  process.stdout.write(`  ${c.dim("type /help for slash commands · /exit to leave")}\n\n`);
}

function printFooter(session: Session): void {
  process.stdout.write("\n");
  process.stdout.write(`  ${c.dim(SEPARATOR)}\n`);
  process.stdout.write(
    `  ${c.brand(glyph.success)} ${c.value(String(session.turns.length))} ${c.dim("turn(s)")}  ${c.dim(glyph.dot)}  ${c.value(session.totalSpent.toFixed(4))} ${c.dim("USDC spent")}\n`,
  );
  process.stdout.write(`  ${c.dim(SEPARATOR)}\n\n`);
}

function printHelp(): void {
  const rows: Array<{ k: string; v: string }> = [
    { k: "/help", v: "show this list" },
    { k: "/cost", v: "total USDC spent this session" },
    { k: "/clear", v: "clear the screen" },
    { k: "/save", v: "save the transcript to a file (defaults to ~/.aip/history/)" },
    { k: "/exit", v: "end the session (Ctrl+D also works)" },
  ];
  process.stdout.write("\n");
  for (const { k, v } of rows) {
    process.stdout.write(`  ${c.brand(k.padEnd(8))}  ${c.dim(v)}\n`);
  }
  process.stdout.write("\n");
}

function prompt(rl: readline.Interface, text: string): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    rl.question(text, (answer) => {
      if (resolved) return;
      resolved = true;
      resolve(answer);
    });
    rl.once("close", () => {
      if (resolved) return;
      resolved = true;
      resolve(null);
    });
  });
}

function chooseCapability(agent: AgentDetail, requestedId: string | undefined) {
  if (agent.capabilities.length === 0) {
    throw new ValidationError("This agent advertises no capabilities, so there's nothing to chat with.");
  }
  if (requestedId === undefined) {
    return agent.capabilities[0]!;
  }
  const found = agent.capabilities.find((cap) => cap.id === requestedId);
  if (!found) {
    throw new ValidationError(
      `Agent does not advertise capability '${requestedId}'`,
      `Choose one of: ${agent.capabilities.map((c) => c.id).join(", ")}`,
    );
  }
  return found;
}

function priceFor(agent: AgentDetail, capabilityId: string): string {
  const cap = agent.capabilities.find((c) => c.id === capabilityId);
  if (!cap) throw new ValidationError(`Capability '${capabilityId}' vanished from agent metadata`);
  return cap.pricing.amount;
}

async function fetchAgent(api: ApiClient, identifier: string): Promise<AgentDetail> {
  try {
    const resolution = await resolveAgent(identifier, api);
    return await api.get("/api/agent-card/detail", AgentDetailResponseSchema, {
      query: { did: resolution.did },
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new NotFoundError(
        `Agent not found: ${identifier}`,
        "Run 'aip agents ls' to see what's available.",
      );
    }
    throw err;
  }
}

async function pickAgent(api: ApiClient): Promise<AgentDetail> {
  const listResp = await api.get("/api/agent-card", AgentListResponseSchema, {
    query: { list: true },
  });
  if (listResp.agents.length === 0) {
    throw new NotFoundError("No agents available on the marketplace");
  }
  const choice = await p.select({
    message: "Pick an agent to chat with",
    options: listResp.agents.map((a: ListedAgent) => ({
      value: a.did,
      label: `${a.name}  ${a.type}`,
      hint: `${a.capabilities[0]?.pricing.amount ?? "?"} USDC`,
    })),
  });
  if (p.isCancel(choice)) {
    p.cancel("Cancelled.");
    throw new AipError("Chat cancelled");
  }
  return fetchAgent(api, String(choice));
}

async function maybePersistTranscript(session: Session, opts: ChatOpts): Promise<void> {
  if (opts.noHistory) return;
  if (session.turns.length === 0) return;
  const target = defaultTranscriptPath(session);
  try {
    await saveTranscript(session, target, opts);
    log.step(`Transcript saved: ${target}`);
  } catch (err) {
    log.warn(`Could not save transcript: ${(err as Error).message}`);
  }
}

function defaultTranscriptPath(session: Session): string {
  const safeName = session.agent.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const stamp = session.startedAt.replace(/[:.]/g, "-");
  return join(paths.historyDir(), `${safeName}-${stamp}.json`);
}

async function saveTranscript(session: Session, target: string, _opts: ChatOpts): Promise<void> {
  await ensureDir(paths.historyDir());
  await mkdir(target.replace(/[^/]+$/, "") || ".", { recursive: true }).catch(() => {});
  const payload = {
    agent: { did: session.agent.did, name: session.agent.name, endpoint: session.agent.endpoint },
    capabilityId: session.capabilityId,
    startedAt: session.startedAt,
    endedAt: new Date().toISOString(),
    totalSpentUsdc: session.totalSpent,
    turns: session.turns,
  };
  await writeFile(target, JSON.stringify(payload, null, 2) + "\n", { mode: 0o600 });
}

interface TurnIndicator {
  stop: () => void;
  text: (s: string) => void;
}

function startTurnSpinner(): TurnIndicator {
  if (!process.stderr.isTTY) {
    const noop = () => {};
    return { stop: noop, text: () => {} };
  }
  // Lightweight: don't depend on ora here; ora is loaded by other paths.
  let frame = 0;
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let label = "thinking";
  const interval = setInterval(() => {
    process.stderr.write(`\r  ${c.brand(frames[frame % frames.length]!)} ${c.dim(label)}      `);
    frame++;
  }, 80);
  return {
    stop: () => {
      clearInterval(interval);
      process.stderr.write("\r" + " ".repeat(80) + "\r");
    },
    text: (s: string) => {
      label = s;
    },
  };
}
