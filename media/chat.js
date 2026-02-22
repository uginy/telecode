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
    modelPicker: /* @__PURE__ */ __name(() => document.getElementById("modelPicker"), "modelPicker"),
    settingsNav: /* @__PURE__ */ __name(() => document.getElementById("settingsNav"), "settingsNav"),
    settingsCats: /* @__PURE__ */ __name(() => document.querySelectorAll(".settings-cat"), "settingsCats"),
    settingsNavItems: /* @__PURE__ */ __name(() => document.querySelectorAll(".settings-nav-item"), "settingsNavItems"),
    viewGroupedBtn: /* @__PURE__ */ __name(() => document.getElementById("viewGroupedBtn"), "viewGroupedBtn"),
    viewListBtn: /* @__PURE__ */ __name(() => document.getElementById("viewListBtn"), "viewListBtn"),
    logViewToggles: /* @__PURE__ */ __name(() => document.getElementById("logViewToggles"), "logViewToggles")
  };
  function setStatus(text) {
    const s = el.status();
    s.title = text;
    const lower = text.toLowerCase();
    s.dataset.state = lower.includes("error") ? "error" : lower.includes("idle") ? "idle" : "running";
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
    el.logViewToggles().classList.toggle("hidden", !isLogs);
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
    if (line.startsWith("[request]")) return "request";
    if (line.startsWith("[user]")) return "user";
    if (line.startsWith("[run]")) return "run";
    if (line.startsWith("[agent]")) return "agent";
    return "text";
  }
  __name(classifyLine, "classifyLine");
  function makeLine(text) {
    const div = document.createElement("div");
    div.className = "log-line";
    div.dataset.kind = classifyLine(text);
    div.textContent = text;
    return div;
  }
  __name(makeLine, "makeLine");
  var currentTaskNode = null;
  var currentToolNode = null;
  function createGroupedNode(type, title, info, desc) {
    const nodeEl = document.createElement("div");
    nodeEl.className = "grouped-node expanded";
    nodeEl.dataset.type = type;
    const header = document.createElement("div");
    header.className = "grouped-header";
    const headerContent = document.createElement("div");
    headerContent.className = "grouped-header-content";
    const row1 = document.createElement("div");
    row1.className = "grouped-header-row1";
    const titleSpan = document.createElement("span");
    titleSpan.className = `grouped-header-title ${type}`;
    titleSpan.textContent = title;
    const infoSpan = document.createElement("span");
    infoSpan.className = "grouped-header-info grouped-badge";
    infoSpan.textContent = info;
    if (info === "Running...") infoSpan.classList.add("running");
    row1.appendChild(titleSpan);
    row1.appendChild(infoSpan);
    const descSpan = document.createElement("div");
    descSpan.className = "grouped-header-desc";
    descSpan.textContent = desc;
    headerContent.appendChild(row1);
    headerContent.appendChild(descSpan);
    header.appendChild(headerContent);
    const body = document.createElement("div");
    body.className = "grouped-body";
    nodeEl.appendChild(header);
    nodeEl.appendChild(body);
    header.addEventListener("click", () => {
      nodeEl.classList.toggle("expanded");
    });
    return { el: nodeEl, header, body, descSpan, infoSpan };
  }
  __name(createGroupedNode, "createGroupedNode");
  function appendLine(text) {
    const out = el.output();
    const atBottom = Math.abs(out.scrollHeight - out.scrollTop - out.clientHeight) < 40;
    const lineEl = makeLine(text);
    out.appendChild(lineEl);
    const kind = classifyLine(text);
    if (kind === "request" || kind === "user") {
      if (!currentTaskNode) {
        currentTaskNode = createGroupedNode("task", "Task", "Active", text.replace("[request]", "").replace("[user]", "").trim());
        out.appendChild(currentTaskNode.el);
      } else {
        currentTaskNode.descSpan.textContent = text.replace("[request]", "").replace("[user]", "").trim();
      }
      currentToolNode = null;
    } else if (kind === "tool-start") {
      const parts = text.replace("[tool:start]", "").trim().split(" ");
      const name = parts[0];
      const details = parts.slice(1).join(" ");
      currentToolNode = createGroupedNode("tool", name, "Running...", details);
      if (currentTaskNode) {
        currentTaskNode.body.appendChild(currentToolNode.el);
      } else {
        out.appendChild(currentToolNode.el);
      }
    } else if (kind === "tool-done" || kind === "tool-error") {
      if (currentToolNode) {
        currentToolNode.infoSpan.classList.remove("running");
        if (kind === "tool-error") {
          currentToolNode.el.classList.add("error");
          currentToolNode.infoSpan.classList.add("error");
          currentToolNode.infoSpan.textContent = "Error";
        } else {
          currentToolNode.el.classList.add("done");
          currentToolNode.infoSpan.classList.add("done");
          currentToolNode.infoSpan.textContent = "Done";
        }
        currentToolNode.body.appendChild(lineEl.cloneNode(true));
        currentToolNode.el.classList.remove("expanded");
        currentToolNode = null;
      } else if (currentTaskNode) {
        currentTaskNode.body.appendChild(lineEl.cloneNode(true));
      }
    } else if (kind === "run" || kind === "agent") {
      if (currentTaskNode) {
        currentTaskNode.body.appendChild(lineEl.cloneNode(true));
        currentTaskNode.el.classList.add("done");
        currentTaskNode.infoSpan.classList.remove("running");
        currentTaskNode.infoSpan.classList.add("done");
        currentTaskNode.infoSpan.textContent = "Done";
        currentTaskNode = null;
        currentToolNode = null;
      }
    } else {
      const clone = lineEl.cloneNode(true);
      if (currentToolNode) {
        currentToolNode.body.appendChild(clone);
      } else if (currentTaskNode) {
        currentTaskNode.body.appendChild(clone);
      }
    }
    if (atBottom) out.scrollTop = out.scrollHeight;
  }
  __name(appendLine, "appendLine");
  function replaceOutput(text) {
    const out = el.output();
    out.innerHTML = "";
    currentTaskNode = null;
    currentToolNode = null;
    if (!text) return;
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) appendLine(line);
    }
    out.scrollTop = out.scrollHeight;
  }
  __name(replaceOutput, "replaceOutput");
  function appendOutput(text) {
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) appendLine(line);
    }
  }
  __name(appendOutput, "appendOutput");
  function clearOutput() {
    el.output().innerHTML = "";
    currentTaskNode = null;
    currentToolNode = null;
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
      uiLanguage: strVal("uiLanguage"),
      allowOutOfWorkspace: boolVal("allowOutOfWorkspace"),
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
    setStr("uiLanguage", s.uiLanguage ?? "ru");
    setBool("allowOutOfWorkspace", s.allowOutOfWorkspace === true);
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
      case "translate":
        if (msg.translations) {
          window.dispatchEvent(new CustomEvent("translate", { detail: msg.translations }));
        }
        break;
    }
  }
  __name(handleMessage, "handleMessage");

  // src/webview/index.ts
  function saveState() {
    const outputEl = el.output();
    const lines = Array.from(outputEl.querySelectorAll(".log-line"));
    const outputText = lines.map((l) => l.textContent).join("\n");
    const viewState = el.output().getAttribute("data-view") || "grouped";
    vscode_api_default.setState({
      output: outputText,
      prompt: el.prompt().value,
      status: el.status().textContent,
      view: viewState,
      tab: el.tabLogs().classList.contains("active") ? "logs" : "settings"
    });
  }
  __name(saveState, "saveState");
  el.viewGroupedBtn().addEventListener("click", () => {
    el.viewGroupedBtn().classList.add("active");
    el.viewListBtn().classList.remove("active");
    el.output().setAttribute("data-view", "grouped");
    saveState();
  });
  el.viewListBtn().addEventListener("click", () => {
    el.viewListBtn().classList.add("active");
    el.viewGroupedBtn().classList.remove("active");
    el.output().setAttribute("data-view", "list");
    saveState();
  });
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
  function updateSettingsCategory(catId) {
    const cats = Array.from(el.settingsCats());
    const navs = Array.from(el.settingsNavItems());
    for (const c of cats) {
      c.classList.toggle("hidden", c.id !== `cat${catId.charAt(0).toUpperCase()}${catId.slice(1)}`);
    }
    for (const n of navs) {
      n.classList.toggle("active", n.dataset.cat === catId);
    }
  }
  __name(updateSettingsCategory, "updateSettingsCategory");
  for (const btn of Array.from(el.settingsNavItems())) {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.cat;
      if (cat) updateSettingsCategory(cat);
    });
  }
  window.addEventListener("models-loaded", (e) => {
    const models = e.detail;
    updateModelSuggestions(models);
    el.settingsNote().textContent = `Loaded ${models.length} models`;
  });
  function updateModelSuggestions(models) {
    const picker = el.modelPicker();
    picker.innerHTML = "";
    if (models.length === 0) {
      picker.classList.add("hidden");
      return;
    }
    for (const m of models) {
      const div = document.createElement("div");
      div.className = "picker-item";
      div.textContent = m;
      div.addEventListener("click", () => {
        document.getElementById("model").value = m;
        picker.classList.add("hidden");
      });
      picker.appendChild(div);
    }
    picker.classList.remove("hidden");
  }
  __name(updateModelSuggestions, "updateModelSuggestions");
  var modelInput = document.getElementById("model");
  modelInput?.addEventListener("focus", () => {
    const picker = el.modelPicker();
    if (picker.children.length > 0) {
      picker.classList.remove("hidden");
    }
  });
  document.getElementById("modelChevron")?.addEventListener("click", (e) => {
    e.stopPropagation();
    modelInput.focus();
    const picker = el.modelPicker();
    if (picker.children.length > 0) {
      picker.classList.toggle("hidden");
    }
  });
  document.addEventListener("click", (e) => {
    const target = e.target;
    const isModelInput = target.id === "model";
    const isPicker = target.closest(".picker");
    const isFetchBtn = target.id === "fetchModelsBtn";
    if (!isModelInput && !isPicker && !isFetchBtn) {
      el.modelPicker().classList.add("hidden");
    }
  });
  window.addEventListener("translate", (e) => {
    const translations = e.detail;
    applyTranslations(translations);
  });
  function applyTranslations(t) {
    const textElements = Array.from(document.querySelectorAll("[data-t]"));
    for (const element of textElements) {
      const key = element.getAttribute("data-t");
      if (key && t[key]) {
        element.textContent = t[key];
      }
    }
    const placeholderElements = Array.from(document.querySelectorAll("[data-t-placeholder]"));
    for (const element of placeholderElements) {
      const key = element.getAttribute("data-t-placeholder");
      if (key && t[key]) {
        element.placeholder = t[key];
      }
    }
  }
  __name(applyTranslations, "applyTranslations");
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
    if (saved.view === "list") {
      el.viewListBtn().classList.add("active");
      el.viewGroupedBtn().classList.remove("active");
      el.output().setAttribute("data-view", "list");
    } else {
      el.viewGroupedBtn().classList.add("active");
      el.viewListBtn().classList.remove("active");
      el.output().setAttribute("data-view", "grouped");
    }
  }
  setControlState(el.status().textContent ?? "");
  cmd.requestSettings();
})();
