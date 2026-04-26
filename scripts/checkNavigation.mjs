import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appUrl = process.env.NAV_CHECK_URL || "http://localhost:3000/";
const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.NAV_CHECK_DEBUG_PORT || await getFreePort());
const userDataDir = await mkdtemp(join(tmpdir(), "multi-millionaire-nav-"));

let chrome;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }
        reject(new Error("Unable to allocate a local debug port."));
      });
    });
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Chrome DevTools request failed with ${response.status}`);
  }
  return response.json();
}

async function waitForDevtools() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      await fetchJson(`http://127.0.0.1:${port}/json/version`);
      return;
    } catch {
      await delay(150);
    }
  }
  throw new Error("Timed out waiting for isolated Chrome DevTools.");
}

async function createTarget() {
  const endpoint = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(appUrl)}`;
  try {
    return await fetchJson(endpoint, { method: "PUT" });
  } catch {
    return fetchJson(endpoint);
  }
}

function connectToPage(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    const request = pending.get(payload.id);
    if (!request) return;
    pending.delete(payload.id);
    if (payload.error) {
      request.reject(new Error(payload.error.message || "Chrome DevTools command failed."));
    } else {
      request.resolve(payload.result);
    }
  });

  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("Unable to open Chrome DevTools websocket.")), { once: true });
  });

  return {
    async send(method, params = {}) {
      await opened;
      const commandId = ++id;
      ws.send(JSON.stringify({ id: commandId, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(commandId, { resolve, reject });
      });
    },
    close() {
      ws.close();
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed.");
  }
  return result.result.value;
}

async function waitFor(client, expression, label) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function clickTabAndAssert(client, label, marker) {
  const clicked = await evaluate(client, `
    (() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const button = buttons.find((item) => item.textContent?.trim() === ${JSON.stringify(label)});
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error(`Unable to find bottom nav tab: ${label}`);

  await waitFor(client, `document.body.innerText.includes(${JSON.stringify(marker)})`, `${label} content`);
  await waitFor(client, `
    (() => {
      const active = document.querySelector('button[aria-current="page"]');
      return active?.textContent?.trim() === ${JSON.stringify(label)};
    })()
  `, `${label} active state`);
}

try {
  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
    "--window-size=390,844",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  chrome.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`Isolated Chrome exited with code ${code}.`);
    }
  });

  await waitForDevtools();
  const target = await createTarget();
  const client = connectToPage(target.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  await waitFor(client, "document.readyState === 'complete'", "page load");
  await waitFor(client, "document.body.innerText.includes('Multi Millionaire')", "app shell");

  const checks = [
    ["锁仓", "TON 钱包访问"],
    ["战队", "战队排行榜"],
    ["奖励", "奖励账本"],
    ["分享", "分享信号"],
  ];

  for (const [label, marker] of checks) {
    await clickTabAndAssert(client, label, marker);
  }

  client.close();
  console.log(`Navigation smoke passed for ${appUrl}`);
} finally {
  if (chrome && !chrome.killed) {
    chrome.kill("SIGTERM");
    await new Promise((resolve) => chrome.once("exit", resolve));
  }
  await rm(userDataDir, { recursive: true, force: true });
}
