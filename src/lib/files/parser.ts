/**
 * File Parser — extract text content from uploaded files.
 *
 * Supports: PDF, XLSX, CSV, TXT, JSON
 * Parsed content is sent to agents as text input.
 */

export interface ParseResult {
  text: string;
  type: string;
  pageCount?: number;
  rowCount?: number;
  error?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_LENGTH = 50_000; // Limit text sent to agent

const SUPPORTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xlsx",
  "text/csv": "csv",
  "text/plain": "txt",
  "application/json": "json",
  "image/png": "image",
  "image/jpeg": "image",
  "image/jpg": "image",
};

export function getSupportedExtensions(): string[] {
  return [".pdf", ".xlsx", ".xls", ".csv", ".txt", ".json", ".png", ".jpg", ".jpeg"];
}

export function isSupported(mimeType: string): boolean {
  return mimeType in SUPPORTED_TYPES;
}

export function getFileType(mimeType: string): string | null {
  return SUPPORTED_TYPES[mimeType] ?? null;
}

/**
 * Parse a file buffer into text content.
 */
export async function parseFile(buffer: Buffer, mimeType: string, fileName: string): Promise<ParseResult> {
  if (buffer.length > MAX_FILE_SIZE) {
    return { text: "", type: "error", error: `File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max 10MB)` };
  }

  const fileType = getFileType(mimeType);
  if (!fileType) {
    return { text: "", type: "error", error: `Unsupported file type: ${mimeType}` };
  }

  try {
    switch (fileType) {
      case "pdf":
        return await parsePdf(buffer);
      case "xlsx":
        return parseXlsx(buffer);
      case "csv":
        return parseCsv(buffer);
      case "txt":
        return parseTxt(buffer);
      case "json":
        return parseJson(buffer);
      case "image":
        return parseImage(buffer, mimeType, fileName);
      default:
        return { text: "", type: "error", error: `Unhandled type: ${fileType}` };
    }
  } catch (err) {
    return { text: "", type: "error", error: `Parse failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ------------------------------------------------------------------ */
/*  Individual parsers                                                 */
/* ------------------------------------------------------------------ */

async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  // pdf-parse v1.1.1 exports a function directly
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> = require("pdf-parse");
  const data = await pdfParse(buffer);
  const text = data.text.slice(0, MAX_TEXT_LENGTH);
  return {
    text,
    type: "pdf",
    pageCount: data.numpages,
  };
}

function parseXlsx(buffer: Buffer): ParseResult {
  const XLSX = require("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets: string[] = [];
  let totalRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
    totalRows += json.length;

    sheets.push(`[Sheet: ${sheetName}]`);
    // Convert to CSV-like text
    for (const row of json.slice(0, 200)) { // Limit rows
      sheets.push((row as unknown[]).map(String).join("\t"));
    }
    if (json.length > 200) {
      sheets.push(`... (${json.length - 200} more rows)`);
    }
  }

  const text = sheets.join("\n").slice(0, MAX_TEXT_LENGTH);
  return { text, type: "xlsx", rowCount: totalRows };
}

function parseCsv(buffer: Buffer): ParseResult {
  const content = buffer.toString("utf-8");
  const lines = content.split("\n");
  const text = lines.slice(0, 500).join("\n").slice(0, MAX_TEXT_LENGTH);
  return { text, type: "csv", rowCount: lines.length };
}

function parseTxt(buffer: Buffer): ParseResult {
  const text = buffer.toString("utf-8").slice(0, MAX_TEXT_LENGTH);
  return { text, type: "txt" };
}

function parseJson(buffer: Buffer): ParseResult {
  const content = buffer.toString("utf-8");
  // Validate JSON
  JSON.parse(content);
  const text = content.slice(0, MAX_TEXT_LENGTH);
  return { text, type: "json" };
}

function parseImage(buffer: Buffer, mimeType: string, fileName: string): ParseResult {
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;
  // For images, return a description prompt instead of raw data
  return {
    text: `[Image file: ${fileName}, size: ${(buffer.length / 1024).toFixed(1)}KB, type: ${mimeType}]`,
    type: "image",
  };
}
