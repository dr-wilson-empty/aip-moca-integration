import { Command } from "commander";
import * as p from "@clack/prompts";
import { mkdir, writeFile, access } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { AipError, ValidationError } from "../core/errors.js";
import { log } from "../core/logger.js";
import { c, glyph } from "../core/theme.js";

type TemplateId = "echo" | "translator" | "summarizer";

interface InitOpts {
  template?: string;
  port?: string;
  wallet?: string;
  force?: boolean;
}

interface RenderContext {
  agentName: string;
  packageName: string;
  port: number;
  wallet: string;
  template: TemplateId;
}

export function initCommand(): Command {
  return new Command("init")
    .description("Scaffold a new AIP agent project")
    .argument("[name]", "Project directory name (also used as package name). Prompted if omitted.")
    .option("-t, --template <id>", "Template: echo | translator | summarizer")
    .option("-p, --port <number>", "Default HTTP port")
    .option("-w, --wallet <pubkey>", "Solana wallet address for payouts")
    .option("--force", "Overwrite an existing directory")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip init my-agent                              ${c.dim("# interactive picker")}
  $ aip init translator --template translator --port 4010
  $ aip init my-agent --wallet 7imsPo1owz6arqjqHpHvEfNgTepXnm9vtjmHQoVWmABX

${c.dim("Templates:")}
  ${c.brand("echo")}         Minimal agent, no AI dependency - perfect for protocol testing
  ${c.brand("translator")}   Uses Claude Haiku to translate text between languages
  ${c.brand("summarizer")}   Uses Claude Haiku to summarize input
`,
    )
    .action(async (name: string | undefined, opts: InitOpts) => {
      let resolvedName = name;
      if (!resolvedName) {
        const { promptForText, canPromptInteractively } = await import("../core/interactive.js");
        if (!canPromptInteractively()) {
          throw new AipError(
            "No project name provided",
            undefined,
            "Pass a name, e.g. 'aip init my-bot'.",
          );
        }
        resolvedName = await promptForText("Project name", { placeholder: "my-agent" });
      }
      await runInit(resolvedName, opts);
    });
}

async function runInit(rawName: string, opts: InitOpts): Promise<void> {
  const projectDir = resolve(process.cwd(), rawName);
  const projectName = basename(projectDir);

  if (!opts.force && (await pathExists(projectDir))) {
    throw new AipError(
      `Directory already exists: ${projectDir}`,
      undefined,
      "Use --force to overwrite, or pick a different name.",
    );
  }

  const template = await chooseTemplate(opts.template);
  const port = await choosePort(opts.port);
  const wallet = await chooseWallet(opts.wallet);

  const ctx: RenderContext = {
    agentName: humanizeName(projectName),
    packageName: kebabCase(projectName),
    port,
    wallet,
    template,
  };

  await mkdir(projectDir, { recursive: true });
  await mkdir(join(projectDir, "src"), { recursive: true });

  const files: Array<[string, string]> = [
    ["package.json", renderPackageJson(ctx)],
    ["tsconfig.json", renderTsconfig()],
    [".gitignore", renderGitignore()],
    [".env.example", renderEnvExample(ctx)],
    ["README.md", renderReadme(ctx)],
    ["src/index.ts", renderEntry(ctx)],
  ];

  for (const [relPath, content] of files) {
    await writeFile(join(projectDir, relPath), content);
  }

  printSuccess(projectDir, projectName, ctx);
}

async function chooseTemplate(requested: string | undefined): Promise<TemplateId> {
  if (requested) {
    if (requested === "echo" || requested === "translator" || requested === "summarizer") {
      return requested;
    }
    throw new ValidationError(
      `Unknown template '${requested}'`,
      "Use one of: echo, translator, summarizer.",
    );
  }

  if (!process.stdin.isTTY) {
    return "echo";
  }

  p.intro(c.brand("aip init"));
  const choice = await p.select({
    message: "Pick a template",
    options: [
      { value: "echo", label: "Echo (minimal)", hint: "no AI dep, ideal for protocol testing" },
      { value: "translator", label: "Translator", hint: "Claude Haiku, multilingual" },
      { value: "summarizer", label: "Summarizer", hint: "Claude Haiku, concise summaries" },
    ],
    initialValue: "echo",
  });
  if (p.isCancel(choice)) {
    p.cancel("Cancelled.");
    throw new AipError("Init cancelled");
  }
  return choice as TemplateId;
}

async function choosePort(requested: string | undefined): Promise<number> {
  if (requested) {
    const n = parseInt(requested, 10);
    if (!Number.isFinite(n) || n < 1024 || n > 65535) {
      throw new ValidationError(
        `Invalid port '${requested}'`,
        "Use a number between 1024 and 65535.",
      );
    }
    return n;
  }
  if (!process.stdin.isTTY) return 4010;
  const v = await p.text({
    message: "HTTP port",
    placeholder: "4010",
    initialValue: "4010",
    validate: (value) => {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n) || n < 1024 || n > 65535) return "Use a number between 1024 and 65535.";
      return undefined;
    },
  });
  if (p.isCancel(v)) {
    p.cancel("Cancelled.");
    throw new AipError("Init cancelled");
  }
  return parseInt(String(v), 10);
}

async function chooseWallet(requested: string | undefined): Promise<string> {
  if (requested && requested.trim().length > 0) return requested.trim();
  if (!process.stdin.isTTY) return "YOUR_SOLANA_WALLET";
  const v = await p.text({
    message: "Solana wallet address for payouts",
    placeholder: "Leave blank to fill in later",
  });
  if (p.isCancel(v)) {
    p.cancel("Cancelled.");
    throw new AipError("Init cancelled");
  }
  const value = String(v ?? "").trim();
  return value.length > 0 ? value : "YOUR_SOLANA_WALLET";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function humanizeName(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((s) => s[0]!.toUpperCase() + s.slice(1))
    .join(" ");
}

function kebabCase(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "my-aip-agent";
}

function printSuccess(dir: string, name: string, ctx: RenderContext): void {
  log.blank();
  log.raw(`  ${c.success(glyph.success)} ${c.brandBold("Scaffolded")} ${c.value(name)} ${c.dim(`(${ctx.template} template)`)}`);
  log.raw(`  ${c.dim("Path:")} ${c.value(dir)}`);
  log.blank();
  log.raw(`  ${c.dim("Next steps:")}`);
  log.raw(`    ${c.brand("$")} ${c.value(`cd ${basename(dir)}`)}`);
  log.raw(`    ${c.brand("$")} ${c.value("npm install")}`);
  if (ctx.template !== "echo") {
    log.raw(`    ${c.brand("$")} ${c.value("cp .env.example .env  # add your ANTHROPIC_API_KEY")}`);
  }
  log.raw(`    ${c.brand("$")} ${c.value("npm start")}`);
  log.blank();
  log.raw(`  ${c.dim("Then register on-chain when ready:")}`);
  log.raw(`    ${c.brand("$")} ${c.value("aip register   # (phase 7)")}`);
  log.blank();
}

/* ------------------------------------------------------------------ */
/*  Renderers                                                           */
/* ------------------------------------------------------------------ */

function renderPackageJson(ctx: RenderContext): string {
  const deps: Record<string, string> = {
    "aip-agent-sdk": "^0.1.0",
  };
  if (ctx.template !== "echo") {
    deps["@anthropic-ai/sdk"] = "^0.39.0";
  }
  return (
    JSON.stringify(
      {
        name: ctx.packageName,
        version: "0.1.0",
        description: `${ctx.agentName} - built on the Agent Internet Protocol`,
        private: true,
        type: "module",
        main: "dist/index.js",
        scripts: {
          start: "tsx src/index.ts",
          build: "tsc",
          serve: "node dist/index.js",
        },
        dependencies: deps,
        devDependencies: {
          "@types/node": "^22.10.0",
          tsx: "^4.19.0",
          typescript: "^5.7.0",
        },
        engines: { node: ">=18.0.0" },
      },
      null,
      2,
    ) + "\n"
  );
}

function renderTsconfig(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          lib: ["ES2022"],
          types: ["node"],
          outDir: "./dist",
          rootDir: "./src",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          sourceMap: true,
        },
        include: ["src/**/*"],
        exclude: ["node_modules", "dist"],
      },
      null,
      2,
    ) + "\n"
  );
}

function renderGitignore(): string {
  return "node_modules/\ndist/\n.env\n.env.local\n*.log\n.DS_Store\n";
}

function renderEnvExample(ctx: RenderContext): string {
  const lines: string[] = [];
  lines.push("# Configure your AIP agent");
  lines.push("");
  if (ctx.template !== "echo") {
    lines.push("# Required for Claude Haiku handlers");
    lines.push("ANTHROPIC_API_KEY=sk-ant-…");
    lines.push("");
  }
  lines.push("# Optional overrides");
  lines.push(`PORT=${ctx.port}`);
  lines.push(`AGENT_WALLET=${ctx.wallet}`);
  return lines.join("\n") + "\n";
}

function renderReadme(ctx: RenderContext): string {
  return `# ${ctx.agentName}

An AIP-compatible agent built with [\`aip-agent-sdk\`](https://github.com/dr-wilson-empty/aip-beta/tree/main/packages/agent-sdk).

## Run

\`\`\`bash
npm install
${ctx.template !== "echo" ? "cp .env.example .env  # then fill in ANTHROPIC_API_KEY\n" : ""}npm start
\`\`\`

The agent will bind on port \`${ctx.port}\` and expose:

- \`GET  /.well-known/agent.json\` - discoverable Agent Card
- \`POST /a2a\` - A2A JSON-RPC task endpoint

## Discover from anywhere

\`\`\`bash
aip resolve http://localhost:${ctx.port}
\`\`\`

## Register on-chain

Once the agent is reachable from the public internet (use a tunnel like
\`cloudflared tunnel --url http://localhost:${ctx.port}\`), register it:

\`\`\`bash
aip register   # phase 7 of @aip/cli - coming soon
\`\`\`

## Customizing

Edit \`src/index.ts\` to add or change capabilities. Each capability
declares its USDC price; \`aip-agent-sdk\` handles the x402 settlement
and the A2A handshake for you.
`;
}

function renderEntry(ctx: RenderContext): string {
  switch (ctx.template) {
    case "echo":
      return renderEchoEntry(ctx);
    case "translator":
      return renderTranslatorEntry(ctx);
    case "summarizer":
      return renderSummarizerEntry(ctx);
  }
}

function renderEchoEntry(ctx: RenderContext): string {
  return `import { createAgent } from "aip-agent-sdk";

const PORT = Number(process.env.PORT ?? ${ctx.port});
const WALLET = process.env.AGENT_WALLET ?? "${ctx.wallet}";

const agent = createAgent({
  name: ${JSON.stringify(ctx.agentName)},
  port: PORT,
  type: "Task",
  version: "0.1.0",
  walletAddress: WALLET,
});

agent.capability("text.echo", {
  description: "Echo the input back, verbatim",
  price: "0.01",
  handler: async (input: string) => input,
});

agent.start();
`;
}

function renderTranslatorEntry(ctx: RenderContext): string {
  return `import { createAgent, haiku } from "aip-agent-sdk";

const PORT = Number(process.env.PORT ?? ${ctx.port});
const WALLET = process.env.AGENT_WALLET ?? "${ctx.wallet}";

const agent = createAgent({
  name: ${JSON.stringify(ctx.agentName)},
  port: PORT,
  type: "Task",
  version: "0.1.0",
  walletAddress: WALLET,
});

agent.capability("text.translate", {
  description: "Translate text into the requested target language",
  price: "0.05",
  handler: haiku(
    "You are a precise translation agent. " +
      "The user will provide a phrase, optionally prefixed with a target language " +
      "('to French: ...'). Output the translation only - no explanations, no " +
      "quotation marks, no source-language echo."
  ),
});

agent.start();
`;
}

function renderSummarizerEntry(ctx: RenderContext): string {
  return `import { createAgent, haiku } from "aip-agent-sdk";

const PORT = Number(process.env.PORT ?? ${ctx.port});
const WALLET = process.env.AGENT_WALLET ?? "${ctx.wallet}";

const agent = createAgent({
  name: ${JSON.stringify(ctx.agentName)},
  port: PORT,
  type: "Task",
  version: "0.1.0",
  walletAddress: WALLET,
});

agent.capability("text.summarize", {
  description: "Summarize a passage of text in one short paragraph",
  price: "0.10",
  handler: haiku(
    "You are a summarization specialist. " +
      "Produce a single concise paragraph - under 80 words - that captures the " +
      "key points of the input. Preserve the input's original language."
  ),
});

agent.start();
`;
}
