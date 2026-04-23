import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolResultCache } from "@/lib/mcp/tool-cache";
import type { McpToolResult } from "@/lib/mcp/types";

describe("ToolResultCache", () => {
  let cache: ToolResultCache;

  beforeEach(() => {
    cache = new ToolResultCache(5000); // 5 second TTL for tests
  });

  const successResult: McpToolResult = {
    success: true,
    content: "Weather: 72°F, Sunny",
    isError: false,
  };

  const errorResult: McpToolResult = {
    success: false,
    content: "",
    isError: true,
    errorCode: "TIMEOUT",
    errorMessage: "Tool timed out",
    retryable: true,
  };

  it("returns null for cache miss", () => {
    const result = cache.get("get_weather", { location: "NYC" });
    expect(result).toBeNull();
  });

  it("caches and retrieves successful results", () => {
    cache.set("get_weather", { location: "NYC" }, successResult);
    const result = cache.get("get_weather", { location: "NYC" });
    expect(result).toEqual(successResult);
  });

  it("does not cache error results", () => {
    cache.set("get_weather", { location: "NYC" }, errorResult);
    const result = cache.get("get_weather", { location: "NYC" });
    expect(result).toBeNull();
  });

  it("differentiates by tool name", () => {
    cache.set("get_weather", { location: "NYC" }, successResult);
    const result = cache.get("get_temperature", { location: "NYC" });
    expect(result).toBeNull();
  });

  it("differentiates by arguments", () => {
    cache.set("get_weather", { location: "NYC" }, successResult);
    const result = cache.get("get_weather", { location: "LA" });
    expect(result).toBeNull();
  });

  it("returns same result for same arguments regardless of key order", () => {
    cache.set("tool", { a: 1, b: 2 }, successResult);
    const result = cache.get("tool", { b: 2, a: 1 });
    expect(result).toEqual(successResult);
  });

  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    cache.set("get_weather", { location: "NYC" }, successResult);

    // Still valid before TTL
    vi.advanceTimersByTime(4000);
    expect(cache.get("get_weather", { location: "NYC" })).toEqual(successResult);

    // Expired after TTL
    vi.advanceTimersByTime(2000);
    expect(cache.get("get_weather", { location: "NYC" })).toBeNull();

    vi.useRealTimers();
  });

  it("clears all entries", () => {
    cache.set("tool_a", {}, successResult);
    cache.set("tool_b", {}, successResult);
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("tracks size correctly", () => {
    expect(cache.size).toBe(0);
    cache.set("tool_a", {}, successResult);
    expect(cache.size).toBe(1);
    cache.set("tool_b", { x: 1 }, successResult);
    expect(cache.size).toBe(2);
  });
});
