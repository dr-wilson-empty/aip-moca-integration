/**
 * MCP Tool → Google Gemini function declaration format converter.
 */

import type { McpToolInfo } from "../types";

/** Gemini function declaration */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export function mcpToolsToGemini(tools: McpToolInfo[]): GeminiFunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: sanitizeDescription(tool.description),
    parameters: tool.inputSchema.type
      ? tool.inputSchema
      : { type: "object", ...tool.inputSchema },
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
