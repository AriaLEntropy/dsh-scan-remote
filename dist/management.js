import { scanRemoteLogs } from "./log-buffer.js";
import { appLogs } from "./app-log-buffer.js";
import { renderAppLogsPage, renderLogsPage } from "./logs-page.js";
const PREFIX = "/dsh-scan-remote";
function json(res, status, body) {
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
    });
    res.end(JSON.stringify(body));
}
function html(res, status, body) {
    res.writeHead(status, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
    });
    res.end(body);
}
function parseLogLevel(value) {
    if (value === "debug" || value === "info" || value === "warn" || value === "error")
        return value;
    return undefined;
}
export function isRemoteRequest(req) {
    return req.headers["x-dsh-scan-remote"] === "1";
}
export function createManagementHandler(manager) {
    return async (req, res) => {
        const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
        try {
            if (req.method === "GET" && path === `${PREFIX}/api/state`) {
                return json(res, 200, {
                    ...(await manager.state()),
                    localActionsAllowed: !isRemoteRequest(req),
                });
            }
            if (req.method === "GET" && path === `${PREFIX}/api/access-sessions`) {
                return json(res, 200, { sessions: await manager.accessSessions() });
            }
            if (req.method === "GET" && path === `${PREFIX}/api/logs`) {
                const query = new URL(req.url ?? "/", "http://127.0.0.1").searchParams;
                const limit = Number.parseInt(query.get("limit") ?? "200", 10);
                return json(res, 200, {
                    entries: scanRemoteLogs.list({
                        since: query.get("since") ?? undefined,
                        level: parseLogLevel(query.get("level")),
                        limit: Number.isFinite(limit) ? limit : 200,
                    }),
                });
            }
            if (req.method === "GET" && (path === `${PREFIX}/logs` || path === `${PREFIX}/logs/`)) {
                return html(res, 200, renderLogsPage());
            }
            if (req.method === "GET" && path === `${PREFIX}/api/app-logs`) {
                const query = new URL(req.url ?? "/", "http://127.0.0.1").searchParams;
                const limit = Number.parseInt(query.get("limit") ?? "200", 10);
                return json(res, 200, {
                    entries: appLogs.list({
                        since: query.get("since") ?? undefined,
                        level: parseLogLevel(query.get("level")),
                        limit: Number.isFinite(limit) ? limit : 200,
                    }),
                });
            }
            if (req.method === "GET" && (path === `${PREFIX}/app-logs` || path === `${PREFIX}/app-logs/`)) {
                return html(res, 200, renderAppLogsPage());
            }
            if (isRemoteRequest(req) && (req.method === "POST" || req.method === "DELETE")) {
                return json(res, 403, { reason: "local_management_required" });
            }
            if (req.method === "POST" && path === `${PREFIX}/api/pairing`) {
                return json(res, 200, await manager.startPairing());
            }
            if (req.method === "DELETE" && path === `${PREFIX}/api/pairing`) {
                return json(res, 200, await manager.removePairing());
            }
            if (req.method === "DELETE" && path === `${PREFIX}/api/logs`) {
                scanRemoteLogs.clear();
                return json(res, 200, { ok: true });
            }
            if (req.method === "DELETE" && path === `${PREFIX}/api/app-logs`) {
                appLogs.clear();
                return json(res, 200, { ok: true });
            }
            return json(res, 404, { reason: "not_found" });
        }
        catch (error) {
            return json(res, 502, {
                reason: "relay_unavailable",
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };
}
export function registerManagementRoutes(webServer, manager) {
    return webServer.register({
        kind: "prefix",
        path: PREFIX,
        handler: createManagementHandler(manager),
    });
}
