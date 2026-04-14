"use client";

import { useState, useRef, useCallback } from "react";

interface FileUploadProps {
  onFileContent: (content: string, fileName: string, fileType: string) => void;
  disabled?: boolean;
}

const ACCEPT = ".pdf,.xlsx,.xls,.csv,.txt,.json,.png,.jpg,.jpeg";
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default function FileUpload({ onFileContent, disabled }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (file.size > MAX_SIZE) {
      setError(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 10MB)`);
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/files", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload failed");
        setUploading(false);
        return;
      }

      // Build content summary for the agent
      let summary = `[File: ${file.name}]`;
      if (data.pageCount) summary += ` (${data.pageCount} pages)`;
      if (data.rowCount) summary += ` (${data.rowCount} rows)`;
      summary += `\n\n${data.text}`;

      onFileContent(summary, file.name, data.type);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }

    setUploading(false);
  }, [onFileContent]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input so same file can be uploaded again
    if (inputRef.current) inputRef.current.value = "";
  }, [processFile]);

  return (
    <div className="relative">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={`border border-dashed rounded-lg px-3 py-2 cursor-pointer transition-colors flex items-center justify-center ${
          dragOver
            ? "border-accent bg-accent/5"
            : "border-forest-deep/40 hover:border-mint/30"
        } ${disabled || uploading ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleChange}
          disabled={disabled || uploading}
          className="hidden"
        />
        <span className="font-mono text-[10px] text-muted leading-none">
          {uploading ? "Parsing file..." : "Drop file or click (PDF, XLSX, CSV, TXT)"}
        </span>
      </div>
      {error && (
        <span className="font-mono text-[9px] text-red-400 block mt-1">{error}</span>
      )}
    </div>
  );
}
