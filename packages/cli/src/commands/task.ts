import { Command } from "commander";
import ora from "ora";
import { readFile } from "node:fs/promises";
import { Connection } from "@solana/web3.js";
import { ApiClient } from "../core/api-client.js";
import { loadConfig } from "../core/config.js";
import { AgentDetailResponseSchema, type AgentDetail } from "../core/agent-list.js";
import { TaskSchema, type Task } from "../core/task-types.js";
import { submitTaskWithPayment } from "../core/x402.js";
import { openSse } from "../core/sse.js";
import { unlockKeypair } from "../core/unlock.js";
import { rpcEndpointFor } from "../core/solana.js";
import { resolveAgent } from "../core/agent-resolver.js";
import { log } from "../core/logger.js";
import { c } from "../core/theme.js";
import {
  NetworkError,
  NotFoundError,
  ValidationError,
} from "../core/errors.js";
import { renderStreamEvent, renderTaskSummary } from "../ui/task-report.js";

interface SubmitOpts {
  capability?: string;
  input?: string;
  inputFile?: string;
  amount?: string;
  wait?: boolean;
  json?: boolean;
  network?: "devnet" | "mainnet-beta";
  rpc?: string;
}

interface StatusOpts {
  json?: boolean;
  network?: "devnet" | "mainnet-beta";
}

interface StreamOpts {
  network?: "devnet" | "mainnet-beta";
}

