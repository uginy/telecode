import fs from "node:fs/promises";
import path from "node:path";

const casesDir = path.resolve(process.cwd(), "cases");
const outDir = path.join(casesDir, "golden");
const outFile = path.join(outDir, "flows.json");

const STEP_REGEX = /^(Given|When|Then|And|But)\s+(.*)$/;

const parseTableRow = (line) =>
  line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());

const parseFeature = (text, file) => {
  const lines = text.split(/\r?\n/);
  let featureName = "";
  let backgroundSteps = [];
  let scenarios = [];
  let tagsBuffer = [];
  let currentScenario = null;
  let currentStep = null;
  let mode = "none";

  const finalizeScenario = () => {
    if (!currentScenario) return;
    const baseName = path.basename(file);
    const index = scenarios.length + 1;
    const idTag = (currentScenario.tags || []).find((tag) =>
      tag.startsWith("@id:")
    );
    const scenarioId = idTag
      ? idTag.replace("@id:", "")
      : `${baseName}#${index}`;

    currentScenario.id = scenarioId;
    currentScenario.resolvedSteps = [...backgroundSteps, ...currentScenario.steps];
    scenarios.push(currentScenario);
    currentScenario = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("@")) {
      tagsBuffer = trimmed.split(/\s+/).filter(Boolean);
      continue;
    }

    if (trimmed.startsWith("Feature:")) {
      featureName = trimmed.slice("Feature:".length).trim();
      continue;
    }

    if (trimmed.startsWith("Background:")) {
      finalizeScenario();
      mode = "background";
      currentStep = null;
      continue;
    }

    if (trimmed.startsWith("Scenario")) {
      finalizeScenario();
      const scenarioName = trimmed.split(":")[1]?.trim() || "Unnamed";
      currentScenario = { name: scenarioName, tags: tagsBuffer, steps: [] };
      tagsBuffer = [];
      mode = "scenario";
      currentStep = null;
      continue;
    }

    const stepMatch = trimmed.match(STEP_REGEX);
    if (stepMatch) {
      const [, keyword, textValue] = stepMatch;
      const step = { keyword, text: textValue, table: [] };
      if (mode === "background") {
        backgroundSteps.push(step);
      } else if (currentScenario) {
        currentScenario.steps.push(step);
      }
      currentStep = step;
      continue;
    }

    if (trimmed.startsWith("|") && currentStep) {
      const row = parseTableRow(trimmed);
      currentStep.table.push(row);
      continue;
    }
  }

  finalizeScenario();

  return {
    name: featureName || path.basename(file),
    file: path.relative(process.cwd(), file),
    background: backgroundSteps,
    scenarios
  };
};

const main = async () => {
  const entries = await fs.readdir(casesDir);
  const featureFiles = entries
    .filter((f) => f.endsWith(".feature"))
    .map((f) => path.join(casesDir, f));

  const features = [];
  for (const file of featureFiles) {
    const content = await fs.readFile(file, "utf8");
    features.push(parseFeature(content, file));
  }

  await fs.mkdir(outDir, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    features
  };

  await fs.writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");
  // eslint-disable-next-line no-console
  console.log(`Generated ${outFile}`);
};

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
