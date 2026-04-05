import { NextRequest, NextResponse } from "next/server";
import { parseFile, isSupported } from "@/lib/files/parser";

/**
 * POST /api/files
 * Upload and parse a file. Returns extracted text content.
 *
 * Accepts multipart/form-data with a single "file" field.
 * Returns: { text, type, pageCount?, rowCount?, fileName }
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!isSupported(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Supported: PDF, XLSX, CSV, TXT, JSON, PNG, JPG` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await parseFile(buffer, file.type, file.name);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      text: result.text,
      type: result.type,
      pageCount: result.pageCount,
      rowCount: result.rowCount,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `File processing failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
