/**
 * Tiny markdown-to-terminal renderer for agent task output.
 *
 * Why: when `aip ask` returns text from a Claude-backed agent, the
 * artifact often contains markdown (** bold **, ## headings, `code`,
 * bullet lists). Printing those characters raw is noisy; mapping
 * them onto ANSI styles produces output that reads like the chat UI.
 *
 * What's supported (intentionally a tiny subset, no markdown lib):
 *   - `# H1` / `## H2` / `### H3`     bold (+ underline for H1)
 *   - `**bold**`                       bold
 *   - `*italic*` / `_italic_`          italic
 *   - `` `inline code` ``              dim
 *   - `- item` / `* item` bullets      brand-colored "·" bullet
 *
 * Code fences, blockquotes, tables, links, and images are passed
 * through unchanged - intentional, because a terminal can't render
 * them and rewriting tends to hurt more than help.
 */
import chalk from "chalk";
import { c } from "./theme.js";

const noColor =
  process.env.NO_COLOR !== undefined ||
  process.env.TERM === "dumb" ||
  !process.stdout.isTTY;

const italic = noColor ? (s: string) => s : (s: string) => chalk.italic(s);

export function renderMarkdownInline(md: string): string {
  if (!md) return md;
  return md
    // Headings (process H3 first so it doesn't shadow H2/H1).
    .replace(/^### (.+)$/gm, (_, t: string) => c.bold(c.dim(t)))
    .replace(/^## (.+)$/gm, (_, t: string) => c.bold(t))
    .replace(/^# (.+)$/gm, (_, t: string) => c.bold(c.underline(t)))
    // **bold**
    .replace(/\*\*([^*\n]+)\*\*/g, (_, t: string) => c.bold(t))
    // _italic_ (underscore form is safer than * because we already ate **)
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, (_, p: string, t: string) => `${p}${italic(t)}`)
    // *italic* (single-star form - only what's left after **bold** was processed)
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (_, p: string, t: string) => `${p}${italic(t)}`)
    // `inline code`
    .replace(/`([^`\n]+)`/g, (_, t: string) => c.dim(t))
    // - bullet / * bullet (keeps any indentation that came before)
    .replace(/^([ \t]*)[-*] /gm, (_, indent: string) => `${indent}${c.brand("·")} `);
}
