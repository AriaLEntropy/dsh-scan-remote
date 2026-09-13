import z from "@deepseek-ai/schemastery";
import { loadConfig, saveConfig } from "./config.js";
import { formatError, logInfo, logWarn } from "./log-buffer.js";
import { registerManagementRoutes, WebServer } from "./management.js";
import { RemoteAccessManager } from "./remote-access.js";
import type { HostAuthProvider } from "./relay-client.js";

export const name = "dsh-scan-remote";
export const Config = z.object({
  relay: z.string().required(),
  dshPort: z.natural().max(65535).required(),
});

type PluginConfig = { relay: string; dshPort: number };
type PluginContext = {
  webServer: WebServer;
  effect(
    callback: () => void | (() => void | Promise<void>),
    label?: string,
  ): void;
  logger: { info(message: string): void; warn(error: unknown): void };
  /** Optional service lookup: `connection` exists only on new-generation Hosts. */
  get?(name: string): unknown;
};

type ConnectionLike = { authenticatedUrl?(baseUrl: string): string };

/**
 * Obtain the new-generation Host's browser-auth cookie on the app's behalf.
 * `ctx.connection.authenticatedUrl()` embeds the process launch token; the
 * root token exchange mints the signed cookie used by every later request.
 * Returns null on the legacy generation (no `connection` service).
 */
function createHostAuthProvider(ctx: PluginContext, dshPort: number): HostAuthProvider {
  const connection = ctx.get?.("connection") as ConnectionLike | undefined;
  const authenticatedUrl = connection?.authenticatedUrl?.bind(connection);
  if (!authenticatedUrl) return async () => null;
  let cache: { cookie: string; expiresAt: number } | undefined;
  return async () => {
    if (cache && Date.now() < cache.expiresAt) return cache.cookie;
    try {
      const url = authenticatedUrl(`http://127.0.0.1:${dshPort}`);
      const response = await fetch(url, { redirect: "manual" });
      const raw = readSetCookie(response);
      if (!raw) return null;
      const cookie = raw.split(";", 1)[0].trim();
      if (!cookie) return null;
      const maxAge = /max-age=(\d+)/i.exec(raw);
      const ttlMs = maxAge ? Number(maxAge[1]) * 1000 : 30 * 24 * 60 * 60 * 1000;
      cache = {
        cookie,
        expiresAt: Date.now() + Math.max(60_000, ttlMs - 5 * 60_000),
      };
      return cookie;
    } catch {
      return null;
    }
  };
}

function readSetCookie(response: Response): string | undefined {
  const headers = response.headers as Headers & { getSetCookie?(): string[] };
  const all = headers.getSetCookie?.();
  if (Array.isArray(all) && all.length > 0) return all[0];
  return response.headers.get("set-cookie") ?? undefined;
}

export function apply(ctx: PluginContext, pluginConfig: PluginConfig) {
  ctx.effect(() => {
    let disposed = false;
    let manager: RemoteAccessManager | undefined;
    let unregister: (() => void) | undefined;

    void (async () => {
      try {
        const config = {
          ...(await loadConfig()),
          relay: pluginConfig.relay,
          dshPort: pluginConfig.dshPort,
        };
        await saveConfig(config);
        if (disposed) return;
        manager = new RemoteAccessManager(config, {
          hostAuth: createHostAuthProvider(ctx, config.dshPort),
        });
        unregister = registerManagementRoutes(ctx.webServer, manager);
        await manager.initialize();
        if (disposed) {
          unregister?.();
          unregister = undefined;
          manager.dispose();
          manager = undefined;
          return;
        }
        const readyMessage = config.hostToken
          ? `dsh-scan-remote connecting through ${config.relay}`
          : "dsh-scan-remote is ready to show a pairing QR in Settings > Remote Access";
        logInfo("plugin", readyMessage);
        ctx.logger.info(readyMessage);
      } catch (error) {
        logWarn("plugin", "Plugin startup failed", formatError(error));
        ctx.logger.warn(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    })();

    return () => {
      disposed = true;
      unregister?.();
      manager?.dispose();
    };
  }, "dsh-scan-remote.lifecycle");
}
