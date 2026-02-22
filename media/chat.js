"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

  // src/webview/vscode-api.ts
  var api = acquireVsCodeApi();
  var vscode_api_default = api;

  // src/webview/commands.ts
  var cmd = {
    startAgent: /* @__PURE__ */ __name(() => vscode_api_default.postMessage({ command: "startAgent" }), "startAgent"),
    stopAgent: /* @__PURE__ */ __name(() => vscode_api_default.postMessage({ command: "stopAgent" }), "stopAgent"),
    runTask: /* @__PURE__ */ __name((prompt) => vscode_api_default.postMessage({ command: "runTask", prompt }), "runTask"),
    requestSettings: /* @__PURE__ */ __name(() => vscode_api_default.postMessage({ command: "requestSettings" }), "requestSettings"),
    saveSettings: /* @__PURE__ */ __name((settings) => vscode_api_default.postMessage({ command: "saveSettings", settings }), "saveSettings"),
    fetchModels: /* @__PURE__ */ __name((provider, baseUrl, apiKey) => vscode_api_default.postMessage({ command: "fetchModels", provider, baseUrl, apiKey }), "fetchModels")
  };

  // src/webview/ui-state.ts
  var el = {
    status: /* @__PURE__ */ __name(() => document.getElementById("status"), "status"),
    phase: /* @__PURE__ */ __name(() => document.getElementById("phase"), "phase"),
    output: /* @__PURE__ */ __name(() => document.getElementById("output"), "output"),
    prompt: /* @__PURE__ */ __name(() => document.getElementById("prompt"), "prompt"),
    startBtn: /* @__PURE__ */ __name(() => document.getElementById("startBtn"), "startBtn"),
    stopBtn: /* @__PURE__ */ __name(() => document.getElementById("stopBtn"), "stopBtn"),
    runBtn: /* @__PURE__ */ __name(() => document.getElementById("runBtn"), "runBtn"),
    tabLogs: /* @__PURE__ */ __name(() => document.getElementById("tabLogs"), "tabLogs"),
    tabSettings: /* @__PURE__ */ __name(() => document.getElementById("tabSettings"), "tabSettings"),
    logsPane: /* @__PURE__ */ __name(() => document.getElementById("logsPane"), "logsPane"),
    settingsPane: /* @__PURE__ */ __name(() => document.getElementById("settingsPane"), "settingsPane"),
    settingsNote: /* @__PURE__ */ __name(() => document.getElementById("settingsNote"), "settingsNote"),
    saveSettingsBtn: /* @__PURE__ */ __name(() => document.getElementById("saveSettingsBtn"), "saveSettingsBtn"),
    fetchModelsBtn: /* @__PURE__ */ __name(() => document.getElementById("fetchModelsBtn"), "fetchModelsBtn"),
    modelSuggestions: /* @__PURE__ */ __name(() => document.getElementById("modelSuggestions"), "modelSuggestions")
  };
  function setStatus(text) {
    const s = el.status();
    s.textContent = text;
    const lower = text.toLowerCase();
    s.dataset["state"] = lower.includes("error") ? "error" : lower.includes("idle") ? "idle" : "running";
  }
  __name(setStatus, "setStatus");
  function setPhaseText(text) {
    el.phase().textContent = text;
  }
  __name(setPhaseText, "setPhaseText");
  function setControlState(statusText) {
    const lower = statusText.toLowerCase();
    const running = lower.includes("running") || lower.includes("thinking") || lower.includes("tool ");
    const ready = lower.includes("ready");
    el.startBtn().disabled = running || ready;
    el.startBtn().textContent = ready ? "Ready" : "Start";
    el.stopBtn().disabled = !running && !ready;
    el.runBtn().disabled = running;
  }
  __name(setControlState, "setControlState");
  function setTab(tab) {
    const isLogs = tab === "logs";
    el.tabLogs().classList.toggle("active", isLogs);
    el.tabSettings().classList.toggle("active", !isLogs);
    el.logsPane().classList.toggle("hidden", !isLogs);
    el.settingsPane().classList.toggle("hidden", isLogs);
    el.saveSettingsBtn().classList.toggle("hidden", isLogs);
    el.settingsNote().classList.toggle("hidden", isLogs);
  }
  __name(setTab, "setTab");

  // src/webview/log.ts
  function classifyLine(line) {
    if (line.startsWith("[tool:start]")) return "tool-start";
    if (line.startsWith("[tool:done]")) return "tool-done";
    if (line.startsWith("[tool:error]")) return "tool-error";
    if (line.startsWith("[phase]")) return "phase";
    if (line.startsWith("[status]") || line.startsWith("[heartbeat]")) return "status";
    if (line.startsWith("[llm:")) return "llm";
    return "text";
  }
  __name(classifyLine, "classifyLine");
  function makeLine(text) {
    const div = document.createElement("div");
    div.className = "log-line";
    div.dataset["kind"] = classifyLine(text);
    div.textContent = text;
    return div;
  }
  __name(makeLine, "makeLine");
  function appendLine(text) {
    const out = el.output();
    const atBottom = out.scrollHeight - out.scrollTop - out.clientHeight < 40;
    out.appendChild(makeLine(text));
    if (atBottom) out.scrollTop = out.scrollHeight;
  }
  __name(appendLine, "appendLine");
  function replaceOutput(text) {
    const out = el.output();
    out.innerHTML = "";
    if (!text) return;
    for (const line of text.split("\n")) {
      out.appendChild(makeLine(line));
    }
    out.scrollTop = out.scrollHeight;
  }
  __name(replaceOutput, "replaceOutput");
  function appendOutput(text) {
    for (const line of text.split("\n")) {
      appendLine(line);
    }
  }
  __name(appendOutput, "appendOutput");
  function clearOutput() {
    el.output().innerHTML = "";
  }
  __name(clearOutput, "clearOutput");

  // src/webview/settings.ts
  var $ = /* @__PURE__ */ __name((id) => document.getElementById(id), "$");
  function strVal(id) {
    return ($(id)?.value ?? "").trim();
  }
  __name(strVal, "strVal");
  function boolVal(id) {
    return !!$(id)?.checked;
  }
  __name(boolVal, "boolVal");
  function setStr(id, val) {
    const el2 = $(id);
    if (el2) el2.value = val;
  }
  __name(setStr, "setStr");
  function setBool(id, val) {
    const el2 = $(id);
    if (el2) el2.checked = val;
  }
  __name(setBool, "setBool");
  function readForm() {
    const maxStepsRaw = Number.parseInt(strVal("maxSteps") || "100", 10);
    const maxSteps = Number.isFinite(maxStepsRaw) && maxStepsRaw > 0 ? maxStepsRaw : 100;
    return {
      provider: strVal("provider"),
      model: strVal("model"),
      apiKey: strVal("apiKey"),
      baseUrl: strVal("baseUrl"),
      maxSteps,
      responseStyle: strVal("responseStyle"),
      language: strVal("language"),
      telegramEnabled: boolVal("telegramEnabled"),
      telegramBotToken: strVal("telegramBotToken"),
      telegramChatId: strVal("telegramChatId"),
      telegramApiRoot: strVal("telegramApiRoot"),
      telegramForceIPv4: boolVal("telegramForceIPv4")
    };
  }
  __name(readForm, "readForm");
  function writeForm(s) {
    setStr("provider", s.provider ?? "");
    setStr("model", s.model ?? "");
    setStr("apiKey", s.apiKey ?? "");
    setStr("baseUrl", s.baseUrl ?? "");
    setStr("maxSteps", String(s.maxSteps ?? 100));
    setStr("responseStyle", s.responseStyle ?? "concise");
    setStr("language", s.language ?? "ru");
    setBool("telegramEnabled", s.telegramEnabled === true);
    setStr("telegramBotToken", s.telegramBotToken ?? "");
    setStr("telegramChatId", s.telegramChatId ?? "");
    setStr("telegramApiRoot", s.telegramApiRoot ?? "");
    setBool("telegramForceIPv4", s.telegramForceIPv4 !== false);
  }
  __name(writeForm, "writeForm");

  // src/webview/messages.ts
  function handleMessage(raw) {
    const msg = raw;
    switch (msg.type) {
      case "status":
        setStatus(msg.text);
        setControlState(msg.text);
        break;
      case "progress":
        setPhaseText(msg.text ?? "");
        el.phase().dataset.busy = msg.busy ? "1" : "0";
        break;
      case "replaceOutput":
        replaceOutput(msg.text);
        break;
      case "appendOutput":
        appendOutput(msg.text);
        break;
      case "clearOutput":
        clearOutput();
        break;
      case "notify":
        if (typeof msg.text === "string") {
          appendLine(`[settings] ${msg.text}`);
          el.settingsNote().textContent = msg.text;
        }
        break;
      case "settings":
        if (msg.settings) writeForm(msg.settings);
        break;
      case "activateTab":
        if (msg.tab === "settings") setTab("settings");
        break;
      case "modelList":
        if (Array.isArray(msg.models)) {
          window.dispatchEvent(new CustomEvent("models-loaded", { detail: msg.models }));
        }
        break;
      case "buildInfo":
        break;
    }
  }
  __name(handleMessage, "handleMessage");

  // src/webview/index.ts
  function saveState() {
    vscode_api_default.setState({
      output: el.output().textContent,
      prompt: el.prompt().value,
      status: el.status().textContent
    });
  }
  __name(saveState, "saveState");
  el.tabLogs().addEventListener("click", () => {
    setTab("logs");
    vscode_api_default.setState({ ...vscode_api_default.getState(), tab: "logs" });
  });
  el.tabSettings().addEventListener("click", () => {
    setTab("settings");
    vscode_api_default.setState({ ...vscode_api_default.getState(), tab: "settings" });
  });
  el.startBtn().addEventListener("click", () => cmd.startAgent());
  el.stopBtn().addEventListener("click", () => cmd.stopAgent());
  function runTask() {
    const prompt = el.prompt().value.trim();
    if (!prompt) return;
    cmd.runTask(prompt);
  }
  __name(runTask, "runTask");
  el.runBtn().addEventListener("click", runTask);
  el.prompt().addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runTask();
  });
  el.saveSettingsBtn().addEventListener("click", () => {
    cmd.saveSettings(readForm());
  });
  el.fetchModelsBtn().addEventListener("click", () => {
    const settings = readForm();
    cmd.fetchModels(settings.provider, settings.baseUrl, settings.apiKey);
    el.settingsNote().textContent = "Fetching models...";
  });
  window.addEventListener("models-loaded", (e) => {
    const models = e.detail;
    updateModelSuggestions(models);
    el.settingsNote().textContent = `Loaded ${models.length} models`;
  });
  function updateModelSuggestions(models) {
    const datalist = el.modelSuggestions();
    datalist.innerHTML = "";
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m;
      datalist.appendChild(opt);
    }
  }
  __name(updateModelSuggestions, "updateModelSuggestions");
  window.addEventListener("message", (e) => {
    handleMessage(e.data);
    saveState();
  });
  var saved = vscode_api_default.getState();
  if (saved) {
    if (saved.output) replaceOutput(saved.output);
    if (saved.prompt) el.prompt().value = saved.prompt;
    if (saved.status) {
      setStatus(saved.status);
      setControlState(saved.status);
    }
    if (saved.tab === "settings") setTab("settings");
  }
  setControlState(el.status().textContent ?? "");
  cmd.requestSettings();
})();
