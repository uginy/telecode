import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runTests, downloadAndUnzipVSCode } from "@vscode/test-electron";
import { writeTestProfile } from "./test-profile.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(__dirname, "..");
const extensionTestsPath = path.resolve(
  __dirname,
  "../tests/smoke/flowsRunner.js"
);
const workspacePath = path.resolve(__dirname, "..");

const parseArg = (name) => {
  const arg = process.argv.find((entry) => entry.startsWith(`${name}=`));
  return arg ? arg.split("=")[1] : "";
};

const tags = parseArg("--tags");
const exclude = parseArg("--exclude");
const flowsPath =
  parseArg("--flows") || path.resolve(workspacePath, "cases/golden/flows.json");
const workspaceOverride = parseArg("--workspace");
const delayMs = parseArg("--delay");
const maxScenarios = parseArg("--max");
const batchSize = parseArg("--batch");
const batchDelayMs = parseArg("--batch-delay");
const realLlm = process.argv.includes("--real-llm");

const resolveVSCodeExecutable = () => {
  if (process.env.VSCODE_EXECUTABLE_PATH) {
    return { path: process.env.VSCODE_EXECUTABLE_PATH, kind: "electron" };
  }
  return undefined;
};

const executable = resolveVSCodeExecutable();

const resolvedWorkspace = path.resolve(
  workspaceOverride || workspacePath
);
const args = [resolvedWorkspace];

const logsDir = path.resolve(extensionDevelopmentPath, ".vscode-test", "logs");
fs.mkdirSync(logsDir, { recursive: true });
const logPath = path.join(logsDir, "flows-smoke.log");
const logStream = fs.createWriteStream(logPath, { flags: "a" });
const header = [
  "",
  "=== Flows smoke run ===",
  `timestamp: ${new Date().toISOString()}`,
  `cli: ${executable?.path || "downloaded"}`,
  `workspace: ${resolvedWorkspace}`,
  `extensionDevelopmentPath: ${extensionDevelopmentPath}`,
  `extensionTestsPath: ${extensionTestsPath}`,
  `flowsPath: ${flowsPath}`,
  `tags: ${tags || "-"}`,
  `exclude: ${exclude || "-"}`,
  `realLlm: ${realLlm ? "1" : "0"}`,
  `delayMs: ${delayMs || "-"}`,
  `maxScenarios: ${maxScenarios || "-"}`,
  `batchSize: ${batchSize || "-"}`,
  `batchDelayMs: ${batchDelayMs || "-"}`,
  `args: ${args.join(" ")}`
].join("\n");
logStream.write(`${header}\n`);

const run = async () => {
  const vscodeExecutablePath = executable?.path || (await downloadAndUnzipVSCode("stable"));
  const userDataDir = path.resolve(extensionDevelopmentPath, ".vscode-test", "user-data");
  const settingsPath = writeTestProfile({
    userDataDir,
    provider: process.env.AIS_CODE_TEST_PROVIDER,
    openrouterKey: process.env.AIS_CODE_TEST_OPENROUTER_API_KEY,
    openrouterModel: process.env.AIS_CODE_TEST_OPENROUTER_MODEL
  });
  if (settingsPath) {
    logStream.write(`Test profile settings: ${settingsPath}\n`);
  }

  const prevElectron = process.env.ELECTRON_RUN_AS_NODE;
  delete process.env.ELECTRON_RUN_AS_NODE;
  try {
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      userDataDir,
      extensionTestsEnv: {
        FLOW_PATH: flowsPath,
        FLOW_TAGS: tags,
        FLOW_EXCLUDE: exclude,
        FLOW_LOG_PATH: logPath,
        FLOW_WORKSPACE: resolvedWorkspace,
        FLOW_DELAY_MS: delayMs,
        FLOW_MAX_SCENARIOS: maxScenarios,
        FLOW_BATCH_SIZE: batchSize,
        FLOW_BATCH_DELAY_MS: batchDelayMs,
        FLOW_REAL_LLM: realLlm ? "1" : "",
        AIS_CODE_TEST_MODE: "1"
      },
      launchArgs: args
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Flows smoke failed:", err);
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
