/**
 * MCP Tool Result Cache — TTL-based, task-scoped.
 *
 * Caches tool call results within a single task execution.
 * Same tool + same arguments = cache hit (avoids redundant calls).
 * Cache is NOT shared between tasks.
 */

import type { McpToolResult } from "./types";
import { createHash } from "crypto";

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  result: McpToolResult;
  expiresAt: number;
}

export class ToolResultCache {
  private cache = new Map<string, CacheEntry>();
  private ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  private makeKey(toolName: string, args: Record<string, unknown>): string {
    const argsHash = createHash("sha256")
      .update(JSON.stringify(args, Object.keys(args).sort()))
      .digest("hex")
      .slice(0, 16);
    return `${toolName}:${argsHash}`;
  }

  get(toolName: string, args: Record<string, unknown>): McpToolResult | null {
    const key = this.makeKey(toolName, args);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.result;
  }

  set(toolName: string, args: Record<string, unknown>, result: McpToolResult): void {
    // Only cache successful results
    if (!result.success) return;
    const key = this.makeKey(toolName, args);
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
