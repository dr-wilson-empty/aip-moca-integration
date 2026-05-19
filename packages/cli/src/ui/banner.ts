import { c, glyph } from "../core/theme.js";
import { VERSION } from "../core/constants.js";

const TAGLINE = "agent internet protocol";

export function banner(): string {
  return `\n  ${c.brandBold("aip")} ${c.dim(glyph.dot)} ${c.dim(TAGLINE)}  ${c.dim(`v${VERSION}`)}\n`;
}

export function welcome(): string {
  const rows: Array<[string, string]> = [
    ["aip whois <did|url>", "Inspect any agent's on-chain identity"],
    ["aip agents ls", "Browse the marketplace"],
    ["aip chat <did>", "Talk to an agent (auto-pays in USDC)"],
    ["aip init <name>", "Scaffold your own agent"],
    ["aip --help", "See all commands"],
  ];
  const lhsWidth = Math.max(...rows.map(([l]) => l.length));
  const body = rows
    .map(([l, r]) => `  ${c.brand("$")} ${c.value(l.padEnd(lhsWidth))}  ${c.dim(r)}`)
    .join("\n");

  return `${banner()}\n${body}\n\n  ${c.dim("Docs:")} ${c.underline("https://aipagents.xyz")}\n`;
}
