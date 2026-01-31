import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runTests, downloadAndUnzipVSCode } from "@vscode/test-electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(__dirname, "..");
const extensionTestsPath = path.resolve(__dirname, "../tests/smoke/index.js");
const workspacePath = path.resolve(__dirname, "..");
const workspaceOverrideArg = process.argv.find((entry) =>
  entry.startsWith("--workspace=")
);
const workspaceOverride = workspaceOverrideArg
  ? workspaceOverrideArg.split("=")[1]
  : "";
const resolvedWorkspace = path.resolve(
  workspaceOverride || workspacePath
);

const resolveVSCodeExecutable = () => {
  if (process.env.VSCODE_EXECUTABLE_PATH) {
    return { path: process.env.VSCODE_EXECUTABLE_PATH, kind: "electron" };
  }
  return undefined;
};

const executable = resolveVSCodeExecutable();

const args = [resolvedWorkspace];

const logsDir = path.resolve(extensionDevelopmentPath, ".vscode-test", "logs");
fs.mkdirSync(logsDir, { recursive: true });
const logPath = path.join(logsDir, "smoke.log");
const logStream = fs.createWriteStream(logPath, { flags: "a" });
const header = [
  "",
  "=== Smoke run ===",
  `timestamp: ${new Date().toISOString()}`,
  `cli: ${executable?.path || "downloaded"}`,
  `workspace: ${resolvedWorkspace}`,
  `extensionDevelopmentPath: ${extensionDevelopmentPath}`,
  `extensionTestsPath: ${extensionTestsPath}`,
  `args: ${args.join(" ")}`
].join("\n");
logStream.write(`${header}\n`);

const run = async () => {
  const vscodeExecutablePath = executable?.path || (await downloadAndUnzipVSCode("stable"));

  const prevElectron = process.env.ELECTRON_RUN_AS_NODE;
  delete process.env.ELECTRON_RUN_AS_NODE;
  try {
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: args
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Smoke test failed:", err);
    process.exit(1);
  } finally {
    if (prevElectron !== undefined) {
      process.env.ELECTRON_RUN_AS_NODE = prevElectron;
    } else {
      delete process.env.ELECTRON_RUN_AS_NODE;
    }
    logStream.end();
  }
};

await run();
