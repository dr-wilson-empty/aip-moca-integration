/**
 * `aip resolve` - DID inspector built on top of @aipagents/did-resolver.
 *
 * Two modes:
 *   - Single-shot:  aip resolve <did|ref|url>
 *   - Interactive:  aip resolve            (REPL loop, useful for triaging
 *                                           several DIDs in one sitting)
 *
 * All identifier dispatch lives in `core/resolution.ts:runResolution` so
 * tests and any future caller (e.g. an MCP tool) can share the same
 * pipeline.
 */
import { Command } from "commander";
import { createInterface } from "node:readline";
import { c, glyph } from "../core/theme.js";
import { log } from "../core/logger.js";
import { AipError, isAipError, ValidationError } from "../core/errors.js";
import {
  runResolution,
  serializeIdentityReport,
  type ResolutionOptions,
} from "../core/resolution.js";
import {
  renderIdentityReport,
  type IdentityReport,
} from "../ui/card.js";
import { refFromDid } from "../core/format.js";

/* ------------------------------------------------------------------ */
/*  Demo identifiers shown by the REPL's `examples` shortcut.          */
/*  Keep these in sync with the platform's seeded agents.              */
/* ------------------------------------------------------------------ */
const EXAMPLE_DIDS: Array<{ did: string; name: string }> = [
  { did: "did:aip:7imsPo1owz6arqjqHpHvEfNgTepXnm9vtjmHQoVWmABX:summary-agent", name: "Summary Agent" },
  { did: "did:aip:7imsPo1owz6arqjqHpHvEfNgTepXnm9vtjmHQoVWmABX:data-agent",    name: "Data Agent" },
  { did: "did:aip:7imsPo1owz6arqjqHpHvEfNgTepXnm9vtjmHQoVWmABX:audit-agent",   name: "Audit Agent" },
  { did: "did:aip:7imsPo1owz6arqjqHpHvEfNgTepXnm9vtjmHQoVWmABX:web-search",    name: "Web Search Agent" },
  { did: "did:aip:EnGi1sk7Dme78evMGw4noeYdPUTUJtmPjxZCXq3Wkvez:boycott-agent", name: "Boycott Agent" },
];

