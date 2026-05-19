import { Command } from "commander";
import { z } from "zod";
import {
  configKeys,
  loadConfig,
  resetConfig,
  saveConfig,
  ConfigSchema,
  type ConfigKey,
} from "../core/config.js";
import { paths } from "../core/paths.js";
import { c, glyph } from "../core/theme.js";
import { log } from "../core/logger.js";
import { ValidationError, NotFoundError } from "../core/errors.js";

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return c.dim("(unset)");
  if (typeof v === "boolean") return v ? c.success("true") : c.dim("false");
  return c.value(String(v));
}

function printAll(config: Record<string, unknown>): void {
  const keys = configKeys();
  const width = Math.max(...keys.map((k) => k.length));
  log.blank();
  log.raw(`  ${c.dim("config file:")} ${c.value(paths.configFile())}`);
  log.blank();
  for (const k of keys) {
    log.raw(`  ${c.label(k.padEnd(width))}  ${formatValue(config[k])}`);
  }
  log.blank();
}

function assertKey(key: string): asserts key is ConfigKey {
  if (!(configKeys() as readonly string[]).includes(key)) {
    throw new NotFoundError(
      `Unknown config key: '${key}'`,
      `Known keys: ${configKeys().join(", ")}`,
    );
  }
}

function coerceValue(key: ConfigKey, raw: string): unknown {
  const field = ConfigSchema.shape[key];
  let value: unknown = raw;
  const unwrapped = unwrapZod(field);
  if (unwrapped instanceof z.ZodBoolean) {
    if (raw === "true") value = true;
    else if (raw === "false") value = false;
    else
      throw new ValidationError(
        `'${key}' expects true or false (got '${raw}')`,
      );
  }
  const parsed = field.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      `Invalid value for '${key}': ${parsed.error.issues[0]?.message ?? "validation failed"}`,
    );
  }
  return parsed.data;
}

function unwrapZod(schema: z.ZodTypeAny): z.ZodTypeAny {
  let s = schema;
  while (s instanceof z.ZodOptional || s instanceof z.ZodDefault) {
    s = (s as { _def: { innerType: z.ZodTypeAny } })._def.innerType;
  }
  return s;
}

export function configCommand(): Command {
  const cmd = new Command("config")
    .description("Read or update persistent CLI configuration")
    .addHelpText(
      "after",
      `
${c.dim("Examples:")}
  $ aip config get                    ${c.dim("# show all keys")}
  $ aip config get apiUrl             ${c.dim("# show one key")}
  $ aip config set network mainnet-beta
  $ aip config reset                  ${c.dim("# back to defaults")}
  $ aip config path                   ${c.dim("# print config file path")}
`,
    );

  cmd
    .command("get [key]")
    .description("Print one or all configuration values")
    .action(async (key?: string) => {
      const config = await loadConfig();
      if (!key) {
        printAll(config as unknown as Record<string, unknown>);
        return;
      }
      assertKey(key);
      log.raw(formatValue((config as Record<string, unknown>)[key]));
    });

  cmd
    .command("set <key> <value>")
    .description("Update a configuration value")
    .action(async (key: string, value: string) => {
      assertKey(key);
      const coerced = coerceValue(key, value);
      await saveConfig({ [key]: coerced } as Partial<typeof ConfigSchema._type>);
      log.success(`${c.label(key)} ${c.dim(glyph.arrow)} ${formatValue(coerced)}`);
    });

  cmd
    .command("reset")
    .description("Restore default configuration")
    .action(async () => {
      await resetConfig();
      log.success(`Configuration reset to defaults`);
      log.step(`File: ${paths.configFile()}`);
    });

  cmd
    .command("path")
    .description("Print the configuration file path")
    .action(() => {
      log.raw(paths.configFile());
    });

  return cmd;
}
