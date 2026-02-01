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

const logFile = process.env.FLOW_LOG_PATH;
const log = (...args) => {
  const line = args.join(" ");
  // console logs may not always appear in CLI output, so also write to file if provided
  console.log(line);
  if (logFile) {
    try {
      fs.appendFileSync(logFile, `${line}\n`);
    } catch {
      // ignore log write errors
    }
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const scenariosMap = (() => {
  try {
    // eslint-disable-next-line global-require
    return require("../real/scenarios.js");
  } catch {
    return {};
  }
})();

const readFileSafe = (absolutePath) => {
  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch {
    return null;
  }
};

const assertFile = (workspaceRoot, rule) => {
  const absolutePath = path.join(workspaceRoot, rule.path);
  const content = readFileSafe(absolutePath);
  assert.ok(content !== null, `Expected file to exist: ${rule.path}`);
  if (rule.contains) {
    for (const needle of rule.contains) {
      assert.ok(
        content.includes(needle),
        `Expected ${rule.path} to contain "${needle}"`
      );
    }
  }
  if (rule.notContains) {
    for (const needle of rule.notContains) {
      assert.ok(
        !content.includes(needle),
        `Expected ${rule.path} to NOT contain "${needle}"`
      );
    }
  }
};

const assertToolCalls = (calls, expectedList) => {
  const names = calls.map((call) => call.name);
  const expected = expectedList.filter(Boolean);
  if (expected.length === 0) return;
  const matched = expected.some((name) => names.includes(name));
  assert.ok(
    matched,
    `Expected tool calls to include one of: ${expected.join(", ")}`
  );
};

let started = false;

async function run() {
  if (started) return;
  started = true;
  try {
  const flowPath =
    process.env.FLOW_PATH ||
    path.resolve(process.cwd(), "cases/golden/flows.json");

  assert.ok(fs.existsSync(flowPath), `flows.json not found at ${flowPath}`);

  const flows = JSON.parse(fs.readFileSync(flowPath, "utf8"));
  const scenarios = flattenScenarios(flows);
  assert.ok(scenarios.length > 0, "No scenarios found in flows.json");

  const includeTags = parseTags(process.env.FLOW_TAGS || "");
  const excludeTags = parseTags(process.env.FLOW_EXCLUDE || "");
  const realLlm = process.env.FLOW_REAL_LLM === "1";
  const workspaceRoot =
    (process.env.FLOW_WORKSPACE || "").trim() || process.cwd();
  const delayMsRaw = Number(process.env.FLOW_DELAY_MS || 0);
  const maxScenariosRaw = Number(process.env.FLOW_MAX_SCENARIOS || 0);
  const batchSizeRaw = Number(process.env.FLOW_BATCH_SIZE || 0);
  const batchDelayMsRaw = Number(process.env.FLOW_BATCH_DELAY_MS || 0);

  const delayMs = Number.isFinite(delayMsRaw) && delayMsRaw > 0 ? delayMsRaw : (realLlm ? 2500 : 0);
  const maxScenarios =
    Number.isFinite(maxScenariosRaw) && maxScenariosRaw > 0 ? maxScenariosRaw : 0;
  const batchSize =
    Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? batchSizeRaw : (realLlm ? 10 : 0);
  const batchDelayMs =
    Number.isFinite(batchDelayMsRaw) && batchDelayMsRaw > 0 ? batchDelayMsRaw : (realLlm ? 10000 : 0);

  log("Flow runner info:");
  log(`- flowPath: ${flowPath}`);
  log(`- workspaceRoot: ${workspaceRoot}`);
  log(`- total scenarios: ${scenarios.length}`);
  log(`- include tags: ${includeTags.join(", ") || "-"}`);
  log(`- exclude tags: ${excludeTags.join(", ") || "-"}`);
  log(`- realLlm: ${realLlm ? "1" : "0"}`);
  log(`- delayMs: ${delayMs || "-"}`);
  log(`- maxScenarios: ${maxScenarios || "-"}`);
  log(`- batchSize: ${batchSize || "-"}`);
  log(`- batchDelayMs: ${batchDelayMs || "-"}`);

  const filtered = scenarios.filter((scenario) => {
    const tags = scenario.tags || [];
    const include =
      includeTags.length === 0 || includeTags.some((tag) => tags.includes(tag));
    const exclude = excludeTags.some((tag) => tags.includes(tag));
    return include && !exclude;
  });

  const sliced = maxScenarios > 0 ? filtered.slice(0, maxScenarios) : filtered;

  assert.ok(sliced.length > 0, "No scenarios after tag filtering");

  log(`- filtered scenarios: ${filtered.length}`);
  log(`- selected scenarios: ${sliced.length}`);
  for (const scenario of sliced) {
    const tagList = (scenario.tags || []).join(" ");
    log(`  * ${scenario.id} [${tagList}]`);
  }

  log("Fetching VS Code commands...");
    const extension = vscode.extensions.getExtension("ais-code.ais-code");
    log(`Extension found: ${extension ? "yes" : "no"}`);
    if (extension && !extension.isActive) {
      log("Activating extension...");
      try {
        await extension.activate();
        log("Extension activated.");
      } catch (err) {
        log("Extension activation error:", err?.stack || String(err));
        throw err;
      }
    }

    const commands = await vscode.commands.getCommands(true);
    log(`Fetched commands: ${commands.length}`);
    if (!commands.includes("aisCode.openChat")) {
      log("Missing command: aisCode.openChat");
    }
    if (!commands.includes("aisCode.newConversation")) {
      log("Missing command: aisCode.newConversation");
    }
    assert.ok(
      commands.includes("aisCode.openChat"),
      "Expected command aisCode.openChat to be registered"
    );
    assert.ok(
      commands.includes("aisCode.newConversation"),
      "Expected command aisCode.newConversation to be registered"
    );

    log("Opening chat view...");
    await vscode.commands.executeCommand("aisCode.openChat");
    log("Chat view opened.");

    for (let i = 0; i < sliced.length; i += 1) {
      const scenario = sliced[i];
      const steps = scenario.resolvedSteps || scenario.steps || [];
      const hasWhen = steps.some((step) => step.keyword === "When");
      const hasThen = steps.some((step) => step.keyword === "Then");
      log(`Checking scenario ${scenario.id}: When=${hasWhen} Then=${hasThen}`);
      assert.ok(
        hasWhen && hasThen,
        `Scenario ${scenario.id} missing When/Then steps`
      );

      if (realLlm && (scenario.tags || []).includes("@real")) {
        const task = scenariosMap[scenario.id];
        assert.ok(task, `Missing real task mapping for ${scenario.id}`);

        log(`Running real scenario: ${scenario.id}`);
        const result = await vscode.commands.executeCommand(
          "aisCode.test.runMessage",
          {
            text: task.text,
            contextItems: task.contextItems || [],
            timeoutMs: task.timeoutMs || 120000
          }
        );

        const toolCalls = result?.toolCalls || [];
        const toolResults = result?.toolResults || [];
        const responseText = result?.responseText || "";

        log(`- toolCalls: ${toolCalls.map((c) => c.name).join(", ") || "-"}`);
        log(`- toolResults: ${toolResults.length}`);

        if (task.expect?.toolCallsInclude) {
          assertToolCalls(toolCalls, task.expect.toolCallsInclude);
        }
        if (task.expect?.files) {
          for (const rule of task.expect.files) {
            assertFile(workspaceRoot, rule);
          }
        }
        if (task.expect?.responseContains) {
          for (const needle of task.expect.responseContains) {
            assert.ok(
              responseText.toLowerCase().includes(needle.toLowerCase()),
              `Expected response to contain "${needle}"`
            );
          }
        }
        if (task.expect?.responseContainsAny) {
          const needles = task.expect.responseContainsAny;
          const matched = needles.some((needle) =>
            responseText.toLowerCase().includes(needle.toLowerCase())
          );
          assert.ok(
            matched,
            `Expected response to contain one of: ${needles.join(", ")}`
          );
        }
      }

      if (delayMs > 0) {
        await sleep(delayMs);
      }
      if (batchSize > 0 && batchDelayMs > 0 && (i + 1) % batchSize === 0) {
        log(`Batch pause: ${batchDelayMs}ms after ${i + 1} scenarios`);
        await sleep(batchDelayMs);
      }
    }
  } catch (err) {
    log("Flow runner error:", err?.stack || String(err));
    throw err;
  }
}

module.exports = { run };

if (require.main === module) {
  run()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
