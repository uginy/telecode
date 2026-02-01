import fs from "node:fs";
import path from "node:path";

const parseBool = (value) => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
};

const parseNumber = (value) => {
  if (value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

export const writeTestProfile = (options) => {
  const userDataDir = options.userDataDir;
  if (!userDataDir) return null;

  const settings = {};
  const provider = options.provider || process.env.AIS_CODE_TEST_PROVIDER;
  if (provider) settings["aisCode.provider"] = provider;

  const openrouterKey =
    options.openrouterKey || process.env.AIS_CODE_TEST_OPENROUTER_API_KEY;
  if (openrouterKey) settings["aisCode.openrouter.apiKey"] = openrouterKey;

  const openrouterModel =
    options.openrouterModel || process.env.AIS_CODE_TEST_OPENROUTER_MODEL;
  if (openrouterModel) settings["aisCode.openrouter.model"] = openrouterModel;

  const autoApprove = parseBool(
    options.autoApprove ?? process.env.AIS_CODE_TEST_AUTO_APPROVE
  );
  if (autoApprove !== undefined) settings["aisCode.autoApprove"] = autoApprove;

  const diffOnly = parseBool(
    options.diffOnly ?? process.env.AIS_CODE_TEST_DIFF_ONLY
  );
  if (diffOnly !== undefined) settings["aisCode.diffOnly"] = diffOnly;

  const maxTokens = parseNumber(
    options.maxTokens ?? process.env.AIS_CODE_TEST_MAX_TOKENS
  );
  if (maxTokens !== undefined) settings["aisCode.maxTokens"] = maxTokens;

  const temperature = parseNumber(
    options.temperature ?? process.env.AIS_CODE_TEST_TEMPERATURE
  );
  if (temperature !== undefined) settings["aisCode.temperature"] = temperature;

  const workspaceIndex = parseBool(
    options.workspaceIndex ?? process.env.AIS_CODE_TEST_WORKSPACE_INDEX
  );
  if (workspaceIndex !== undefined)
    settings["aisCode.workspaceIndex"] = workspaceIndex;

  const intentRouting = parseBool(
    options.intentRouting ?? process.env.AIS_CODE_TEST_INTENT_ROUTING
  );
  if (intentRouting !== undefined)
    settings["aisCode.intentRouting.enabled"] = intentRouting;

  if (Object.keys(settings).length === 0) return null;

  const settingsPath = path.join(userDataDir, "User", "settings.json");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return settingsPath;
};
