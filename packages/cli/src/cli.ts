import { Command, Help } from "commander";
import { c, glyph } from "./core/theme.js";
import { log } from "./core/logger.js";
import { isAipError, ExitCode } from "./core/errors.js";
import { VERSION } from "./core/constants.js";
import { configCommand } from "./commands/config.js";
import { whoisCommand } from "./commands/whois.js";
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
import { welcome } from "./ui/banner.js";

class AipHelp extends Help {
  override formatHelp(cmd: Command, helper: Help): string {
    const termWidth = helper.padWidth(cmd, helper);
    const cmds = helper.visibleCommands(cmd);
    const opts = helper.visibleOptions(cmd);

    const lines: string[] = [];
    lines.push("");
    lines.push(`  ${c.brandBold("aip")} ${c.dim(glyph.dot)} ${c.dim(cmd.description() || "")}`);
    lines.push("");
    lines.push(`  ${c.dim("Usage:")} ${c.value(helper.commandUsage(cmd))}`);

    if (cmds.length > 0) {
      lines.push("");
      lines.push(`  ${c.dim("Commands:")}`);
      for (const sub of cmds) {
        const name = helper.subcommandTerm(sub);
        const desc = helper.subcommandDescription(sub);
        lines.push(`    ${c.brand(name.padEnd(termWidth))}  ${c.dim(desc)}`);
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
    .description("the agent internet protocol, in your terminal")
    .version(VERSION, "-v, --version", "Print CLI version")
    .helpOption("-h, --help", "Show help")
    .showHelpAfterError(c.dim("(run `aip --help` for usage)"))
    .configureHelp({ helpWidth: 100 });

  applyHelpRecursively(program);

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
  program.addCommand(whoisCommand());
  program.addCommand(configCommand());
  applyHelpRecursively(program);

  program.action(() => {
    process.stdout.write(welcome());
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
