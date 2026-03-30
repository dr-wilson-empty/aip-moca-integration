/**
 * Yapilandirilmis JSON loglama.
 * Tum sunucu tarafindaki islemler bu modul uzerinden loglanir.
 */

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  action: string;
  data?: Record<string, unknown>;
}

function log(level: LogLevel, module: string, action: string, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    action,
    ...(data && { data }),
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (module: string, action: string, data?: Record<string, unknown>) =>
    log("info", module, action, data),
  warn: (module: string, action: string, data?: Record<string, unknown>) =>
    log("warn", module, action, data),
  error: (module: string, action: string, data?: Record<string, unknown>) =>
    log("error", module, action, data),
};
