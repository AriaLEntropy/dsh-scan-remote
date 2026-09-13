import test from "node:test";
import assert from "node:assert/strict";
import { AppLogBuffer } from "../src/app-log-buffer.js";

test("app log buffer deduplicates forwarded entries", () => {
  const buffer = new AppLogBuffer();
  buffer.ingest([
    { id: "1", ts: 100, level: "info", tag: "DshRelay", message: "connected" },
    { id: "1", ts: 100, level: "info", tag: "DshRelay", message: "connected" },
    { id: "2", ts: 200, level: "error", tag: "DshStream", message: "ui.error" },
  ]);
  assert.equal(buffer.list().length, 2);
  assert.equal(buffer.list()[0].tag, "DshRelay");
});
