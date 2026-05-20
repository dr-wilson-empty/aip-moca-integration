import chalk, { type ChalkInstance } from "chalk";

const noColor =
  process.env.NO_COLOR !== undefined ||
  process.env.TERM === "dumb" ||
  !process.stdout.isTTY;

if (noColor) chalk.level = 0;

const identity = (s: string): string => s;

function pick(fn: ChalkInstance): (s: string) => string {
  return noColor ? identity : (s: string) => fn(s);
}

/** Brand color: soft mint, matches the aipagents.xyz palette (#E7FEEE). */
const BRAND_HEX = "#A8E6BB";

export const c = {
  brand: pick(chalk.hex(BRAND_HEX)),
  brandBold: pick(chalk.hex(BRAND_HEX).bold),
  success: pick(chalk.green),
  warning: pick(chalk.yellow),
  error: pick(chalk.red),
  errorBold: pick(chalk.red.bold),
  dim: pick(chalk.gray),
  label: pick(chalk.gray),
  value: pick(chalk.white),
  accent: pick(chalk.magenta),
  bold: pick(chalk.bold),
  underline: pick(chalk.underline),
};

export const glyph = {
  success: "✔",
  failure: "✖",
  pending: "⠹",
  prompt: "›",
  bullet: "•",
  arrow: "→",
  info: "ℹ",
  warn: "⚠",
  dot: "·",
};

export const box = {
  borderStyle: "round" as const,
  padding: { top: 0, bottom: 0, left: 1, right: 1 },
  borderColor: BRAND_HEX,
};

export function brandHeader(): string {
  return c.brandBold("aip") + c.dim(" · agent internet protocol");
}
