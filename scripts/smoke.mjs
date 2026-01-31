import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(__dirname, "..");
const extensionTestsPath = path.resolve(__dirname, "../tests/smoke/index.js");
const workspacePath = path.resolve(__dirname, "..");

try {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [workspacePath, "--disable-extensions"]
  });
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("Smoke test failed:", err);
  process.exit(1);
}
