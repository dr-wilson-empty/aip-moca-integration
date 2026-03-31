import { describe, it, expect } from "vitest";
import { parseArtifact } from "@/components/ui/ArtifactRenderer";

describe("parseArtifact", () => {
  it("parses plain text as text type", () => {
    const result = parseArtifact("Hello world");
    expect(result.type).toBe("text");
    expect(result.content).toBe("Hello world");
  });

  it("parses markdown as text type", () => {
    const result = parseArtifact("# Title\n\nSome **bold** text");
    expect(result.type).toBe("text");
    expect(result.content).toContain("# Title");
  });

  it("parses JSON with type field", () => {
    const result = parseArtifact('{"type":"json","data":{"key":"value"}}');
    expect(result.type).toBe("json");
    expect(result.data).toEqual({ key: "value" });
  });

  it("parses JSON without type field as json", () => {
    const result = parseArtifact('{"category":"GENERAL","confidence":0.95}');
    expect(result.type).toBe("json");
    expect(result.data).toEqual({ category: "GENERAL", confidence: 0.95 });
  });

  it("parses image artifact", () => {
    const result = parseArtifact('{"type":"image","url":"https://example.com/img.png","alt":"test"}');
    expect(result.type).toBe("image");
    expect(result.url).toBe("https://example.com/img.png");
  });

  it("parses transaction artifact", () => {
    const result = parseArtifact('{"type":"transaction","txHash":"5abc123"}');
    expect(result.type).toBe("transaction");
    expect(result.txHash).toBe("5abc123");
  });

  it("strips markdown code blocks before parsing JSON", () => {
    const result = parseArtifact('```json\n{"type":"json","data":{"x":1}}\n```');
    expect(result.type).toBe("json");
    expect(result.data).toEqual({ x: 1 });
  });

  it("extracts embedded JSON from text", () => {
    const result = parseArtifact('Here is the result: {"category":"DEFI","score":8}');
    expect(result.type).toBe("json");
    expect(result.data).toEqual({ category: "DEFI", score: 8 });
  });

  it("handles empty string as text", () => {
    const result = parseArtifact("");
    expect(result.type).toBe("text");
  });
});
