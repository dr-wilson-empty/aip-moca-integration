import { describe, it, expect } from "vitest";
import { handleMcpRequest } from "@/lib/mcp/mcp-server";
import type { HostedAgentConfig } from "@/lib/hosted-agents";

const mockConfig: HostedAgentConfig = {
  agentId: "test-agent",
  ownerAddress: "4LRAyGnJv2DwxiWVg6RDtYsfCjx2Ha3d3A19fsogCopG",
  name: "Test Agent",
  description: "A test agent",
  systemPrompt: "You are a test agent",
  tier: "platform",
  provider: "anthropic",
  capabilities: [
    { id: "text.summarize", description: "Summarize text", pricing: { amount: "0.10", token: "USDC", network: "solana" } },
    { id: "text.translate", description: "Translate text", pricing: { amount: "0.05", token: "USDC", network: "solana" } },
  ],
  canOrchestrate: false,
  isPublic: true,
  mcpServers: [],
  createdAt: new Date().toISOString(),
  active: true,
};

const mockExecutor = async (_config: HostedAgentConfig, input: string) => {
  return { status: "COMPLETED", artifact: `Processed: ${input}` };
};

describe("handleMcpRequest — MCP Server", () => {
  it("handles initialize", async () => {
    const result = await handleMcpRequest(mockConfig, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
    }, mockExecutor);

    expect(result.jsonrpc).toBe("2.0");
    expect(result.id).toBe(1);
    const r = result.result as Record<string, unknown>;
    expect(r.protocolVersion).toBe("2024-11-05");
    expect((r.serverInfo as Record<string, string>).name).toBe("Test Agent");
  });

  it("handles tools/list", async () => {
    const result = await handleMcpRequest(mockConfig, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    }, mockExecutor);

    const r = result.result as { tools: Array<{ name: string; description: string }> };
    expect(r.tools).toHaveLength(2);
    expect(r.tools[0].name).toBe("text.summarize");
    expect(r.tools[1].name).toBe("text.translate");
  });

  it("handles tools/call successfully", async () => {
    const result = await handleMcpRequest(mockConfig, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "text.summarize",
        arguments: { input: "Hello world" },
      },
    }, mockExecutor);

    const r = result.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(r.isError).toBe(false);
    expect(r.content[0].text).toBe("Processed: Hello world");
  });

  it("handles tools/call with unknown tool", async () => {
    const result = await handleMcpRequest(mockConfig, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "unknown.tool",
        arguments: { input: "test" },
      },
    }, mockExecutor);

    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe(-32602);
  });

  it("handles tools/call with failed task", async () => {
    const failExecutor = async () => ({ status: "FAILED", error: "Something went wrong" });
    const result = await handleMcpRequest(mockConfig, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "text.summarize",
        arguments: { input: "test" },
      },
    }, failExecutor);

    const r = result.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("Something went wrong");
  });

  it("handles ping", async () => {
    const result = await handleMcpRequest(mockConfig, {
      jsonrpc: "2.0",
      id: 6,
      method: "ping",
    }, mockExecutor);

    expect(result.result).toEqual({});
  });

  it("handles unknown method", async () => {
    const result = await handleMcpRequest(mockConfig, {
      jsonrpc: "2.0",
      id: 7,
      method: "unknown/method",
    }, mockExecutor);

    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe(-32601);
  });
});