export function resolveCommand(): Command {
  return new Command("resolve")
    .description("Inspect a did:aip identifier (single-shot or interactive REPL)")
    .argument("[identifier]", "did:aip:… , agent ref, or http(s):// URL. Omit for interactive mode.")
    .option("-n, --network <cluster>", "Override network (devnet | mainnet-beta)", (v) => {
      if (v !== "devnet" && v !== "mainnet-beta") {
        throw new ValidationError(`Unknown network '${v}'`, "Use 'devnet' or 'mainnet-beta'.");
      }
      return v;
    })
    .option("--rpc <url>", "Override Solana RPC endpoint")
    .option("--json", "Print machine-readable JSON instead of the rendered report")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip resolve summary-agent                              ${c.dim("# resolve by marketplace ref")}
  $ aip resolve did:aip:7imsPo1owz6...mABX:summary-agent   ${c.dim("# resolve by full DID")}
  $ aip resolve https://my-agent.example.com               ${c.dim("# probe a live agent URL")}
  $ aip resolve                                            ${c.dim("# interactive REPL mode")}
  $ aip resolve <did> --json | jq .agentRecord             ${c.dim("# machine-readable output")}

${c.dim("Powered by")} ${c.brand("@aipagents/did-resolver")} ${c.dim("- the same package any TypeScript app can use to read on-chain agent identity.")}
`,
    )
    .action(async (identifier: string | undefined, opts: ResolutionOptions) => {
      if (identifier) {
        await runSingleShot(identifier, opts);
      } else {
        await runRepl(opts);
      }
    });
}

/* ------------------------------------------------------------------ */
/*  Single-shot - render the identity card, plus a "Try it" footer    */
/*  "Try it" footer with next-step commands derived from the result.   */
/* ------------------------------------------------------------------ */

async function runSingleShot(identifier: string, opts: ResolutionOptions): Promise<void> {
  const report = await runResolution(identifier, opts);

  if (opts.json) {
    log.raw(JSON.stringify(serializeIdentityReport(report), null, 2));
    return;
  }

  renderIdentityReport(report);
  printTryItFooter(report);
}

function printTryItFooter(report: IdentityReport): void {
  // Only suggest follow-ups when we actually resolved something usable.
  let did: string | undefined;
  if (report.kind === "on-chain") did = report.did;
  else if (report.kind === "marketplace-only") did = report.did;
  if (!did) return;

  const ref = refFromDid(did);
  log.raw(`  ${c.brand("Try it")}`);
  log.raw(`    ${c.value(`aip ask ${ref} "..."`)} ${c.dim("- one-shot prompt, auto-pays in USDC")}`);
  log.raw(`    ${c.value(`aip chat ${ref}`)}      ${c.dim("- interactive REPL with the agent")}`);
  log.blank();
}

/* ------------------------------------------------------------------ */
/*  REPL - paste DIDs / refs one at a time and see compact cards.      */
/* ------------------------------------------------------------------ */

function runRepl(opts: ResolutionOptions): Promise<void> {
  if (!process.stdin.isTTY) {
    return Promise.reject(new AipError(
      "Interactive mode requires a TTY",
      undefined,
      "Re-run with an identifier, e.g. `aip resolve <did|ref>`.",
    ));
  }

  log.blank();
  log.raw(`  ${c.brandBold("◆  aip resolve")}  ${c.dim("- interactive DID inspector")}`);
  log.raw(`  ${c.dim("Paste a did:aip:… or marketplace ref.")}`);
  log.raw(`  ${c.dim("Type")} ${c.value("examples")} ${c.dim("for known demo DIDs,")} ${c.value("exit")} ${c.dim("to quit (or Ctrl-D).")}`);
  log.blank();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `  ${c.brand("›")} `,
    terminal: true,
  });

  return new Promise<void>((resolve) => {
    let processing = false;

    rl.on("line", (rawLine) => {
      // Guard against the user typing the next prompt while we're still
      // resolving the previous one. Readline events are not awaited, so
      // without this guard a fast typist could interleave two resolves.
      if (processing) return;

      const input = rawLine.trim();
      if (input.length === 0) {
        rl.prompt();
        return;
      }
      if (input === "exit" || input === "quit") {
        rl.close();
        return;
      }
      if (input === "examples") {
        printExamples();
        rl.prompt();
        return;
      }
      if (input === "help" || input === "?") {
        printReplHelp();
        rl.prompt();
        return;
      }

      processing = true;
      rl.pause();
      runResolution(input, opts)
        .then((report) => {
          log.blank();
          renderReplLine(report);
          log.blank();
        })
        .catch((err) => {
          log.blank();
          if (isAipError(err)) {
            log.error(err.message, err.hint);
          } else {
            log.error(err instanceof Error ? err.message : String(err));
          }
          log.blank();
        })
        .finally(() => {
          processing = false;
          rl.resume();
          rl.prompt();
        });
    });

    rl.on("close", () => {
      log.blank();
      log.raw(`  ${c.dim("Goodbye.")}`);
      log.blank();
      resolve();
    });

    rl.prompt();
  });
}

function renderReplLine(report: IdentityReport): void {
  switch (report.kind) {
    case "on-chain": {
      const r = report.record;
      const caps = r.capabilities.map((cap) => cap.name).join(" · ");
      log.raw(`  ${c.brandBold("◆")} ${c.value(r.name)}   ${c.success("✓ on-chain")}`);
      log.raw(`    ${c.label("ref")}      ${c.brand(refFromDid(report.did))}`);
      log.raw(`    ${c.label("owner")}    ${c.value(r.owner)}`);
      log.raw(`    ${c.label("caps")}     ${c.dim(caps || "(none)")}`);
      log.raw(`    ${c.label("pda")}      ${c.value(report.metadata.pda)}  ${c.dim(`slot ${report.metadata.slot}`)}`);
      return;
    }
    case "on-chain-missing": {
      log.raw(`  ${c.error(glyph.failure)} ${c.error(report.did)}`);
      log.raw(`    ${c.dim(report.reason === "not-found"
        ? "No record at the derived PDA."
        : report.reason === "invalid-did"
          ? "DID does not match did:aip format."
          : "Account exists but cannot be decoded under the current schema.")}`);
      return;
    }
    case "marketplace-only": {
      log.raw(`  ${c.warning("●")} ${c.value(report.card.name)}   ${c.dim("(marketplace only)")}`);
      log.raw(`    ${c.dim("Listed off-chain - no canonical PDA could be derived from this DID.")}`);
      return;
    }
    case "url-probe": {
      if (report.probe.ok && report.probe.card) {
        log.raw(`  ${c.success(glyph.success)} ${c.value(report.probe.card.name)}   ${c.dim(`(probed ${report.input})`)}`);
      } else {
        log.raw(`  ${c.error(glyph.failure)} ${c.error(report.input)}   ${c.dim(report.probe.reason || "no AgentCard at this URL")}`);
      }
      return;
    }
    case "unsupported-did": {
      log.raw(`  ${c.warning(glyph.warn)} ${c.value(report.did)}   ${c.dim(`unsupported DID method (did:${report.method})`)}`);
      return;
    }
  }
}

function printExamples(): void {
  log.blank();
  log.raw(`  ${c.brand("Try one of these")}`);
  for (const ex of EXAMPLE_DIDS) {
    log.raw(`    ${c.value(ex.did)}  ${c.dim(ex.name)}`);
  }
  log.raw(`  ${c.dim("Or copy the")} ${c.brand("ref")} ${c.dim("from")} ${c.value("aip agents ls")}${c.dim(".")}`);
  log.blank();
}

function printReplHelp(): void {
  log.blank();
  log.raw(`  ${c.brand("REPL commands")}`);
  log.raw(`    ${c.value("examples")}   ${c.dim("show known demo DIDs")}`);
  log.raw(`    ${c.value("help")}       ${c.dim("this message")}`);
  log.raw(`    ${c.value("exit")}       ${c.dim("quit (or Ctrl-D)")}`);
  log.raw(`  ${c.dim("Otherwise paste any did:aip:…, marketplace ref, or http(s):// URL.")}`);
  log.blank();
}
