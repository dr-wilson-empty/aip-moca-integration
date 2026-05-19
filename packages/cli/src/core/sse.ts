import { NetworkError } from "./errors.js";

export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

export interface SseStreamOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Open an SSE stream and yield each event as it arrives.
 * Cancels cleanly when the consumer breaks out of the iterator.
 */
export async function* openSse(
  url: string,
  opts: SseStreamOptions = {},
): AsyncGenerator<SseEvent, void, unknown> {
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "text/event-stream", ...opts.headers },
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new NetworkError(`SSE request failed (${res.status})`, res.status);
  }
  if (!res.body) {
    throw new NetworkError("SSE response had no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let blockEnd: number;
      while ((blockEnd = buffer.indexOf("\n\n")) !== -1) {
        const rawBlock = buffer.slice(0, blockEnd);
        buffer = buffer.slice(blockEnd + 2);
        const parsed = parseEventBlock(rawBlock);
        if (parsed) yield parsed;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
}

function parseEventBlock(block: string): SseEvent | null {
  const lines = block.split("\n");
  let event = "message";
  let data = "";
  let id: string | undefined;
  for (const line of lines) {
    if (line.startsWith(":")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data = data ? `${data}\n${value}` : value;
    else if (field === "id") id = value;
  }
  if (!data && event === "message") return null;
  return { event, data, id };
}
