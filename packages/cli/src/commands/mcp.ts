import { Command } from "commander";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ApiClient } from "../core/api-client.js";
import { loadConfig } from "../core/config.js";
import {
  AgentDetailResponseSchema,
  AgentListResponseSchema,
  AgentStatusListSchema,
  applyFilters,
} from "../core/agent-list.js";
import { probeAgentCard } from "../core/agent-card.js";
import { buildResolver, classifyIdentityInput } from "../core/resolver.js";
import { VERSION } from "../core/constants.js";
import { c } from "../core/theme.js";

interface McpOpts {
  apiUrl?: string;
}

export function mcpCommand(): Command {
  return new Command("mcp")
    .description("Run aip as an MCP server (stdio transport) — for Claude Desktop, Cursor, Cline, etc.")
    .option("--api-url <url>", "Override the AIP backend the tools call (defaults to config)")
    .addHelpText(
      "after",
      `
${c.dim("Claude Desktop setup (~/Library/Application Support/Claude/claude_desktop_config.json):")}

  ${c.dim("{")}
  ${c.dim('  "mcpServers": {')}
  ${c.dim('    "aip": {')}
  ${c.dim(`      "command": "aip",`)}
  ${c.dim(`      "args": ["mcp"]`)}
  ${c.dim("    }")}
  ${c.dim("  }")}
  ${c.dim("}")}

${c.dim("Then restart Claude Desktop. The 'aip_*' tools become available to ask things like:")}
${c.dim("  → 'List the cheapest Task agents on AIP'")}
${c.dim("  → 'What is did:aip:7im…?'")}
${c.dim("  → 'Probe https://my-agent.com for an AgentCard'")}
`,
    )
    .action(async (opts: McpOpts) => {
      await runMcp(opts);
    });
}

async function runMcp(opts: McpOpts): Promise<void> {
  const config = await loadConfig();
  const apiUrl = opts.apiUrl ?? config.apiUrl;
  const api = new ApiClient({ baseUrl: apiUrl });

  const server = new McpServer(
    {
      name: "aip",
      version: VERSION,
    },
    {
      capabilities: { tools: {} },
    },
  );

  server.tool(
    "aip_agents_ls",
    "List AIP marketplace agents, optionally filtered by type / max-price / online-only.",
    {
      type: z.enum(["Task", "LLM", "Execution"]).optional(),
      max_price_usdc: z.number().nonnegative().optional(),
      online_only: z.boolean().optional(),
      limit: z.number().int().positive().max(100).optional(),
    },
    async ({ type, max_price_usdc, online_only, limit }) => {
      const query: Record<string, string | number | boolean> = { list: true };
      if (limit) query.limit = limit;
      const list = await api.get("/api/agent-card", AgentListResponseSchema, { query });
      const statusMap = online_only ? await fetchStatusMap(api) : undefined;
      const filtered = applyFilters(
        list.agents,
        {
          type,
          maxPrice: max_price_usdc,
          onlineOnly: Boolean(online_only),
        },
        statusMap,
      );
      const trimmed = filtered.map((a) => ({
        did: a.did,
        name: a.name,
        type: a.type,
        endpoint: a.endpoint,
        capabilities: a.capabilities.map((cap) => ({
          id: cap.id,
          description: cap.description,
          price_usdc: cap.pricing.amount,
        })),
        onChain: a.onChain ?? false,
        hasMcp: a.hasMcp ?? false,
      }));
      return textResult(JSON.stringify({ agents: trimmed }, null, 2));
    },
  );

  server.tool(
    "aip_agent_show",
    "Get full detail for a single agent by DID, including capabilities and pricing.",
    {
      did: z.string().describe("Agent DID, e.g. did:aip:7im…:translator"),
    },
    async ({ did }) => {
      const agent = await api.get("/api/agent-card/detail", AgentDetailResponseSchema, {
        query: { did },
      });
      return textResult(JSON.stringify(agent, null, 2));
    },
  );

  server.tool(
    "aip_whois",
    "Inspect an agent's identity by DID or URL. did:aip:* → on-chain resolution. URL → /.well-known/agent.json probe.",
    {
      identifier: z
        .string()
        .describe("Either 'did:aip:<owner>:<agent>' or a URL like 'https://my-agent.example.com'"),
      network: z.enum(["devnet", "mainnet-beta"]).optional(),
    },
    async ({ identifier, network }) => {
      const classified = classifyIdentityInput(identifier);

      if (classified.kind === "url") {
        const probe = await probeAgentCard(classified.url);
        return textResult(JSON.stringify({ kind: "url-probe", input: classified.url, probe }, null, 2));
      }

      if (classified.kind === "other-did") {
        return textResult(
          JSON.stringify(
            { kind: "unsupported-did", method: classified.method, did: classified.did },
            null,
            2,
          ),
        );
      }

      if (classified.kind === "unknown") {
        return textResult(
          JSON.stringify(
            {
              kind: "error",
              message: "Identifier must start with 'did:aip:' or 'http(s)://'",
              raw: classified.raw,
            },
            null,
            2,
          ),
        );
      }

      const config = await loadConfig();
      const ctx = buildResolver(config, { network });
      const result = await ctx.resolver.resolve(classified.did);
      const serialized = {
        kind: result.didDocument && result.agentRecord ? "on-chain" : "on-chain-missing",
        did: classified.did,
        network: ctx.network,
        cluster: ctx.cluster,
        document: result.didDocument,
        agentRecord: result.agentRecord
          ? {
              ...result.agentRecord,
              pricePerTask: result.agentRecord.pricePerTask.toString(),
              registeredAt: result.agentRecord.registeredAt.toString(),
              updatedAt: result.agentRecord.updatedAt.toString(),
            }
          : null,
        metadata: result.didResolutionMetadata,
      };
      return textResult(JSON.stringify(serialized, null, 2));
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  await new Promise<void>((resolve) => {
    const finish = () => resolve();
    process.stdin.once("end", finish);
    process.stdin.once("close", finish);
    process.once("SIGINT", finish);
    process.once("SIGTERM", finish);
  });
}

async function fetchStatusMap(api: ApiClient) {
  try {
    const statuses = await api.get("/api/agent-card/status", AgentStatusListSchema);
    return new Map(statuses.map((s) => [s.did, s]));
  } catch {
    return undefined;
  }
}

function textResult(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}
