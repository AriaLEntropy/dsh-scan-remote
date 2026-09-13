import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createManagementHandler } from "../src/management.js";
import { scanRemoteLogs } from "../src/log-buffer.js";
import { RemoteAccessManager } from "../src/remote-access.js";

test("management mutations are local-only while state remains readable", async () => {
  let pairingRequests = 0;
  const manager = new RemoteAccessManager({
    hostName: "Test Mac",
    relay: "https://relay.test",
    dshPort: 3080,
  }, {
    request: async () => { pairingRequests += 1; throw new Error("unexpected"); },
    probeDsh: async () => true,
  });
  const server = createServer(createManagementHandler(manager));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const state = await fetch(`${base}/dsh-scan-remote/api/state`, {
      headers: { "x-dsh-scan-remote": "1" },
    });
    assert.equal(state.status, 200);
    assert.equal((await state.json()).localActionsAllowed, false);

    const pairing = await fetch(`${base}/dsh-scan-remote/api/pairing`, {
      method: "POST",
      headers: { "x-dsh-scan-remote": "1" },
    });
    assert.equal(pairing.status, 403);
    assert.equal((await pairing.json()).reason, "local_management_required");
    assert.equal(pairingRequests, 0);
  } finally {
    manager.dispose();
    server.close();
    await once(server, "close");
  }
});

test("local management can remove an active pairing", async () => {
  let revokedToken: string | undefined;
  let savedToken: string | undefined = "not-saved";
  const manager = new RemoteAccessManager({
    hostId: "host_test",
    hostToken: "token_private",
    hostName: "Test Mac",
    relay: "https://relay.test",
    dshPort: 3080,
  }, {
    requestUnbind: async (config) => {
      revokedToken = config.hostToken;
      return { status: 200, data: { ok: true } };
    },
    save: async (config) => { savedToken = config.hostToken; },
    probeDsh: async () => true,
  });
  const server = createServer(createManagementHandler(manager));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/dsh-scan-remote/api/pairing`,
      { method: "DELETE" },
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).phase, "unpaired");
    assert.equal(revokedToken, "token_private");
    assert.equal(savedToken, undefined);
  } finally {
    manager.dispose();
    server.close();
    await once(server, "close");
  }
});

test("logs page and API expose buffered events", async () => {
  scanRemoteLogs.clear();
  scanRemoteLogs.append("info", "relay", "connected");
  const manager = new RemoteAccessManager({
    hostName: "Test Mac",
    relay: "https://relay.test",
    dshPort: 3080,
  }, { probeDsh: async () => true });
  const server = createServer(createManagementHandler(manager));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const page = await fetch(`${base}/dsh-scan-remote/logs`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /dsh-scan-remote 日志/);

    const logs = await fetch(`${base}/dsh-scan-remote/api/logs?level=info`);
    assert.equal(logs.status, 200);
    const body = await logs.json();
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].message, "connected");

    const cleared = await fetch(`${base}/dsh-scan-remote/api/logs`, { method: "DELETE" });
    assert.equal(cleared.status, 200);
    const afterClear = await (await fetch(`${base}/dsh-scan-remote/api/logs`)).json();
    assert.equal(afterClear.entries.length, 0);
  } finally {
    scanRemoteLogs.clear();
    manager.dispose();
    server.close();
    await once(server, "close");
  }
});

test("remote clients can read logs but not clear them", async () => {
  scanRemoteLogs.clear();
  scanRemoteLogs.append("warn", "relay", "retrying");
  const manager = new RemoteAccessManager({
    hostName: "Test Mac",
    relay: "https://relay.test",
    dshPort: 3080,
  }, { probeDsh: async () => true });
  const server = createServer(createManagementHandler(manager));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const logs = await fetch(`${base}/dsh-scan-remote/api/logs`, {
      headers: { "x-dsh-scan-remote": "1" },
    });
    assert.equal(logs.status, 200);
    assert.equal((await logs.json()).entries[0].message, "retrying");

    const cleared = await fetch(`${base}/dsh-scan-remote/api/logs`, {
      method: "DELETE",
      headers: { "x-dsh-scan-remote": "1" },
    });
    assert.equal(cleared.status, 403);
  } finally {
    scanRemoteLogs.clear();
    manager.dispose();
    server.close();
    await once(server, "close");
  }
});

test("app logs page and API accept forwarded phone events", async () => {
  const { appLogs } = await import("../src/app-log-buffer.js");
  appLogs.clear();
  appLogs.ingest([{ id: "a1", ts: Date.now(), level: "info", tag: "DshRelay", message: "ready" }]);
  const manager = new RemoteAccessManager({
    hostName: "Test Mac",
    relay: "https://relay.test",
    dshPort: 3080,
  }, { probeDsh: async () => true });
  const server = createServer(createManagementHandler(manager));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const page = await fetch(`${base}/dsh-scan-remote/app-logs`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /DSH App 日志/);
    const logs = await fetch(`${base}/dsh-scan-remote/api/app-logs`);
    assert.equal((await logs.json()).entries[0].message, "ready");
  } finally {
    appLogs.clear();
    manager.dispose();
    server.close();
    await once(server, "close");
  }
});

test("file manager and self-update routes are gone", async () => {
  const manager = new RemoteAccessManager({
    hostName: "Test Mac",
    relay: "https://relay.test",
    dshPort: 3080,
  }, { probeDsh: async () => true });
  const server = createServer(createManagementHandler(manager));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(`${base}/dsh-scan-remote/files`)).status, 404);
    assert.equal((await fetch(`${base}/dsh-scan-remote/api/files`)).status, 404);
    assert.equal((await fetch(`${base}/dsh-scan-remote/api/update`)).status, 404);
    assert.equal((await fetch(`${base}/dsh-mobile/api/state`)).status, 404);
  } finally {
    manager.dispose();
    server.close();
    await once(server, "close");
  }
});
