"use strict";
(() => {
  // src/webview/vscode-api.ts
  var api = acquireVsCodeApi();
  var vscode_api_default = api;

  // src/webview/commands.ts
  var cmd = {
    startAgent: () => vscode_api_default.postMessage({ command: "startAgent" }),
    stopAgent: () => vscode_api_default.postMessage({ command: "stopAgent" }),
    runTask: (prompt) => vscode_api_default.postMessage({ command: "runTask", prompt }),
    requestSettings: () => vscode_api_default.postMessage({ command: "requestSettings" }),
    saveSettings: (settings) => vscode_api_default.postMessage({ command: "saveSettings", settings })
  };

  // src/webview/ui-state.ts
  var el = {
    status: () => document.getElementById("status"),
    phase: () => document.getElementById("phase"),
    output: () => document.getElementById("output"),
    prompt: () => document.getElementById("prompt"),
    startBtn: () => document.getElementById("startBtn"),
    stopBtn: () => document.getElementById("stopBtn"),
    runBtn: () => document.getElementById("runBtn"),
    tabLogs: () => document.getElementById("tabLogs"),
    tabSettings: () => document.getElementById("tabSettings"),
    logsPane: () => document.getElementById("logsPane"),
    settingsPane: () => document.getElementById("settingsPane"),
    settingsNote: () => document.getElementById("settingsNote")
  };
  function setStatus(text) {
    const s = el.status();
    s.textContent = text;
    const lower = text.toLowerCase();
    s.dataset["state"] = lower.includes("error") ? "error" : lower.includes("idle") ? "idle" : "running";
  }
  function setPhaseText(text) {
    el.phase().textContent = text;
  }
  function setControlState(statusText) {
    const lower = statusText.toLowerCase();
    const running = lower.includes("running") || lower.includes("thinking") || lower.includes("tool ");
    const ready = lower.includes("ready");
    el.startBtn().disabled = running || ready;
    el.startBtn().textContent = ready ? "Ready" : "Start";
    el.stopBtn().disabled = !running && !ready;
    el.runBtn().disabled = running;
  }
  function setTab(tab) {
    const isLogs = tab === "logs";
    el.tabLogs().classList.toggle("active", isLogs);
    el.tabSettings().classList.toggle("active", !isLogs);
    el.logsPane().classList.toggle("hidden", !isLogs);
    el.settingsPane().classList.toggle("hidden", isLogs);
  }

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
  function makeLine(text) {
    const div = document.createElement("div");
    div.className = "log-line";
    div.dataset["kind"] = classifyLine(text);
    div.textContent = text;
    return div;
  }
  function appendLine(text) {
    const out = el.output();
    const atBottom = out.scrollHeight - out.scrollTop - out.clientHeight < 40;
    out.appendChild(makeLine(text));
    if (atBottom) out.scrollTop = out.scrollHeight;
  }
  function replaceOutput(text) {
    const out = el.output();
    out.innerHTML = "";
    if (!text) return;
    for (const line of text.split("\n")) {
      out.appendChild(makeLine(line));
    }
    out.scrollTop = out.scrollHeight;
  }
  function appendOutput(text) {
    for (const line of text.split("\n")) {
      appendLine(line);
    }
  }
  function clearOutput() {
    el.output().innerHTML = "";
  }

  // src/webview/settings.ts
  var $ = (id) => document.getElementById(id);
  function strVal(id) {
    return ($(id)?.value ?? "").trim();
  }
  function boolVal(id) {
    return !!$(id)?.checked;
  }
  function setStr(id, val) {
    const el2 = $(id);
    if (el2) el2.value = val;
  }
  function setBool(id, val) {
    const el2 = $(id);
    if (el2) el2.checked = val;
  }
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
        el.phase().dataset["busy"] = msg.busy ? "1" : "0";
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
      case "buildInfo":
        break;
    }
  }

  // src/webview/index.ts
  function saveState() {
    vscode_api_default.setState({
      output: el.output().textContent,
      prompt: el.prompt().value,
      status: el.status().textContent
    });
  }
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
  el.runBtn().addEventListener("click", runTask);
  el.prompt().addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runTask();
  });
  document.getElementById("saveSettingsBtn").addEventListener("click", () => {
    cmd.saveSettings(readForm());
  });
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
