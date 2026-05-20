import { homedir } from "node:os";
import { c, glyph } from "../core/theme.js";
import { VERSION } from "../core/constants.js";

const TAGLINE = "the Agent Internet Protocol, in your terminal";

/**
 * Compact block-character rendering of the AIP brand mark. 6 rows ×
 * ~22 columns - sized to sit beside a 3-line text column, Claude Code
 * style. Edit ascii.md for the full-resolution source.
 */
const LOGO_LINES: readonly string[] = [
  "       ▟████████████▙",
  "      ▟███▌  ▐█████████▙",
  "     ▟████▌  ▐██████████▙",
  "    ▟█████▌  ▐███████████▙",
  "   ▟██████▌  ▐████████████▙",
  "    ▀▀▀▀▀▀    ▀▀▀▀▀▀▀▀▀▀▀▀",
];

const LOGO_VISUAL_WIDTH = 28;

/** Compact single-line brand mark - used by sub-command headers. */
export function banner(): string {
  return `\n  ${c.brandBold("AIP")} ${c.dim(glyph.dot)} ${c.dim(TAGLINE)}  ${c.dim(`v${VERSION}`)}\n`;
}

/**
 * Welcome screen - shown when the user runs `aip` with no subcommand.
 * Claude Code style: small logo on the left, three lines of meta on
 * the right, then a divider and a minimal example command list.
 */
export function welcome(): string {
  const cwdLabel = process.cwd().replace(homedir(), "~");

  const metaLines: string[] = [
    `${c.brandBold("AIP")}  ${c.dim(glyph.dot)}  ${c.dim(`v${VERSION}`)}  ${c.dim(glyph.dot)}  ${c.dim("devnet")}`,
    c.dim(TAGLINE),
    c.dim(cwdLabel),
  ];

  // Pad logo to its full visual width and pin the meta column to the
  // right of it. Logo is 6 rows; we drop the 3 meta lines onto rows
  // 2..4 so the text visually centers against the logo's body.
  const heroBlock: string[] = LOGO_LINES.map((line, i) => {
    const padded = line + " ".repeat(Math.max(0, LOGO_VISUAL_WIDTH - line.length));
    const metaIdx = i - 1; // shift meta down by one row
    const meta = metaIdx >= 0 ? (metaLines[metaIdx] ?? "") : "";
    return `  ${c.brand(padded)}   ${meta}`;
  });

  const divider = c.dim("  " + "─".repeat(72));

  const examples: Array<[string, string]> = [
    ["aip login",              "Create or import a Solana wallet"],
    ["aip agents ls",          "Browse the marketplace"],
    [`aip ask <ref> "prompt"`, "One-shot task, auto-pays in USDC"],
    ["aip chat <ref>",         "Multi-turn REPL with per-turn payment"],
    ["aip resolve <did|url>",  "Verify an agent's on-chain identity"],
    ["aip init <name>",        "Scaffold your own agent"],
    ["aip register --on-chain","Publish to marketplace + registry PDA"],
  ];
  const exWidth = Math.max(...examples.map(([l]) => l.length));
  const exampleLines = examples.map(([cmd, desc]) =>
    `  ${c.value(cmd.padEnd(exWidth))}   ${c.dim(desc)}`,
  );

  const footer =
    `  ${c.dim("Full reference:")} ${c.value("aip --help")}    ${c.dim("Docs:")} ${c.underline("aipagents.xyz")}`;

  const lines: string[] = [
    "",
    ...heroBlock,
    "",
    divider,
    "",
    ...exampleLines,
    "",
    footer,
    "",
  ];

  return lines.join("\n") + "\n";
}
