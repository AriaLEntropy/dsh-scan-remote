import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  id: string;
  ts: number;
  level: LogLevel;
  source: string;
  message: string;
  detail?: string;
};

const MAX_ENTRIES = 500;
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class LogBuffer {
  private entries: LogEntry[] = [];

  append(
    level: LogLevel,
    source: string,
    message: string,
    detail?: string,
  ): LogEntry {
    const entry: LogEntry = {
      id: randomUUID(),
      ts: Date.now(),
      level,
      source,
      message,
      ...(detail ? { detail } : {}),
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    this.mirrorToConsole(entry);
    return entry;
  }

  list(options: {
    since?: string;
    limit?: number;
    level?: LogLevel;
  } = {}): LogEntry[] {
    const limit = Math.min(Math.max(options.limit ?? 200, 1), MAX_ENTRIES);
    const minLevel = options.level ? LEVEL_ORDER[options.level] : undefined;
    let items = this.entries;
    if (options.since) {
      const index = items.findIndex((entry) => entry.id === options.since);
      items = index >= 0 ? items.slice(index + 1) : items;
    }
    if (minLevel !== undefined) {
      items = items.filter((entry) => LEVEL_ORDER[entry.level] >= minLevel);
    }
    return items.slice(-limit);
  }

  clear() {
    this.entries = [];
  }

  private mirrorToConsole(entry: LogEntry) {
    const prefix = `[dsh-scan-remote:${entry.source}] ${entry.message}`;
    const payload = entry.detail ? `${prefix}\n${entry.detail}` : prefix;
    if (entry.level === "error") console.error(payload);
    else if (entry.level === "warn") console.warn(payload);
    else console.log(payload);
  }
}

export const scanRemoteLogs = new LogBuffer();

export function logDebug(source: string, message: string, detail?: string) {
  return scanRemoteLogs.append("debug", source, message, detail);
}

export function logInfo(source: string, message: string, detail?: string) {
  return scanRemoteLogs.append("info", source, message, detail);
}

export function logWarn(source: string, message: string, detail?: string) {
  return scanRemoteLogs.append("warn", source, message, detail);
}

export function logError(source: string, message: string, detail?: string) {
  return scanRemoteLogs.append("error", source, message, detail);
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}
