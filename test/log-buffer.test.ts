import test from "node:test";
import assert from "node:assert/strict";
import { LogBuffer } from "../src/log-buffer.js";

test("log buffer keeps newest entries and filters by level", () => {
  const buffer = new LogBuffer();
  const first = buffer.append("debug", "relay", "connecting");
  buffer.append("info", "relay", "connected");
  buffer.append("warn", "relay", "retrying");
  buffer.append("error", "relay", "failed");

  assert.deepEqual(
    buffer.list({ since: first.id }).map((entry) => entry.message),
    ["connected", "retrying", "failed"],
  );
  assert.deepEqual(
    buffer.list({ level: "warn" }).map((entry) => entry.level),
    ["warn", "error"],
  );
  assert.deepEqual(
    buffer.list({ limit: 2 }).map((entry) => entry.message),
    ["retrying", "failed"],
  );
});

test("log buffer can be cleared", () => {
  const buffer = new LogBuffer();
  buffer.append("info", "plugin", "ready");
  buffer.clear();
  assert.equal(buffer.list().length, 0);
});
