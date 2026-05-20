import { Command, Help } from "commander";
import { c, glyph } from "./core/theme.js";
import { log } from "./core/logger.js";
import { isAipError, ExitCode } from "./core/errors.js";
import { VERSION } from "./core/constants.js";
import { configCommand } from "./commands/config.js";
import { loginCommand } from "./commands/login.js";
import { whoamiCommand } from "./commands/whoami.js";
import { logoutCommand } from "./commands/logout.js";
import { agentsCommand } from "./commands/agents.js";
import { taskCommand } from "./commands/task.js";
import { chatCommand } from "./commands/chat.js";
import { initCommand } from "./commands/init.js";
import { registerCommand } from "./commands/register.js";
import { budgetCommand } from "./commands/budget.js";
import { explorerCommand } from "./commands/explorer.js";
import { mcpCommand } from "./commands/mcp.js";
import { askCommand } from "./commands/ask.js";
import { resolveCommand } from "./commands/resolve.js";
import { welcome } from "./ui/banner.js";

/* ------------------------------------------------------------------ */
/*  Help grouping - keeps `aip --help` readable as the command surface */
/*  grows. Order within a category is preserved from this list.        */
/* ------------------------------------------------------------------ */

const HELP_CATEGORIES: Array<{ title: string; commands: string[] }> = [
  { title: "Discover",         commands: ["agents", "resolve", "explorer"] },
  { title: "Use",              commands: ["ask", "chat", "task"] },
  { title: "Build & publish",  commands: ["init", "register", "mcp"] },
  { title: "Wallet & account", commands: ["login", "whoami", "logout", "budget"] },
  { title: "Configuration",    commands: ["config"] },
];

class AipHelp extends Help {
  override formatHelp(cmd: Command, helper: Help): string {
    const termWidth = helper.padWidth(cmd, helper);
    const cmds = helper.visibleCommands(cmd);
    const opts = helper.visibleOptions(cmd);

    const lines: string[] = [];
    lines.push("");
    // Header reads "AIP · <description>" everywhere (root help and
    // sub-command help). Commander's cmd.name() is the lowercase
    // binary name; the brand mark is uppercase in all user-facing
    // chrome so we hand-write it instead of using cmd.name().
    lines.push(`  ${c.brandBold("AIP")} ${c.dim(glyph.dot)} ${c.dim(cmd.description() || "")}`);
    lines.push("");
    lines.push(`  ${c.dim("Usage:")} ${c.value(helper.commandUsage(cmd))}`);

    if (cmds.length > 0) {
      const isRoot = !cmd.parent;
      if (isRoot) {
        // Group root-level commands into well-known categories.
        const byName = new Map(cmds.map((sub) => [sub.name(), sub] as const));
        const seen = new Set<string>();
        for (const cat of HELP_CATEGORIES) {
          const matches = cat.commands
            .map((n) => byName.get(n))
            .filter((c): c is Command => Boolean(c));
          if (matches.length === 0) continue;
          lines.push("");
          lines.push(`  ${c.brand(cat.title)}`);
          for (const sub of matches) {
            seen.add(sub.name());
            const name = helper.subcommandTerm(sub);
            const desc = helper.subcommandDescription(sub);
            lines.push(`    ${c.value(name.padEnd(termWidth))}  ${c.dim(desc)}`);
          }
        }
        // Catch any commands that aren't in HELP_CATEGORIES yet.
        const orphans = cmds.filter((sub) => !seen.has(sub.name()));
        if (orphans.length > 0) {
          lines.push("");
          lines.push(`  ${c.brand("Other")}`);
          for (const sub of orphans) {
            const name = helper.subcommandTerm(sub);
            const desc = helper.subcommandDescription(sub);
            lines.push(`    ${c.value(name.padEnd(termWidth))}  ${c.dim(desc)}`);
          }
        }
      } else {
        // Sub-command help - keep the flat list, no categories needed.
        lines.push("");
        lines.push(`  ${c.dim("Commands:")}`);
        for (const sub of cmds) {
          const name = helper.subcommandTerm(sub);
          const desc = helper.subcommandDescription(sub);
          lines.push(`    ${c.brand(name.padEnd(termWidth))}  ${c.dim(desc)}`);
        }
      }
    }

    if (opts.length > 0) {
      lines.push("");
      lines.push(`  ${c.dim("Options:")}`);
      const optWidth = Math.max(...opts.map((o) => helper.optionTerm(o).length));
      for (const opt of opts) {
        const term = helper.optionTerm(opt);
        const desc = helper.optionDescription(opt);
        lines.push(`    ${c.value(term.padEnd(optWidth))}  ${c.dim(desc)}`);
      }
    }

    if (!cmd.parent) {
      // Root help: examples + docs footer
      const examples: Array<[string, string]> = [
        ["aip agents ls",                                        "Browse the marketplace"],
        [`aip ask summary "Summarize the AIP protocol"`,         "One-shot task, auto-pays in USDC"],
        ["aip resolve did:aip:7imsPo1owz6...mABX:summary-agent", "Verify an agent's on-chain identity"],
        ["aip init my-bot",                                      "Scaffold your own agent"],
      ];
      const exWidth = Math.max(...examples.map(([l]) => l.length));
      lines.push("");
      lines.push(`  ${c.brand("Examples")}`);
      for (const [cmd, desc] of examples) {
        lines.push(`    ${c.value(cmd.padEnd(exWidth))}  ${c.dim(desc)}`);
      }
      lines.push("");
      lines.push(`  ${c.dim("Docs:")} ${c.underline("https://aipagents.xyz")}`);
    }

    lines.push("");
    return lines.join("\n");
  }
}

