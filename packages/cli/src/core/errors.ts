export const ExitCode = {
  Ok: 0,
  Generic: 1,
  Misuse: 2,
  ConfigError: 78,
  NetworkError: 69,
  ValidationError: 65,
  WalletError: 77,
  NotFound: 70,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export class AipError extends Error {
  readonly exitCode: ExitCodeValue;
  readonly hint?: string;

  constructor(message: string, exitCode: ExitCodeValue = ExitCode.Generic, hint?: string) {
    super(message);
    this.name = "AipError";
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

export class ConfigError extends AipError {
  constructor(message: string, hint?: string) {
    super(message, ExitCode.ConfigError, hint);
    this.name = "ConfigError";
  }
}

export class NetworkError extends AipError {
  readonly status?: number;
  constructor(message: string, status?: number, hint?: string) {
    super(message, ExitCode.NetworkError, hint);
    this.name = "NetworkError";
    this.status = status;
  }
}

export class ValidationError extends AipError {
  constructor(message: string, hint?: string) {
    super(message, ExitCode.ValidationError, hint);
    this.name = "ValidationError";
  }
}

export class WalletError extends AipError {
  constructor(message: string, hint?: string) {
    super(message, ExitCode.WalletError, hint);
    this.name = "WalletError";
  }
}

export class NotFoundError extends AipError {
  constructor(message: string, hint?: string) {
    super(message, ExitCode.NotFound, hint);
    this.name = "NotFoundError";
  }
}

export function isAipError(e: unknown): e is AipError {
  return e instanceof AipError;
}
