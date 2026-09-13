export function renderLogsPage(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>dsh-scan-remote 日志</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f5f6f8;
      --panel: #ffffff;
      --text: #1b1f24;
      --muted: #667085;
      --border: #d7dbe3;
      --accent: #137fec;
      --debug: #667085;
      --info: #137fec;
      --warn: #d08b19;
      --error: #d04444;
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #111418;
        --panel: #1a1f27;
        --text: #eef2f7;
        --muted: #9aa4b2;
        --border: #2b3440;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.5 system-ui, -apple-system, Segoe UI, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 24px 16px 40px; }
    .head { display: flex; gap: 16px; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; flex-wrap: wrap; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    .sub { margin: 0; color: var(--muted); }
    .toolbar, .status {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .status {
      margin-bottom: 14px;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--panel);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--panel);
      font-size: 12px;
      color: var(--muted);
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #8a8f98; }
    .dot.online { background: #20a464; }
    .dot.wait { background: #d08b19; }
    select, button, input[type="search"] {
      height: 34px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      color: var(--text);
      padding: 0 12px;
      font: inherit;
    }
    button { cursor: pointer; }
    button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    button:disabled { opacity: .55; cursor: default; }
    .panel {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel);
      overflow: hidden;
    }
    .log-list { list-style: none; margin: 0; padding: 0; }
    .log-item {
      display: grid;
      grid-template-columns: 92px 72px 110px minmax(0, 1fr);
      gap: 12px;
      padding: 10px 14px;
      border-top: 1px solid var(--border);
      font-family: var(--mono);
      font-size: 12px;
    }
    .log-item:first-child { border-top: 0; }
    .time, .source { color: var(--muted); }
    .level { font-weight: 600; text-transform: uppercase; }
    .level.debug { color: var(--debug); }
    .level.info { color: var(--info); }
    .level.warn { color: var(--warn); }
    .level.error { color: var(--error); }
    .message { white-space: pre-wrap; word-break: break-word; }
    .empty, .error {
      padding: 28px 16px;
      text-align: center;
      color: var(--muted);
    }
    .error { color: var(--error); }
    .footer {
      margin-top: 12px;
      color: var(--muted);
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    a { color: var(--accent); }
    @media (max-width: 760px) {
      .log-item { grid-template-columns: 1fr; gap: 4px; }
      .time, .source { display: inline; }
      .time::after { content: " · "; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <h1>dsh-scan-remote 日志</h1>
        <p class="sub">实时查看 Relay 连接、配对与健康检查事件。</p>
      </div>
      <div class="toolbar">
        <label>
          <span class="sub">级别</span>
          <select id="level">
            <option value="">全部</option>
            <option value="debug">debug+</option>
            <option value="info" selected>info+</option>
            <option value="warn">warn+</option>
            <option value="error">error</option>
          </select>
        </label>
        <input id="search" type="search" placeholder="搜索消息…" />
        <button id="pause" type="button">暂停</button>
        <button id="clear" class="primary" type="button">清空日志</button>
      </div>
    </div>

    <div class="status" id="status">正在读取连接状态…</div>

    <div class="panel">
      <ul class="log-list" id="logs"></ul>
      <div class="empty" id="empty" hidden>暂无日志。启动插件或连接 Relay 后会出现记录。</div>
      <div class="error" id="load-error" hidden></div>
    </div>

    <div class="footer">
      <span id="meta">每 2 秒自动刷新</span>
      <span><a href="/">返回 DSH</a> · <a href="/dsh-scan-remote/api/logs" target="_blank" rel="noreferrer">JSON API</a></span>
    </div>
  </div>
  <script>
    const logsEl = document.getElementById("logs");
    const emptyEl = document.getElementById("empty");
    const errorEl = document.getElementById("load-error");
    const statusEl = document.getElementById("status");
    const metaEl = document.getElementById("meta");
    const levelEl = document.getElementById("level");
    const searchEl = document.getElementById("search");
    const pauseEl = document.getElementById("pause");
    const clearEl = document.getElementById("clear");
    let paused = false;
    let lastId = "";
    let entries = [];

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    function formatTime(ts) {
      return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
    }

    function renderStatus(state) {
      const connected = state.relayConnection === "connected";
      const waiting = state.phase === "pairing" || state.relayConnection === "connecting";
      const label = state.phase === "pairing"
        ? "等待扫码"
        : state.phase === "unpaired"
          ? "尚未配对"
          : connected
            ? "Relay 已连接"
            : waiting
              ? "Relay 连接中"
              : "Relay 未连接";
      statusEl.innerHTML = [
        '<span class="pill"><span class="dot ' + (connected ? "online" : waiting ? "wait" : "") + '"></span>' + escapeHtml(label) + "</span>",
        '<span class="pill">DSH ' + escapeHtml(state.dsh === "online" ? "运行中" : "未响应") + "</span>",
        '<span class="pill">Relay ' + escapeHtml(state.relay || "-") + "</span>",
        '<span class="pill">主机 ' + escapeHtml(state.hostName || "-") + "</span>",
      ].join("");
    }

    function filteredEntries() {
      const query = searchEl.value.trim().toLowerCase();
      if (!query) return entries;
      return entries.filter((entry) => {
        const haystack = [entry.message, entry.detail, entry.source].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(query);
      });
    }

    function renderLogs() {
      const visible = filteredEntries();
      if (!visible.length) {
        logsEl.innerHTML = "";
        emptyEl.hidden = entries.length !== 0;
        return;
      }
      emptyEl.hidden = true;
      logsEl.innerHTML = visible.map((entry) => {
        const text = entry.detail ? entry.message + "\\n" + entry.detail : entry.message;
        return [
          '<li class="log-item">',
          '<div class="time">' + escapeHtml(formatTime(entry.ts)) + "</div>",
          '<div class="level ' + escapeHtml(entry.level) + '">' + escapeHtml(entry.level) + "</div>",
          '<div class="source">' + escapeHtml(entry.source) + "</div>",
          '<div class="message">' + escapeHtml(text) + "</div>",
          "</li>",
        ].join("");
      }).join("");
      logsEl.scrollTop = logsEl.scrollHeight;
    }

    async function loadState() {
      const response = await fetch("/dsh-scan-remote/api/state", { cache: "no-store" });
      if (!response.ok) throw new Error("状态请求失败 (" + response.status + ")");
      renderStatus(await response.json());
    }

    async function loadLogs(initial) {
      const params = new URLSearchParams();
      const level = levelEl.value;
      if (level) params.set("level", level);
      if (!initial && lastId) params.set("since", lastId);
      params.set("limit", initial ? "200" : "100");
      const response = await fetch("/dsh-scan-remote/api/logs?" + params.toString(), { cache: "no-store" });
      if (!response.ok) throw new Error("日志请求失败 (" + response.status + ")");
      const body = await response.json();
      const next = Array.isArray(body.entries) ? body.entries : [];
      if (initial) entries = next;
      else if (next.length) entries = entries.concat(next).slice(-500);
      if (entries.length) lastId = entries[entries.length - 1].id;
      metaEl.textContent = "共 " + entries.length + " 条 · 每 2 秒自动刷新";
      renderLogs();
    }

    async function refresh(initial) {
      errorEl.hidden = true;
      try {
        await Promise.all([loadState(), loadLogs(initial)]);
      } catch (error) {
        errorEl.hidden = false;
        errorEl.textContent = error instanceof Error ? error.message : String(error);
      }
    }

    pauseEl.addEventListener("click", () => {
      paused = !paused;
      pauseEl.textContent = paused ? "继续" : "暂停";
      metaEl.textContent = paused ? "已暂停自动刷新" : ("共 " + entries.length + " 条 · 每 2 秒自动刷新");
    });

    clearEl.addEventListener("click", async () => {
      clearEl.disabled = true;
      try {
        const response = await fetch("/dsh-scan-remote/api/logs", { method: "DELETE" });
        if (!response.ok) throw new Error("清空失败 (" + response.status + ")");
        entries = [];
        lastId = "";
        renderLogs();
        await refresh(true);
      } catch (error) {
        errorEl.hidden = false;
        errorEl.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        clearEl.disabled = false;
      }
    });

    levelEl.addEventListener("change", () => {
      lastId = "";
      void refresh(true);
    });
    searchEl.addEventListener("input", renderLogs);

    void refresh(true);
    setInterval(() => { if (!paused) void refresh(false); }, 2000);
  </script>
</body>
</html>`;
}

export function renderAppLogsPage(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DSH App 日志</title>
  <style>
    :root { color-scheme: light dark; --bg:#f5f6f8; --panel:#fff; --text:#1b1f24; --muted:#667085; --border:#d7dbe3; --accent:#137fec; --mono:ui-monospace,Menlo,Consolas,monospace; }
    @media (prefers-color-scheme: dark) { :root { --bg:#111418; --panel:#1a1f27; --text:#eef2f7; --muted:#9aa4b2; --border:#2b3440; } }
    * { box-sizing:border-box; }
    body { margin:0; font:14px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--text); }
    .wrap { max-width:1080px; margin:0 auto; padding:24px 16px 40px; }
    .head { display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:16px; }
    h1 { margin:0 0 4px; font-size:22px; }
    .sub { margin:0; color:var(--muted); }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; }
    select,button,input { height:34px; border:1px solid var(--border); border-radius:8px; background:var(--panel); color:var(--text); padding:0 12px; font:inherit; }
    button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
    .panel { border:1px solid var(--border); border-radius:12px; background:var(--panel); overflow:hidden; }
    .item { display:grid; grid-template-columns:92px 72px 110px minmax(0,1fr); gap:12px; padding:10px 14px; border-top:1px solid var(--border); font-family:var(--mono); font-size:12px; }
    .item:first-child { border-top:0; }
    .muted { color:var(--muted); }
    .level.info { color:#137fec; } .level.warn { color:#d08b19; } .level.error { color:#d04444; } .level.debug { color:#667085; }
    .message { white-space:pre-wrap; word-break:break-word; }
    .empty,.error { padding:28px 16px; text-align:center; color:var(--muted); }
    .error { color:#d04444; }
    .footer { margin-top:12px; color:var(--muted); font-size:12px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    a { color:var(--accent); }
    @media (max-width:760px) { .item { grid-template-columns:1fr; gap:4px; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <h1>DSH App 日志</h1>
        <p class="sub">手机 App 通过扫码隧道同步的日志（Relay、流式会话、UI 事件）。请先让手机连接电脑。</p>
      </div>
      <div class="toolbar">
        <select id="level"><option value="">全部</option><option value="debug">debug+</option><option value="info" selected>info+</option><option value="warn">warn+</option><option value="error">error</option></select>
        <input id="search" type="search" placeholder="搜索消息或标签…" />
        <button id="pause" type="button">暂停</button>
        <button id="clear" class="primary" type="button">清空</button>
      </div>
    </div>
    <div class="panel"><div id="logs"></div><div class="empty" id="empty" hidden>暂无 App 日志。请先在手机上连接已配对电脑。</div><div class="error" id="load-error" hidden></div></div>
    <div class="footer"><span id="meta">每 2 秒自动刷新</span><span><a href="/">返回 DSH</a> · <a href="/dsh-scan-remote/logs">插件日志</a> · <a href="/dsh-scan-remote/api/app-logs" target="_blank" rel="noreferrer">JSON API</a></span></div>
  </div>
  <script>
    const logsEl = document.getElementById("logs");
    const emptyEl = document.getElementById("empty");
    const errorEl = document.getElementById("load-error");
    const metaEl = document.getElementById("meta");
    const levelEl = document.getElementById("level");
    const searchEl = document.getElementById("search");
    const pauseEl = document.getElementById("pause");
    const clearEl = document.getElementById("clear");
    let paused = false, lastId = "", entries = [];
    const order = { debug:0, info:1, warn:2, error:3 };
    function esc(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");}
    function render(){
      const q = searchEl.value.trim().toLowerCase();
      const min = levelEl.value ? order[levelEl.value] : -1;
      const visible = entries.filter((e)=>{ if (min>=0 && (order[e.level]??1)<min) return false; if (!q) return true; return [e.message,e.tag,e.level].join(" ").toLowerCase().includes(q); });
      if (!visible.length){ logsEl.innerHTML=""; emptyEl.hidden = entries.length !== 0; return; }
      emptyEl.hidden = true;
      logsEl.innerHTML = visible.map((e)=>[
        '<div class="item">',
        '<div class="muted">', esc(new Date(e.ts).toLocaleTimeString("zh-CN",{hour12:false})), '</div>',
        '<div class="level ', esc(e.level), '">', esc(e.level), '</div>',
        '<div class="muted">', esc(e.tag), '</div>',
        '<div class="message">', esc(e.message), '</div>',
        '</div>',
      ].join("")).join("");
      logsEl.scrollTop = logsEl.scrollHeight;
    }
    async function refresh(initial){
      errorEl.hidden = true;
      try {
        const params = new URLSearchParams();
        if (levelEl.value) params.set("level", levelEl.value);
        if (!initial && lastId) params.set("since", lastId);
        params.set("limit", initial ? "200" : "100");
        const res = await fetch("/dsh-scan-remote/api/app-logs?" + params.toString(), { cache:"no-store" });
        if (!res.ok) throw new Error("日志请求失败 (" + res.status + ")");
        const body = await res.json();
        const next = Array.isArray(body.entries) ? body.entries : [];
        if (initial) entries = next; else if (next.length) entries = entries.concat(next).slice(-500);
        if (entries.length) lastId = entries[entries.length - 1].id;
        metaEl.textContent = "共 " + entries.length + " 条 · 每 2 秒自动刷新";
        render();
      } catch (error) {
        errorEl.hidden = false;
        errorEl.textContent = error instanceof Error ? error.message : String(error);
      }
    }
    pauseEl.onclick = ()=>{ paused = !paused; pauseEl.textContent = paused ? "继续" : "暂停"; };
    clearEl.onclick = async ()=>{
      clearEl.disabled = true;
      try {
        const res = await fetch("/dsh-scan-remote/api/app-logs", { method:"DELETE" });
        if (!res.ok) throw new Error("清空失败");
        entries = []; lastId = ""; render(); await refresh(true);
      } catch (error) {
        errorEl.hidden = false;
        errorEl.textContent = error instanceof Error ? error.message : String(error);
      } finally { clearEl.disabled = false; }
    };
    levelEl.onchange = ()=>{ lastId = ""; void refresh(true); };
    searchEl.oninput = ()=>render();
    void refresh(true);
    setInterval(()=>{ if (!paused) void refresh(false); }, 2000);
  </script>
</body>
</html>`;
}
