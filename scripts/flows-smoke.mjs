import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

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
const flowsPath = parseArg("--flows") || path.resolve(workspacePath, "cases/golden/flows.json");

try {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    extensionTestsEnv: {
      FLOW_PATH: flowsPath,
      FLOW_TAGS: tags,
      FLOW_EXCLUDE: exclude
    },
    launchArgs: [workspacePath, "--disable-extensions"]
  });
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("Flows smoke failed:", err);
  process.exit(1);
}
