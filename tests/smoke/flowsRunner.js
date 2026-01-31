const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

const normalizeTag = (tag) => {
  if (!tag) return "";
  return tag.startsWith("@") ? tag : `@${tag}`;
};

const parseTags = (value) => {
  if (!value) return [];
  return value
    .split(",")
    .map((tag) => normalizeTag(tag.trim()))
    .filter(Boolean);
};

const flattenScenarios = (flows) =>
  flows.features.flatMap((feature) =>
    (feature.scenarios || []).map((scenario) => ({
      ...scenario,
      feature: feature.name,
      file: feature.file
    }))
  );

async function run() {
  const flowPath =
    process.env.FLOW_PATH ||
    path.resolve(process.cwd(), "cases/golden/flows.json");

  assert.ok(fs.existsSync(flowPath), `flows.json not found at ${flowPath}`);

  const flows = JSON.parse(fs.readFileSync(flowPath, "utf8"));
  const scenarios = flattenScenarios(flows);
  assert.ok(scenarios.length > 0, "No scenarios found in flows.json");

  const includeTags = parseTags(process.env.FLOW_TAGS || "");
  const excludeTags = parseTags(process.env.FLOW_EXCLUDE || "");

  const filtered = scenarios.filter((scenario) => {
    const tags = scenario.tags || [];
    const include =
      includeTags.length === 0 || includeTags.some((tag) => tags.includes(tag));
    const exclude = excludeTags.some((tag) => tags.includes(tag));
    return include && !exclude;
  });

  assert.ok(filtered.length > 0, "No scenarios after tag filtering");

  const commands = await vscode.commands.getCommands(true);
  assert.ok(
    commands.includes("aisCode.openChat"),
    "Expected command aisCode.openChat to be registered"
  );
  assert.ok(
    commands.includes("aisCode.newConversation"),
    "Expected command aisCode.newConversation to be registered"
  );

  await vscode.commands.executeCommand("aisCode.openChat");

  for (const scenario of filtered) {
    const steps = scenario.resolvedSteps || scenario.steps || [];
    const hasWhen = steps.some((step) => step.keyword === "When");
    const hasThen = steps.some((step) => step.keyword === "Then");
    assert.ok(
      hasWhen && hasThen,
      `Scenario ${scenario.id} missing When/Then steps`
    );
  }
}

module.exports = { run };
