import { readFile, writeFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { paths, ensureRoot } from "./paths.js";
import { ConfigError } from "./errors.js";

export const ConfigSchema = z.object({
  apiUrl: z.string().url().default("https://app.aipagents.xyz"),
  network: z.enum(["devnet", "mainnet-beta"]).default("devnet"),
  rpcUrl: z.string().url().optional(),
  defaultAgent: z.string().optional(),
  telemetry: z.boolean().default(false),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ConfigKey = keyof Config;

const DEFAULTS: Config = ConfigSchema.parse({});

function nonEmpty(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function withEnvOverrides(config: Config): Config {
  const apiUrl = nonEmpty(process.env.AIP_API_URL) ?? config.apiUrl;
  const network =
    (nonEmpty(process.env.AIP_NETWORK) as Config["network"] | undefined) ?? config.network;
  const rpcUrl = nonEmpty(process.env.AIP_RPC_URL) ?? config.rpcUrl;
  return { ...config, apiUrl, network, rpcUrl };
}

async function readRaw(): Promise<Partial<Config>> {
  try {
    const data = await readFile(paths.configFile(), "utf8");
    return JSON.parse(data);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new ConfigError(
      `Could not read ${paths.configFile()}`,
      "Delete it or fix the JSON and try again.",
    );
  }
}

async function writeAtomic(data: Config): Promise<void> {
  await ensureRoot();
  const target = paths.configFile();
  const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, target);
}

export async function loadConfig(): Promise<Config> {
  const raw = await readRaw();
  const merged = { ...DEFAULTS, ...raw };
  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new ConfigError(
      `Config file is invalid: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      `Run 'aip config reset' to restore defaults.`,
    );
  }
  return withEnvOverrides(parsed.data);
}

export async function saveConfig(next: Partial<Config>): Promise<Config> {
  const current = await readRaw();
  const merged = { ...DEFAULTS, ...current, ...next };
  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new ConfigError(
      `Invalid config update: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    );
  }
  await writeAtomic(parsed.data);
  return withEnvOverrides(parsed.data);
}

export async function resetConfig(): Promise<Config> {
  await writeAtomic(DEFAULTS);
  return withEnvOverrides(DEFAULTS);
}

export function getConfigDefaults(): Config {
  return { ...DEFAULTS };
}

export function configKeys(): readonly ConfigKey[] {
  return Object.keys(ConfigSchema.shape) as ConfigKey[];
}
