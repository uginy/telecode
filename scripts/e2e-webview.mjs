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
    const maxWait = Math.min(timeoutMs, 30000);
  while (Date.now() - start < maxWait) {
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
  const quickInput = page
    .locator('input[aria-label="Type the name of a command to run."]')
    .first();
  try {
    await quickInput.waitFor({ state: "visible", timeout: 1500 });
    return quickInput;
  } catch {
    await page.keyboard.press("F1");
    await quickInput.waitFor({ state: "visible", timeout: 1500 });
    return quickInput;
  }
};

const openAisCodeView = async (page) => {
  const candidates = [
    page.getByRole("tab", { name: /AIS Code/i }),
    page.locator('[aria-label*="AIS Code"]'),
    page.locator('[title*="AIS Code"]')
  ];
  for (const locator of candidates) {
    if (await locator.count()) {
      await locator.first().click();
      return true;
    }
  }
  return false;
};

const logActivityBarLabels = async (page) => {
  try {
    const labels = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll("[aria-label]"));
      return elements
        .map((el) => el.getAttribute("aria-label"))
        .filter((label) => label && /ais/i.test(label));
    });
    if (labels.length) {
      console.log("Activity labels:", labels.slice(0, 10));
    }
  } catch {
    // ignore
  }
};

const runCommand = async (page, command) => {
  const input = await openCommandPalette(page);
  await input.click();
  await input.fill(command);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000);
};

const resolveChatFrame = async (target, maxWaitMs) => {
  const page = "frames" in target ? target : target.page();
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const frames = page.frames();
    for (const frame of frames) {
      try {
        const count = await frame.locator('[data-testid="chat-input"]').count();
        if (count > 0) {
          return frame;
        }
      } catch {
        // ignore
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
};

const runScenario = async (target, text) => {
  await target.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
  const chatFrame = await resolveChatFrame(target, Math.min(timeoutMs, 45000));
  if (!chatFrame) {
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
    throw new Error("Chat input not found in any webview frame.");
  }
  const input = chatFrame.locator('[data-testid="chat-input"]');
  await input.waitFor({ state: "visible", timeout: timeoutMs });
  await input.fill(text);
  await chatFrame.locator('[data-testid="chat-send"]').click();
  await chatFrame
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

    try {
      let webviewTarget;
      try {
        await logActivityBarLabels(page);
        await openAisCodeView(page);
        webviewTarget = await waitForWebviewFrame(page);
      } catch {
        await runCommand(page, "AIS Code: Open Chat");
        await runCommand(page, "AIS Code: New Conversation");
        try {
          webviewTarget = await waitForWebviewFrame(page);
        } catch {
          webviewTarget = await waitForWebviewPage(browser);
        }
      }
    await runScenario(webviewTarget, "Привет! О чем этот проект?");
    console.log("E2E PASS: webview chat scenario completed.");
    } catch (error) {
      const logsDir = path.resolve(extensionDevelopmentPath, ".vscode-test", "logs");
      fs.mkdirSync(logsDir, { recursive: true });
      const screenshotPath = path.join(logsDir, "e2e-webview-failure.png");
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.error(`Saved failure screenshot to ${screenshotPath}`);
      } catch (screenshotError) {
        console.error("Failed to capture screenshot:", screenshotError);
      }
      throw error;
    }

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

await run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
