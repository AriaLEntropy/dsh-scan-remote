import { randomUUID } from "node:crypto";
const MAX_ENTRIES = 500;
const LEVEL_ORDER = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
export class AppLogBuffer {
    entries = [];
    ids = new Set();
    append(entry) {
        const message = entry.message.trim();
        if (!message)
            return;
        const id = entry.id?.trim() || randomUUID();
        if (this.ids.has(id))
            return;
        const stored = {
            id,
            ts: typeof entry.ts === "number" ? entry.ts : Date.now(),
            level: normalizeLevel(entry.level),
            tag: entry.tag?.trim() || "app",
            message,
        };
        this.ids.add(id);
        this.entries.push(stored);
        if (this.entries.length > MAX_ENTRIES) {
            const removed = this.entries.splice(0, this.entries.length - MAX_ENTRIES);
            for (const item of removed)
                this.ids.delete(item.id);
        }
        return stored;
    }
    ingest(entries) {
        if (!Array.isArray(entries))
            return;
        for (const value of entries) {
            if (!value || typeof value !== "object")
                continue;
            const item = value;
            if (typeof item.message !== "string")
                continue;
            this.append({
                id: typeof item.id === "string" ? item.id : undefined,
                ts: typeof item.ts === "number" ? item.ts : undefined,
                level: typeof item.level === "string" ? item.level : undefined,
                tag: typeof item.tag === "string" ? item.tag : undefined,
                message: item.message,
            });
        }
    }
    list(options = {}) {
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
        this.ids.clear();
    }
}
function normalizeLevel(value) {
    if (value === "debug" || value === "warn" || value === "error")
        return value;
    return "info";
}
export const appLogs = new AppLogBuffer();
