import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";
import { chromium } from "playwright";
import { writeTestProfile } from "./test-profile.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(__dirname, "..");

const parseArg = (name) => {
  const arg = process.argv.find((entry) => entry.startsWith(`${name}=`));
  return arg ? arg.split("=")[1] : "";
};

const workspaceOverride = parseArg("--workspace");
const workspacePath = path.resolve(
  workspaceOverride || path.resolve(__dirname, "..", "tests/fixtures/real-project")
);

const requestedPort = parseArg("--port");
const defaultPort = 9222;
const remoteDebugPort = requestedPort ? Number(requestedPort) : defaultPort;
const timeoutMs = Number(parseArg("--timeout")) || 120000;

const waitForPort = (port, timeout) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const socket = net.createConnection(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.end();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error(`Timed out waiting for port ${port}`));
          return;
        }
        setTimeout(check, 250);
      });
    };
    check();
  });

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });

const waitForWebviewFrame = async (page) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const frames = page.frames();
    const webview = frames.find((frame) =>
      frame.url().includes("extensionId=ais-code.ais-code")
    );
    if (webview) {
      return webview;
    }
    if ((Date.now() - start) % 5000 < 250) {
      const urls = frames.map((f) => f.url()).filter(Boolean);
      console.log("Waiting for webview frame. Frames:", urls);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Timed out waiting for AIS Code webview");
};

const waitForWebviewPage = async (browser) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const context of browser.contexts()) {
      for (const candidate of context.pages()) {
        const url = candidate.url();
        if (url.includes("vscode-webview") && url.includes("ais-code")) {
          return candidate;
        }
      }
    }
    if ((Date.now() - start) % 5000 < 250) {
      const urls = browser
        .contexts()
        .flatMap((context) => context.pages())
        .map((page) => page.url())
        .filter(Boolean);
      console.log("Waiting for webview page. Pages:", urls);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Timed out waiting for AIS Code webview page");
};

const openCommandPalette = async (page) => {
  const isMac = process.platform === "darwin";
  await page.keyboard.press(isMac ? "Meta+Shift+P" : "Control+Shift+P");
};

const openAisCodeView = async (page) => {
  const tab = page.locator('[aria-label="AIS Code"]');
  if (await tab.count()) {
    await tab.first().click();
    return true;
  }
  return false;
};

const runScenario = async (target, text) => {
  await target.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
  const input = target.locator('[data-testid="chat-input"]');
  try {
    await input.waitFor({ state: "visible", timeout: timeoutMs });
  } catch (error) {
    const snapshot = await target.evaluate(() => ({
      readyState: document.readyState,
      bodyText: document.body?.innerText?.slice(0, 500) || "",
      bodyHtml: document.body?.innerHTML?.slice(0, 800) || "",
      iframeCount: document.querySelectorAll("iframe").length,
      iframeSources: Array.from(document.querySelectorAll("iframe"))
        .map((iframe) => iframe.getAttribute("src"))
        .filter(Boolean)
        .slice(0, 5),
    }));
    console.error("Webview not ready:", snapshot);
    throw error;
  }
  await input.fill(text);
  await target.locator('[data-testid="chat-send"]').click();
  await target
    .locator('[data-testid="message-item"][data-role="assistant"]')
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs });
};

const run = async () => {
  const vscodeExecutablePath =
    process.env.VSCODE_EXECUTABLE_PATH || (await downloadAndUnzipVSCode("stable"));

  const userDataDir = path.resolve(
    extensionDevelopmentPath,
    ".vscode-test",
    "user-data-e2e"
  );

  writeTestProfile({
    userDataDir,
    provider: process.env.AIS_CODE_TEST_PROVIDER,
    openrouterKey: process.env.AIS_CODE_TEST_OPENROUTER_API_KEY,
    openrouterModel: process.env.AIS_CODE_TEST_OPENROUTER_MODEL,
  });

  let debugPort = remoteDebugPort;
  if (!requestedPort) {
    debugPort = await getFreePort();
  }

  const args = [
    workspacePath,
    `--extensionDevelopmentPath=${extensionDevelopmentPath}`,
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${debugPort}`,
    "--new-window",
  ];

  fs.mkdirSync(path.join(userDataDir, "logs"), { recursive: true });

  const prevElectron = process.env.ELECTRON_RUN_AS_NODE;
  const childEnv = { ...process.env, AIS_CODE_TEST_MODE: "1" };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const child = spawn(vscodeExecutablePath, args, {
    stdio: "pipe",
    env: childEnv,
  });

  child.stdout.on("data", (data) => process.stdout.write(data));
  child.stderr.on("data", (data) => process.stderr.write(data));

  try {
    await waitForPort(debugPort, 20000);
    const browser = await chromium.connectOverCDP(
      `http://127.0.0.1:${debugPort}`
    );
    const context = browser.contexts()[0];
    const start = Date.now();
    let page = context.pages()[0];
    while (!page && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 250));
      page = context.pages()[0];
    }
    if (!page) {
      throw new Error("No VS Code window page found via CDP.");
    }

    await page.bringToFront();
    await page.waitForTimeout(500);
    await page.mouse.click(10, 10);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);

    let webviewTarget;
    try {
      await openAisCodeView(page);
      webviewTarget = await waitForWebviewPage(browser);
    } catch {
      await openCommandPalette(page);
      const commandInput = page
        .locator('input[aria-label="Type the name of a command to run."]')
        .first();
      try {
        await commandInput.waitFor({ state: "visible", timeout: 5000 });
        await commandInput.fill("AIS Code: Open Chat");
      } catch {
        await page.keyboard.type("AIS Code: Open Chat", { delay: 20 });
      }
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1000);
      try {
        webviewTarget = await waitForWebviewPage(browser);
      } catch {
        const frame = await waitForWebviewFrame(page);
        webviewTarget = frame;
      }
    }
    await runScenario(webviewTarget, "Привет! О чем этот проект?");

    await browser.close();
  } finally {
    child.kill();
    if (prevElectron !== undefined) {
      process.env.ELECTRON_RUN_AS_NODE = prevElectron;
    } else {
      delete process.env.ELECTRON_RUN_AS_NODE;
    }
  }
};

await run();
