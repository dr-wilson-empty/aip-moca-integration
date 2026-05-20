/**
 * Interactive shell - what you get when you run `aip` with no
 * subcommand on a TTY. Drops into a persistent `aip ›` prompt
 * where every command is dispatched without the `aip` prefix.
 *
 * Inspired by Claude Code's REPL: hit return to send, /clear and
 * /help as meta commands, exit / quit / Ctrl-D to leave.
 */
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import { c } from "../core/theme.js";
import { log } from "../core/logger.js";

/**
 * The set of root commands the dispatcher recognises. Used to reject
 * unknown commands cleanly (with a "did you mean" hint) instead of
 * letting Commander silently fall through to the default action and
 * re-render the welcome banner.
 *
 * Keep in sync with the registrations in cli.ts:buildProgram.
 */
const KNOWN_COMMANDS = new Set([
  "agents",
  "ask",
  "budget",
  "chat",
  "config",
  "explorer",
  "init",
  "login",
  "logout",
  "mcp",
  "register",
  "resolve",
  "task",
  "whoami",
]);

/** Tiny suggester: close enough for "agent" → "agents", "as" → "ask". */
function suggestCommand(input: string): string | null {
  const lower = input.toLowerCase();
  for (const cmd of KNOWN_COMMANDS) {
    if (cmd === lower + "s" || lower === cmd + "s") return cmd;
    if (cmd.startsWith(lower) && cmd.length - lower.length <= 3) return cmd;
    if (lower.startsWith(cmd) && lower.length - cmd.length <= 2) return cmd;
  }
  return null;
}

/**
 * Split a shell-style command line into argv-like tokens. Supports
 * single and double quoted strings; doesn't try to be a full POSIX
 * parser (no backslash escapes, no env expansion - this is a CLI
 * dispatcher, not bash).
 */
function splitArgs(line: string): string[] {
  const args: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    args.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return args;
}

function showShellHelp(): void {
  log.blank();
  log.raw(`  ${c.brand("Common commands")}  ${c.dim("(no 'aip' prefix needed in shell)")}`);
  log.raw(`    ${c.value("agents ls")}                 ${c.dim("Browse the marketplace")}`);
  log.raw(`    ${c.value('ask <ref> "prompt"')}        ${c.dim("Send one prompt, auto-pays in USDC")}`);
  log.raw(`    ${c.value("chat <ref>")}                ${c.dim("Multi-turn REPL with an agent")}`);
  log.raw(`    ${c.value("resolve <did|ref|url>")}     ${c.dim("Inspect an agent's identity")}`);
  log.raw(`    ${c.value("whoami")}                    ${c.dim("Show active wallet + balances")}`);
  log.blank();
  log.raw(`  ${c.brand("Shell meta")}`);
  log.raw(`    ${c.value("/help")}    ${c.dim("this message")}`);
  log.raw(`    ${c.value("/clear")}   ${c.dim("clear the screen")}`);
  log.raw(`    ${c.value("/full")}    ${c.dim("show the full command list (=`aip --help`)")}`);
  log.raw(`    ${c.value("exit")}     ${c.dim("quit (or Ctrl-D)")}`);
  log.blank();
}

export function runInteractiveShell(): Promise<void> {
  // The caller (cli.ts default action) already printed the welcome
  // banner. We just open the prompt and dispatch lines until exit.

  log.raw(`  ${c.dim("Shell mode. Type")} ${c.value("/help")} ${c.dim("for commands,")} ${c.value("exit")} ${c.dim("to quit.")}`);
  log.blank();

  // Line-buffered mode (terminal: false) on purpose:
  //   - Node 25's raw-mode readline conflicts with macOS Terminal's
  //     own keyboard echo, producing duplicated keystrokes (typing
  //     "clear" prints "cccllleeeaaarrr").
  //   - In line-buffered mode the terminal itself handles echo and
  //     line editing; readline just waits for newline-delimited
  //     chunks. We give up arrow-history + tab completion, but the
  //     UX is correct.
  // We print the prompt ourselves with process.stdout.write so we
  // can keep brand styling that readline can't measure correctly.
  const writePrompt = () => process.stdout.write(`${c.brand("AIP")} > `);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  return new Promise<void>((resolve) => {
    let processing = false;
    let closed = false;

    const finish = () => {
      if (closed) return;
      closed = true;
      log.blank();
      log.raw(`  ${c.dim("Goodbye.")}`);
      log.blank();
      resolve();
    };

    process.on("SIGINT", () => {
      // Convert Ctrl-C into a clean shutdown instead of leaving the
      // terminal in raw mode and the parent process hung.
      rl.close();
    });

    writePrompt();

    rl.on("line", async (rawLine) => {
      // Guard against double-fire while a command is mid-execution.
      if (processing) return;

      const line = rawLine.trim();
      if (line.length === 0) {
        writePrompt();
        return;
      }

      // Meta / shell commands
      if (line === "exit" || line === "quit" || line === "/exit" || line === "/quit") {
        rl.close();
        return;
      }
      if (line === "/clear" || line === "clear") {
        console.clear();
        writePrompt();
        return;
      }
      if (line === "/help" || line === "help" || line === "?") {
        showShellHelp();
        writePrompt();
        return;
      }
      if (line === "/full") {
        const { buildProgram } = await import("../cli.js");
        const program = buildProgram();
        program.outputHelp();
        writePrompt();
        return;
      }

      // If the user typed "aip ..." just strip the redundant prefix
      // so muscle memory keeps working.
      const argsRaw = splitArgs(line);
      if (argsRaw[0] === "aip") argsRaw.shift();
      if (argsRaw.length === 0) {
        // bare "aip" inside the shell - just point at /help.
        log.raw(`  ${c.dim("(already in shell; type")} ${c.value("/help")} ${c.dim("for the command list)")}`);
        writePrompt();
        return;
      }

      // Reject unknown commands here instead of letting Commander
      // silently re-render the welcome banner. Suggest a near-match
      // when one exists - the most common typo is the plural/singular
      // mismatch ("agent" vs "agents").
      const head = argsRaw[0] ?? "";
      if (!KNOWN_COMMANDS.has(head)) {
        const guess = suggestCommand(head);
        log.error(`Unknown command: ${head}`);
        if (guess) {
          log.raw(`  ${c.dim("Did you mean")} ${c.value(guess)}${c.dim("?")}`);
        }
        log.raw(`  ${c.dim("Type")} ${c.value("/help")} ${c.dim("for the shortlist or")} ${c.value("/full")} ${c.dim("for everything.")}`);
        writePrompt();
        return;
      }

      processing = true;
      rl.pause();

      // Spawn the command as a child of the same node executable.
      // We tried in-process `program.parseAsync` but Commander's
      // root state leaked across calls (the default action fired
      // again, dropping us into a nested welcome banner). A child
      // process keeps each invocation hermetic and lets sub-command
      // REPLs (chat, resolve) own stdin during their lifetime.
      try {
        spawnSync(process.execPath, [process.argv[1] ?? "", ...argsRaw], {
          stdio: "inherit",
          env: { ...process.env, AIP_IN_SHELL: "1" },
        });
      } catch (err) {
        log.error(err instanceof Error ? err.message : String(err));
      }

      processing = false;
      rl.resume();
      writePrompt();
    });

    rl.once("close", finish);
  });
}
