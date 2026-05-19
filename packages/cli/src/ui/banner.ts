import { c, glyph } from "../core/theme.js";
import { VERSION } from "../core/constants.js";

const TAGLINE = "agent internet protocol";

export function banner(): string {
  return `\n  ${c.brandBold("aip")} ${c.dim(glyph.dot)} ${c.dim(TAGLINE)}  ${c.dim(`v${VERSION}`)}\n`;
}

export function welcome(): string {
  const rows: Array<[string, string]> = [
    ["aip ask <agent> \"prompt\"", "One-shot — auto-pays in USDC, prints result"],
    ["aip agents ls", "Browse the marketplace"],
    ["aip whois <id|url>", "Inspect an agent's identity"],
    ["aip chat [agent]", "Multi-turn REPL with an agent"],
    ["aip init <name>", "Scaffold your own agent"],
    ["aip --help", "See all commands"],
  ];
  const lhsWidth = Math.max(...rows.map(([l]) => l.length));
  const body = rows
    .map(([l, r]) => `  ${c.brand("$")} ${c.value(l.padEnd(lhsWidth))}  ${c.dim(r)}`)
    .join("\n");

  return `${banner()}\n${body}\n\n  ${c.dim("Docs:")} ${c.underline("https://aipagents.xyz")}\n`;
}
