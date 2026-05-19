import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { Connection } from "@solana/web3.js";
import { ApiClient } from "../core/api-client.js";
import { loadConfig } from "../core/config.js";
import { AgentDetailResponseSchema, type AgentDetail } from "../core/agent-list.js";
import { TaskSchema, type Task } from "../core/task-types.js";
import { resolveAgent } from "../core/agent-resolver.js";
import { submitTaskWithPayment } from "../core/x402.js";
import { openSse } from "../core/sse.js";
import { unlockKeypair } from "../core/unlock.js";
import { rpcEndpointFor } from "../core/solana.js";
import { log } from "../core/logger.js";
import { c, glyph } from "../core/theme.js";
import { explorerTxUrl } from "../core/format.js";
import { AipError, NotFoundError, ValidationError } from "../core/errors.js";
import ora from "ora";

interface AskOptions {
  capability?: string;
  amount?: string;
  inputFile?: string;
  json?: boolean;
  noWait?: boolean;
  network?: "devnet" | "mainnet-beta";
  rpc?: string;
}

export function askCommand(): Command {
  return new Command("ask")
    .description("Send one prompt to an agent and wait for the result")
    .argument("[agent-or-prompt]", "Agent name/DID (or the prompt itself, if defaultAgent is configured)")
    .argument("[prompt]", "Prompt text (when first argument is the agent)")
    .option("-c, --capability <id>", "Capability id (defaults to the agent's first one)")
    .option("-a, --amount <usdc>", "Override the amount in USDC")
    .option("-f, --input-file <path>", "Read prompt from a file ('-' for stdin)")
    .option("--no-wait", "Submit and return the task id without waiting")
    .option("--json", "Print machine-readable JSON")
    .option("-n, --network <cluster>", "Override Solana cluster")
    .option("--rpc <url>", "Override Solana RPC endpoint")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  ${c.brand("$")} aip ask summary "AIP nedir bir cumlede"            ${c.dim("# kısa agent adı")}
  ${c.brand("$")} aip ask did:aip:platform:summary-agent "..."        ${c.dim("# tam DID")}
  ${c.brand("$")} aip config set defaultAgent summary
  ${c.brand("$")} aip ask "..."                                       ${c.dim("# default agent")}
  ${c.brand("$")} aip ask summary -f ./article.md                     ${c.dim("# dosyadan input")}
  ${c.brand("$")} echo "metin" | aip ask summary -f -                 ${c.dim("# stdin")}
`,
    )
    .action(async (first: string | undefined, second: string | undefined, opts: AskOptions) => {
      await runAsk(first, second, opts);
    });
}

async function runAsk(
  first: string | undefined,
  second: string | undefined,
  opts: AskOptions,
): Promise<void> {
  const config = await loadConfig();
  const api = new ApiClient({ baseUrl: config.apiUrl });

  const { agentIdentifier, inlinePrompt } = inferArgs(first, second, config.defaultAgent);

  if (!agentIdentifier) {
    throw new ValidationError(
      "No agent specified and no default configured",
      "Pass an agent (e.g. 'aip ask summary \"...\"') or set one: 'aip config set defaultAgent summary'.",
    );
  }

  const resolution = await resolveAgent(agentIdentifier, api);

  const detailSpinner = startSpinner(`Fetching ${resolution.did}`);
  let agent: AgentDetail;
  try {
    agent = await api.get("/api/agent-card/detail", AgentDetailResponseSchema, {
      query: { did: resolution.did },
    });
  } catch (err) {
    detailSpinner.stop();
    if (err instanceof NotFoundError) {
      throw new NotFoundError(`Agent not found: ${resolution.did}`);
    }
    throw err;
  }
  detailSpinner.stop();

  const capabilityId = opts.capability ?? agent.capabilities[0]?.id;
  if (!capabilityId) {
    throw new ValidationError(`Agent ${agent.name} advertises no capabilities.`);
  }
  const capability = agent.capabilities.find((cap) => cap.id === capabilityId);
  if (!capability) {
    throw new ValidationError(
      `Agent does not advertise capability '${capabilityId}'`,
      `Choose one of: ${agent.capabilities.map((c) => c.id).join(", ")}.`,
    );
  }

  const promptText = await readPrompt(inlinePrompt, opts.inputFile);
  const amount = opts.amount ?? capability.pricing.amount;

  printHeader(agent.name, capability.id, amount, resolution.source);

  const keypair = await unlockKeypair({ prompt: `Unlock to pay ${amount} USDC` });
  const cluster = opts.network ?? config.network;
  const connection = new Connection(rpcEndpointFor(cluster, opts.rpc ?? config.rpcUrl), "confirmed");

  const payingSpinner = startSpinner("Preparing escrow");
  let submission;
  try {
    submission = await submitTaskWithPayment(
      {
        agentEndpoint: agent.endpoint,
        capability: capability.id,
        input: promptText,
        amount,
        callerDid: `did:aip:${keypair.publicKey.toBase58()}:cli`,
        callerAddress: keypair.publicKey.toBase58(),
      },
      {
        api,
        connection,
        signer: keypair,
        cluster,
        onStep: (text) => payingSpinner.text(text),
      },
    );
  } catch (err) {
    payingSpinner.stop();
    throw err;
  }
  payingSpinner.stop();

  if (opts.noWait) {
    if (opts.json) {
      log.raw(
        JSON.stringify(
          { taskId: submission.taskId, escrowTxHash: submission.escrowTxHash },
          null,
          2,
        ),
      );
    } else {
      log.success(`Task submitted: ${c.value(submission.taskId)}`);
      log.step(`Follow: aip task stream ${submission.taskId}`);
    }
    return;
  }

  const artifact = await streamUntilEnd(api, submission.taskId);
  const task = await fetchTask(api, submission.taskId);

  if (opts.json) {
    log.raw(JSON.stringify(task, null, 2));
    return;
  }

  printResponse(task, artifact || task.artifact || "", submission.escrowTxHash, cluster);

  if (task.state === "FAILED" || task.state === "CANCELLED") {
    process.exitCode = 1;
  }
}

function inferArgs(
  first: string | undefined,
  second: string | undefined,
  defaultAgent: string | undefined,
): { agentIdentifier?: string; inlinePrompt?: string } {
  if (first !== undefined && second !== undefined) {
    return { agentIdentifier: first, inlinePrompt: second };
  }
  if (first === undefined) {
    return { agentIdentifier: defaultAgent };
  }
  // Heuristic: if the single arg has whitespace or quotes, treat it as a prompt
  // and rely on defaultAgent. Otherwise treat it as an agent identifier.
  if (/\s/.test(first) || first.length > 64) {
    return { agentIdentifier: defaultAgent, inlinePrompt: first };
  }
  return { agentIdentifier: first };
}

async function readPrompt(inlineText: string | undefined, fileArg: string | undefined): Promise<string> {
  if (fileArg) {
    if (fileArg === "-") {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      return Buffer.concat(chunks).toString("utf8").trimEnd();
    }
    return (await readFile(fileArg, "utf8")).trimEnd();
  }
  if (inlineText) return inlineText;
  throw new ValidationError(
    "No prompt provided",
    `Pass it inline ('aip ask summary "metin"') or via --input-file.`,
  );
}

function printHeader(
  agentName: string,
  capability: string,
  amount: string,
  source: "explicit-did" | "marketplace-match",
): void {
  log.blank();
  log.raw(`  ${c.brandBold("→")} ${c.value(agentName)} ${c.dim(`(${capability})`)}  ${c.success(amount + " USDC")}`);
  if (source === "marketplace-match") {
    log.raw(`  ${c.dim("resolved via marketplace lookup")}`);
  }
  log.blank();
}

function printResponse(
  task: Task,
  artifact: string,
  escrowTxHash: string | undefined,
  cluster: "devnet" | "mainnet-beta",
): void {
  log.blank();
  log.raw(`  ${c.success(glyph.success)} ${c.success(task.state)}  ${c.dim(`(${task.usdcSpent} USDC spent)`)}`);
  log.blank();
  for (const line of (artifact || "(no output)").trim().split("\n")) {
    log.raw(`  ${c.value(line)}`);
  }
  log.blank();
  if (escrowTxHash) {
    log.raw(`  ${c.dim(glyph.dot)} ${c.dim("escrow:")} ${c.underline(c.brand(explorerTxUrl(escrowTxHash, cluster)))}`);
  }
  if (task.settlementTxHash) {
    log.raw(`  ${c.dim(glyph.dot)} ${c.dim("settled:")} ${c.underline(c.brand(explorerTxUrl(task.settlementTxHash, cluster)))}`);
  }
  log.blank();
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

async function fetchTask(api: ApiClient, taskId: string): Promise<Task> {
  return api.get("/api/task", TaskSchema, { query: { taskId } });
}

interface Spinner {
  stop: () => void;
  text: (s: string) => void;
}

function startSpinner(initial: string): Spinner {
  if (!process.stderr.isTTY) {
    log.step(initial);
    return { stop: () => {}, text: (s) => log.step(s) };
  }
  const spinner = ora({ text: initial, stream: process.stderr, color: "cyan" }).start();
  return {
    stop: () => spinner.stop(),
    text: (s: string) => {
      spinner.text = s;
    },
  };
}

// Hook for any future caller that wants to skip the spinner.
export async function _runAskNoSpinner(
  first: string | undefined,
  second: string | undefined,
  opts: AskOptions,
): Promise<void> {
  void first;
  void second;
  void opts;
  throw new AipError("Not yet implemented");
}
