import { c, glyph } from "./theme.js";

const DEBUG = process.env.AIP_DEBUG === "1" || process.env.DEBUG?.includes("aip");

function writeErr(line: string): void {
  process.stderr.write(line + "\n");
}

export const log = {
  info(message: string): void {
    writeErr(`${c.brand(glyph.info)} ${message}`);
  },
  success(message: string): void {
    writeErr(`${c.success(glyph.success)} ${message}`);
  },
  warn(message: string): void {
    writeErr(`${c.warning(glyph.warn)} ${message}`);
  },
  error(message: string, hint?: string): void {
    writeErr(`${c.error(glyph.failure)} ${c.errorBold(message)}`);
    if (hint) writeErr(`  ${c.dim(glyph.arrow)} ${c.dim(hint)}`);
  },
  step(message: string): void {
    writeErr(`${c.dim(glyph.bullet)} ${c.dim(message)}`);
  },
  debug(message: string): void {
    if (!DEBUG) return;
    writeErr(`${c.dim("[debug]")} ${c.dim(message)}`);
  },
  raw(line: string): void {
    process.stdout.write(line + "\n");
  },
  blank(): void {
    writeErr("");
  },
};