export function taskCommand(): Command {
  const cmd = new Command("task")
    .description("Submit, inspect, and follow agent tasks")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip task submit did:aip:platform:summary-agent \\
      --capability text.summarize --input "AIP is the agent internet protocol"
  $ aip task submit <did> --capability x --input-file ./prompt.md --wait
  $ aip task status task_xxx
  $ aip task stream task_xxx          ${c.dim("# tail live SSE log")}
`,
    );

  cmd
    .command("submit [did]")
    .description("Submit a task to an agent (pays via x402 escrow). Interactive picker if did omitted.")
    .option("-c, --capability <id>", "Capability id (defaults to the first one the agent advertises)")
    .option("-i, --input <text>", "Inline input text")
    .option("-f, --input-file <path>", "Read input from a file (use '-' for stdin)")
    .option("-a, --amount <usdc>", "Override the amount in USDC (defaults to the capability's listed price)")
    .option("-w, --wait", "Stream the task to completion before returning")
    .option("--json", "Print machine-readable JSON")
    .option("-n, --network <cluster>", "Override Solana cluster")
    .option("--rpc <url>", "Override Solana RPC endpoint")
    .action(async (did: string | undefined, opts: SubmitOpts) => {
      await runSubmit(did, opts);
    });

  cmd
    .command("status <taskId>")
    .description("Print the current state of a task")
    .option("--json", "Print machine-readable JSON")
    .option("-n, --network <cluster>", "Cluster to use for explorer links")
    .action(async (taskId: string, opts: StatusOpts) => {
      await runStatus(taskId, opts);
    });

  cmd
    .command("stream <taskId>")
    .description("Tail the live SSE log of a task")
    .option("-n, --network <cluster>", "Cluster to use for explorer links")
    .action(async (taskId: string, opts: StreamOpts) => {
      await runStream(taskId, opts);
    });

  return cmd;
}

async function runSubmit(identifier: string | undefined, opts: SubmitOpts): Promise<void> {
  const config = await loadConfig();
  const cluster = opts.network ?? config.network;
  const api = new ApiClient({ baseUrl: config.apiUrl });

  // No agent: marketplace picker.
  if (!identifier) {
    const { pickAgentInteractively, canPromptInteractively } = await import("../core/interactive.js");
    if (!canPromptInteractively()) {
      throw new ValidationError(
        "No agent identifier specified",
        "Pass an agent ref or DID, e.g. 'aip task submit summary -i \"...\"'.",
      );
    }
    identifier = await pickAgentInteractively(api, { message: "Pick an agent to submit to" });
  }

  const lookupSpinner = startSpinner(`Looking up ${identifier}`);
  let agent: AgentDetail;
  try {
    const resolution = await resolveAgent(identifier, api);
    agent = await api.get("/api/agent-card/detail", AgentDetailResponseSchema, {
      query: { did: resolution.did },
    });
  } catch (err) {
    lookupSpinner.stop();
    if (err instanceof NotFoundError) {
      throw new NotFoundError(
        `Agent not found: ${identifier}`,
        "Run 'aip agents ls' to see available DIDs.",
      );
    }
    throw err;
  }
  lookupSpinner.stop();

  const capabilityId = opts.capability ?? agent.capabilities[0]?.id;
  if (!capabilityId) {
    throw new ValidationError(`Agent has no capabilities to call.`);
  }
  const capability = agent.capabilities.find((cap) => cap.id === capabilityId);
  if (!capability) {
    throw new ValidationError(
      `Agent does not advertise capability '${capabilityId}'`,
      `Choose one of: ${agent.capabilities.map((c) => c.id).join(", ")}.`,
    );
  }

  const input = await readInput(opts);
  const amount = opts.amount ?? capability.pricing.amount;

  const keypair = await unlockKeypair({ prompt: `Unlock to pay ${amount} USDC` });
  const rpcUrl = rpcEndpointFor(cluster, opts.rpc ?? config.rpcUrl);
  const connection = new Connection(rpcUrl, "confirmed");

  const submitSpinner = startSpinner("Preparing escrow");
  let result;
  try {
    result = await submitTaskWithPayment(
      {
        agentEndpoint: agent.endpoint,
        capability: capability.id,
        input,
        amount,
        callerDid: `did:aip:${keypair.publicKey.toBase58()}:cli`,
        callerAddress: keypair.publicKey.toBase58(),
      },
      {
        api,
        connection,
        signer: keypair,
        cluster,
        onStep: (text) => submitSpinner.text(text),
      },
    );
  } catch (err) {
    submitSpinner.stop();
    throw err;
  }
  submitSpinner.stop();

  log.success(`Task submitted: ${c.value(result.taskId)}`);
  if (result.escrowTxHash) {
    log.step(`escrow tx: ${result.escrowTxHash}`);
  }
  log.blank();

  if (!opts.wait) {
    if (opts.json) {
      log.raw(JSON.stringify({ taskId: result.taskId, escrowTxHash: result.escrowTxHash }, null, 2));
    } else {
      log.raw(`  ${c.dim("To follow:")} ${c.brand(`aip task stream ${result.taskId}`)}`);
      log.blank();
    }
    return;
  }

  const final = await streamTask(api, result.taskId);
  const task = await fetchTask(api, result.taskId);
  if (opts.json) {
    log.raw(JSON.stringify(task, null, 2));
  } else {
    renderTaskSummary(task, cluster);
  }
  if (final === "FAILED" || final === "CANCELLED") {
    process.exitCode = 1;
  }
}

async function runStatus(taskId: string, opts: StatusOpts): Promise<void> {
  const config = await loadConfig();
  const api = new ApiClient({ baseUrl: config.apiUrl });
  const task = await fetchTask(api, taskId);
  if (opts.json) {
    log.raw(JSON.stringify(task, null, 2));
    return;
  }
  renderTaskSummary(task, opts.network ?? config.network);
}

async function runStream(taskId: string, _opts: StreamOpts): Promise<void> {
  const config = await loadConfig();
  const api = new ApiClient({ baseUrl: config.apiUrl });
  const finalState = await streamTask(api, taskId);
  if (finalState === "FAILED" || finalState === "CANCELLED") {
    process.exitCode = 1;
  }
}

async function streamTask(api: ApiClient, taskId: string): Promise<string | undefined> {
  const url = api.url(`/api/task/${encodeURIComponent(taskId)}/stream`);
  log.blank();
  log.raw(`  ${c.dim("streaming")} ${c.value(taskId)}`);
  log.blank();
  let finalState: string | undefined;
  for await (const event of openSse(url)) {
    renderStreamEvent(event);
    if (event.event === "end") {
      try {
        const parsed = JSON.parse(event.data) as { state?: string };
        finalState = parsed.state;
      } catch {
        /* ignore */
      }
      break;
    }
  }
  return finalState;
}

async function fetchTask(api: ApiClient, taskId: string): Promise<Task> {
  try {
    return await api.get("/api/task", TaskSchema, { query: { taskId } });
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new NotFoundError(
        `No task with id '${taskId}'`,
        "It may have expired or been wiped. Submit a new one with 'aip task submit'.",
      );
    }
    if (err instanceof NetworkError && err.status === 404) {
      throw new NotFoundError(`No task with id '${taskId}'`);
    }
    throw err;
  }
}

async function readInput(opts: SubmitOpts): Promise<string> {
  if (opts.input !== undefined) return opts.input;
  if (opts.inputFile === undefined) {
    // No input flags - prompt interactively if we have a TTY, otherwise
    // bail out with the same error script users used to see.
    const { promptForText, canPromptInteractively } = await import("../core/interactive.js");
    if (!canPromptInteractively()) {
      throw new ValidationError(
        "Either --input or --input-file is required",
        "Pass the prompt inline with --input \"...\" or use --input-file path (or '-' for stdin).",
      );
    }
    return promptForText("Task input", { placeholder: "What should the agent do?" });
  }
  if (opts.inputFile === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString("utf8").trimEnd();
  }
  const data = await readFile(opts.inputFile, "utf8");
  return data.trimEnd();
}

interface Spinner {
  stop: () => void;
  text: (s: string) => void;
}

function startSpinner(initial: string): Spinner {
  if (!process.stderr.isTTY) {
    log.step(initial);
    return {
      stop: () => {},
      text: (s: string) => log.step(s),
    };
  }
  const spinner = ora({ text: initial, stream: process.stderr, color: "cyan" }).start();
  return {
    stop: () => spinner.stop(),
    text: (s: string) => {
      spinner.text = s;
    },
  };
}
