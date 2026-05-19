import { z, type ZodTypeAny } from "zod";
import { NetworkError, NotFoundError, ValidationError } from "./errors.js";
import { DEFAULT_TIMEOUT_MS, USER_AGENT } from "./constants.js";
import { log } from "./logger.js";

export interface ApiClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RawResponse {
  status: number;
  headers: Headers;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  body: ReadableStream<Uint8Array> | null;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly defaultHeaders: Record<string, string>;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultHeaders = {
      accept: "application/json",
      "user-agent": USER_AGENT,
      ...opts.headers,
    };
  }

  url(path: string, query?: RequestOptions["query"]): string {
    const u = new URL(path.startsWith("/") ? path : `/${path}`, this.baseUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue;
        u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  }

  async get<T = unknown>(path: string, schema?: ZodTypeAny, opts: RequestOptions = {}): Promise<T> {
    const res = await this.request("GET", path, opts);
    return this.parseJson<T>(res, schema, path);
  }

  async post<T = unknown>(
    path: string,
    body: unknown,
    schema?: ZodTypeAny,
    opts: RequestOptions = {},
  ): Promise<T> {
    const res = await this.request("POST", path, { ...opts, body });
    return this.parseJson<T>(res, schema, path);
  }

  async request(method: string, path: string, opts: RequestOptions = {}): Promise<RawResponse> {
    const url = this.url(path, opts.query);
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = mergeSignals(controller.signal, opts.signal);

    const headers: Record<string, string> = { ...this.defaultHeaders, ...opts.headers };
    let body: string | undefined;
    if (opts.body !== undefined && opts.body !== null) {
      body = JSON.stringify(opts.body);
      headers["content-type"] ??= "application/json";
    }

    log.debug(`${method} ${url}`);

    try {
      const res = await fetch(url, { method, headers, body, signal });
      if (res.status === 404) {
        throw new NotFoundError(`Not found: ${path}`);
      }
      if (res.status >= 500) {
        throw new NetworkError(
          `Backend returned ${res.status} for ${path}`,
          res.status,
          "The AIP backend may be temporarily down. Try again in a moment.",
        );
      }
      return res as unknown as RawResponse;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new NetworkError(
          `Request to ${path} timed out after ${timeoutMs}ms`,
          undefined,
          "Use AIP_API_URL to point at a faster endpoint, or check your connection.",
        );
      }
      if (err instanceof NetworkError || err instanceof NotFoundError) throw err;
      throw new NetworkError(
        `Could not reach ${url}: ${(err as Error).message}`,
        undefined,
        "Check that the AIP backend is reachable.",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseJson<T>(res: RawResponse, schema: ZodTypeAny | undefined, path: string): Promise<T> {
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new NetworkError(
        `Non-JSON response from ${path} (status ${res.status})`,
        res.status,
      );
    }
    if (res.status >= 400) {
      const message = extractErrorMessage(payload) ?? `Request failed (status ${res.status})`;
      throw new NetworkError(message, res.status);
    }
    if (!schema) return payload as T;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ValidationError(
        `Unexpected response shape from ${path}: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      );
    }
    return parsed.data as T;
  }
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  for (const k of ["error", "message", "detail"] as const) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function mergeSignals(a: AbortSignal, b: AbortSignal | undefined): AbortSignal {
  if (!b) return a;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (a.aborted || b.aborted) controller.abort();
  else {
    a.addEventListener("abort", onAbort, { once: true });
    b.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

export const Schemas = {
  health: z.object({ status: z.string() }).passthrough(),
};

export function createApiClient(opts: ApiClientOptions): ApiClient {
  return new ApiClient(opts);
}
