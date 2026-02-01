import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";

const parseArg = (name) => {
  const arg = process.argv.find((entry) => entry.startsWith(`${name}=`));
  return arg ? arg.split("=")[1] : "";
};

const workspaceRoot = process.cwd();
const resultsRoot = path.resolve(workspaceRoot, "tests/results/aaa");
const explicitPath = parseArg("--path");

const findLatestDir = () => {
  if (!fs.existsSync(resultsRoot)) return null;
  const models = fs.readdirSync(resultsRoot).filter((name) =>
    fs.statSync(path.join(resultsRoot, name)).isDirectory()
  );
  if (models.length === 0) return null;
  let latest = null;
  for (const model of models) {
    const modelDir = path.join(resultsRoot, model);
    const runs = fs.readdirSync(modelDir).filter((name) =>
      fs.statSync(path.join(modelDir, name)).isDirectory()
    );
    for (const run of runs) {
      const full = path.join(modelDir, run);
      if (!latest || full > latest) latest = full;
    }
  }
  return latest;
};

const targetDir = explicitPath ? path.resolve(explicitPath) : findLatestDir();
if (!targetDir) {
  console.error("No AAA results found. Run the @aaa flow first.");
  process.exit(1);
}

const indexPath = path.join(targetDir, "index.html");
if (!fs.existsSync(indexPath)) {
  console.error(`Missing index.html at ${indexPath}`);
  process.exit(1);
}

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const fileUrl = `file://${indexPath}`;
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(fileUrl, { waitUntil: "load" });

  const selectors = [
    "#hero",
    "#features",
    "#pricing",
    "#faq",
    "#footer"
  ];

  for (const selector of selectors) {
    const count = await page.locator(selector).count();
    if (count === 0) {
      throw new Error(`Missing selector ${selector} in rendered page`);
    }
  }

  if (consoleErrors.length > 0) {
    throw new Error(`Console errors detected: ${consoleErrors.join(" | ")}`);
  }

  await browser.close();
  console.log(`AAA landing rendered OK: ${fileUrl}`);
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
