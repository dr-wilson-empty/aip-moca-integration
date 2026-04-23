/**
 * MCP Tool → OpenAI Function format converter.
 *
 * Converts McpToolInfo[] to OpenAI's function calling format.
 */

import type { McpToolInfo } from "../types";

/** OpenAI function tool definition */
export interface OpenAIToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Convert MCP tools to OpenAI function tool definitions.
 */
export function mcpToolsToOpenAI(tools: McpToolInfo[]): OpenAIToolDef[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: sanitizeDescription(tool.description),
      parameters: tool.inputSchema.type
        ? tool.inputSchema
        : { type: "object", ...tool.inputSchema },
    },
  }));
}

function sanitizeDescription(desc: string): string {
  if (!desc) return "No description provided";
  let sanitized = desc.slice(0, 500);
  sanitized = sanitized
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?)/gi, "[filtered]")
    .replace(/you\s+are\s+now\s+/gi, "[filtered]")
    .replace(/system\s*:\s*/gi, "[filtered]")
    .replace(/\[INST\]/gi, "[filtered]")
    .replace(/<\/?system>/gi, "[filtered]");
  return sanitized;
}