function applyHelpRecursively(cmd: Command): void {
  cmd.createHelp = () => new AipHelp();
  for (const sub of cmd.commands) applyHelpRecursively(sub);
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("aip")
    .description("the Agent Internet Protocol, in your terminal")
    .version(VERSION, "-v, --version", "Print CLI version")
    .helpOption("-h, --help", "Show help")
    .showHelpAfterError(c.dim("(run `aip --help` for usage)"))
    .configureHelp({ helpWidth: 100 });

  applyHelpRecursively(program);

  program.addCommand(askCommand());
  program.addCommand(loginCommand());
  program.addCommand(whoamiCommand());
  program.addCommand(logoutCommand());
  program.addCommand(agentsCommand());
  program.addCommand(chatCommand());
  program.addCommand(taskCommand());
  program.addCommand(initCommand());
  program.addCommand(registerCommand());
  program.addCommand(budgetCommand());
  program.addCommand(explorerCommand());
  program.addCommand(mcpCommand());
  program.addCommand(resolveCommand());
  program.addCommand(configCommand());
  applyHelpRecursively(program);

  program.action(async () => {
    // When invoked from inside the interactive shell (which spawns
    // child processes for each typed command), the AIP_IN_SHELL env
    // marker tells us to just print the banner and exit instead of
    // recursing into another shell loop.
    process.stdout.write(welcome());
    if (
      process.stdin.isTTY &&
      process.stdout.isTTY &&
      process.env.AIP_IN_SHELL !== "1"
    ) {
      const { runInteractiveShell } = await import("./ui/shell.js");
      await runInteractiveShell();
    }
  });

  return program;
}

export async function run(argv: string[]): Promise<number> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
    return ExitCode.Ok;
  } catch (err) {
    if (isAipError(err)) {
      log.error(err.message, err.hint);
      return err.exitCode;
    }
    if (err instanceof Error && (err as { code?: string }).code === "commander.helpDisplayed") {
      return ExitCode.Ok;
    }
    if (err instanceof Error && (err as { code?: string }).code === "commander.version") {
      return ExitCode.Ok;
    }
    log.error(
      err instanceof Error ? err.message : String(err),
      "Run with AIP_DEBUG=1 for more detail.",
    );
    if (process.env.AIP_DEBUG === "1" && err instanceof Error && err.stack) {
      process.stderr.write(err.stack + "\n");
    }
    return ExitCode.Generic;
  }
}
