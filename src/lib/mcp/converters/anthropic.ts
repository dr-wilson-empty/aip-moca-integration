/**
 * MCP Tool → Anthropic Tool format converter.
 *
 * Converts McpToolInfo[] to Anthropic's tool definition format
 * for use with Claude's tool calling API.
 */

import type { McpToolInfo } from "../types";

/**
 * Convert MCP tools to Anthropic tool definitions.
 * Sanitizes descriptions to limit prompt injection surface.
 * Returns plain objects compatible with Anthropic SDK Tool type.
 */
export function mcpToolsToAnthropic(tools: McpToolInfo[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: sanitizeDescription(tool.description),
    input_schema: {
      type: "object" as const,
      properties: (tool.inputSchema.properties as Record<string, unknown>) ?? {},
      ...(tool.inputSchema.required ? { required: tool.inputSchema.required } : {}),
    },
  }));
}

/**
 * Basic sanitization for tool descriptions from untrusted MCP servers.
 * Strips potential prompt injection patterns while preserving useful info.
 */
function sanitizeDescription(desc: string): string {
  if (!desc) return "No description provided";

  // Truncate overly long descriptions
  let sanitized = desc.slice(0, 500);

  // Remove common prompt injection patterns
  sanitized = sanitized
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?)/gi, "[filtered]")
    .replace(/you\s+are\s+now\s+/gi, "[filtered]")
    .replace(/system\s*:\s*/gi, "[filtered]")
    .replace(/\[INST\]/gi, "[filtered]")
    .replace(/<\/?system>/gi, "[filtered]");

  return sanitized;
}
