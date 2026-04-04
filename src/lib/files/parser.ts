/**
 * File Parser — extract text content from uploaded files.
 *
 * Supports: PDF, XLSX, CSV, TXT, JSON, images
 *
 * PDF strategy (hybrid):
 *   1. Try pdf-parse for text extraction (fast, text-based PDFs)
 *   2. If text is too short → PDF is likely scanned/image-based
 *   3. Fall back to Claude Vision API — sends raw PDF as document
 *   4. Claude reads the PDF visually (tables, handwriting, scanned text)
 *   5. User always gets a result, never an error about "can't read"
 */

export interface ParseResult {
  text: string;
  type: string;
  pageCount?: number;
  rowCount?: number;
  error?: string;
  /** If true, content was extracted via Claude Vision (scanned PDF fallback) */
  visionFallback?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_LENGTH = 50_000; // Limit text sent to agent

/** Minimum meaningful chars per page to consider pdf-parse output valid.
 *  Scanned PDFs often produce whitespace/garbage chars that pass a low threshold. */
const MIN_CHARS_PER_PAGE = 100;

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
        return await parseImage(buffer, mimeType, fileName);
      default:
        return { text: "", type: "error", error: `Unhandled type: ${fileType}` };
    }
  } catch (err) {
    return { text: "", type: "error", error: `Parse failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ------------------------------------------------------------------ */
/*  PDF — hybrid: text extraction + Claude Vision fallback             */
/* ------------------------------------------------------------------ */

async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  // Step 1: Try text extraction with pdf-parse
  let textResult: { text: string; numpages: number } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> = require("pdf-parse");
    textResult = await pdfParse(buffer);
  } catch {
    // pdf-parse failed — will fall back to Vision
  }

  // Step 2: Check if text extraction produced meaningful content
  if (textResult) {
    const trimmed = textResult.text.trim();
    const charsPerPage = textResult.numpages > 0 ? trimmed.length / textResult.numpages : trimmed.length;

    // Check both character count and actual word count
    const wordCount = trimmed.split(/\s+/).filter((w) => w.length > 1).length;
    const wordsPerPage = textResult.numpages > 0 ? wordCount / textResult.numpages : wordCount;

    if (charsPerPage >= MIN_CHARS_PER_PAGE && wordsPerPage >= 20) {
      // Good text extraction — use it directly
      return {
        text: trimmed.slice(0, MAX_TEXT_LENGTH),
        type: "pdf",
        pageCount: textResult.numpages,
      };
    }
  }

  // Step 3: Text extraction failed or produced garbage → use Claude Vision
  const visionResult = await extractWithVision(buffer, "application/pdf");
  if (visionResult) {
    return {
      text: visionResult.slice(0, MAX_TEXT_LENGTH),
      type: "pdf",
      pageCount: textResult?.numpages,
      visionFallback: true,
    };
  }

  // Step 4: Both methods failed — return whatever text we got
  return {
    text: textResult?.text.slice(0, MAX_TEXT_LENGTH) || "[PDF could not be read — file may contain only images without text]",
    type: "pdf",
    pageCount: textResult?.numpages,
  };
}

/* ------------------------------------------------------------------ */
/*  Claude Vision — reads documents/images visually                    */
/* ------------------------------------------------------------------ */

/**
 * Use Claude API to visually read a document or image.
 * Supports PDF (via document type) and images (via image type).
 */
async function extractWithVision(buffer: Buffer, mimeType: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const base64 = buffer.toString("base64");
    const isPdf = mimeType === "application/pdf";

    // Build message content with document/image blocks
    const content: Array<{ type: string; source?: Record<string, string>; text?: string }> = isPdf
      ? [{
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf", data: base64 },
        }, {
          type: "text" as const,
          text: "Extract ALL text content from this document. Preserve the structure: headings, tables, lists, paragraphs. If there are tables, format them with | separators. Output only the extracted content, no commentary.",
        }]
      : [{
          type: "image" as const,
          source: { type: "base64" as const, media_type: mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: base64 },
        }, {
          type: "text" as const,
          text: "Describe what you see in this image in detail. If there is text, extract it. If there are tables or charts, describe their content.",
        }];

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "user", content: content as any }],
    });

    const block = response.content[0];
    if (block.type === "text") return block.text;
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Other parsers                                                      */
/* ------------------------------------------------------------------ */

function parseXlsx(buffer: Buffer): ParseResult {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets: string[] = [];
  let totalRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
    totalRows += json.length;

    sheets.push(`[Sheet: ${sheetName}]`);
    for (const row of json.slice(0, 200)) {
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
  JSON.parse(content); // validate
  const text = content.slice(0, MAX_TEXT_LENGTH);
  return { text, type: "json" };
}

async function parseImage(buffer: Buffer, mimeType: string, fileName: string): Promise<ParseResult> {
  // Try Claude Vision for image analysis
  const visionResult = await extractWithVision(buffer, mimeType);
  if (visionResult) {
    return { text: visionResult, type: "image", visionFallback: true };
  }

  return {
    text: `[Image file: ${fileName}, size: ${(buffer.length / 1024).toFixed(1)}KB — vision analysis unavailable]`,
    type: "image",
  };
}
