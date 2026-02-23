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
    const connecting = lower.includes("connecting");
    const idle = lower.includes("idle");
    const stopped = lower.includes("stopped");
    const error = lower.includes("error");
    const active = running || ready || connecting || idle;
    el.startBtn().disabled = active && !stopped && !error;
    el.startBtn().textContent = ready ? "Ready" : active ? "Started" : "Start";
    el.stopBtn().disabled = !active || stopped;
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

  // src/webview/icon-service.ts
  var ICON_PATHS = {
    "tool-start": '<path d="M4 8h8M8 4v8"/><circle cx="16" cy="16" r="3"/><path d="M19 19l3 3"/>',
    "tool-done": '<path d="M4 12l5 5L20 6"/>',
    "tool-error": '<path d="M6 6l12 12M18 6L6 18"/>',
    phase: '<path d="M12 3l7 4v10l-7 4-7-4V7z"/><path d="M12 7v10"/>',
    status: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    llm: '<path d="M7 6h10l2 3-2 3H7L5 9z"/><path d="M8 14h8l2 3-2 3H8l-2-3z"/>',
    text: '<circle cx="12" cy="12" r="2"/>',
    request: '<path d="M5 6h14v12H5z"/><path d="M8 10h8M8 14h5"/>',
    user: '<circle cx="12" cy="8" r="3"/><path d="M6 19c1.5-3 4-4 6-4s4.5 1 6 4"/>',
    run: '<path d="M7 5l11 7-11 7z"/>',
    agent: '<rect x="6" y="6" width="12" height="12" rx="2"/><circle cx="10" cy="12" r="1"/><circle cx="14" cy="12" r="1"/><path d="M10 16h4"/>',
    channel: '<path d="M4 19l16-7L4 5v5l10 2-10 2z"/>',
    task: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6M9 17h4"/>',
    session: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 3v4M16 3v4M8 12h8"/>',
    tool: '<path d="M14 3a5 5 0 0 0 0 10l5 5 2-2-5-5a5 5 0 0 0-2-8z"/><path d="M4 20l6-6"/>'
  };
  function createSvgIcon(path) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.innerHTML = path;
    return svg;
  }
  __name(createSvgIcon, "createSvgIcon");
  function makeIcon(id, className) {
    const span = document.createElement("span");
    span.className = className;
    span.appendChild(createSvgIcon(ICON_PATHS[id]));
    return span;
  }
  __name(makeIcon, "makeIcon");

  // src/webview/log.ts
  var LINE_META = {
    "tool-start": { icon: "tool-start", label: "TOOL START" },
    "tool-done": { icon: "tool-done", label: "TOOL DONE" },
    "tool-error": { icon: "tool-error", label: "TOOL ERROR" },
    phase: { icon: "phase", label: "PHASE" },
    status: { icon: "status", label: "STATUS" },
    llm: { icon: "llm", label: "LLM" },
    text: { icon: "text", label: "LOG" },
    request: { icon: "request", label: "REQUEST" },
    user: { icon: "user", label: "USER" },
    run: { icon: "run", label: "RUN" },
    agent: { icon: "agent", label: "AGENT" },
    channel: { icon: "channel", label: "CHANNEL" }
  };
  function normalizeStructuredLine(line) {
    let normalized = line.trim();
    normalized = normalized.replace(/^\[(telegram|whatsapp)\]\s+(?=\[\d{1,2}:\d{2}:\d{2}(?:\s?[AP]M)?\])/i, "");
    normalized = normalized.replace(/^\[\d{1,2}:\d{2}:\d{2}(?:\s?[AP]M)?\]\s+/, "");
    return normalized;
  }
  __name(normalizeStructuredLine, "normalizeStructuredLine");
  function classifyLine(line) {
    const normalized = normalizeStructuredLine(line);
    if (normalized.startsWith("[tool:start]")) return "tool-start";
    if (normalized.startsWith("[tool:done]")) return "tool-done";
    if (normalized.startsWith("[tool:error]")) return "tool-error";
    if (normalized.startsWith("[tool:end]")) {
      return /\berror\b|isError=true|error=|failed/i.test(normalized) ? "tool-error" : "tool-done";
    }
    if (normalized.startsWith("[phase]")) return "phase";
    if (normalized.startsWith("[status]") || normalized.startsWith("[heartbeat]")) return "status";
    if (normalized.startsWith("[llm:")) return "llm";
    if (normalized.startsWith("[request]")) return "request";
    if (normalized.startsWith("[user]")) return "user";
    if (normalized.startsWith("[run]") || normalized.startsWith("[done]")) return "run";
    if (normalized.startsWith("[agent]")) return "agent";
    if (normalized.startsWith("[telegram]") || normalized.startsWith("[whatsapp]")) return "channel";
    return "text";
  }
  __name(classifyLine, "classifyLine");
  function stripPrefix(line) {
    const normalized = normalizeStructuredLine(line);
    const closing = normalized.indexOf("]");
    if (closing === -1) {
      return normalized.trim();
    }
    return normalized.slice(closing + 1).trim();
  }
  __name(stripPrefix, "stripPrefix");
  function parseToolInvocation(line, prefix) {
    const normalized = normalizeStructuredLine(line);
    const compatiblePrefix = prefix === "[tool:done]" && normalized.startsWith("[tool:end]") ? "[tool:end]" : prefix;
    const payload = normalized.replace(compatiblePrefix, "").trim();
    if (payload.length === 0) {
      return { name: "tool", details: "" };
    }
    const [name, ...rest] = payload.split(/\s+/);
    return { name, details: rest.join(" ") };
  }
  __name(parseToolInvocation, "parseToolInvocation");
  function parseLine(line) {
    const kind = classifyLine(line);
    const meta = LINE_META[kind];
    const message = kind === "text" ? line.trim() : stripPrefix(line);
    return {
      kind,
      message: message.length > 0 ? message : line.trim(),
      icon: meta.icon,
      label: meta.label
    };
  }
  __name(parseLine, "parseLine");
  function makeLine(text) {
    const parsed = parseLine(text);
    const div = document.createElement("div");
    div.className = "log-line";
    div.dataset.kind = parsed.kind;
    const icon = makeIcon(parsed.icon, "log-icon");
    const kind = document.createElement("span");
    kind.className = "log-kind";
    kind.textContent = parsed.label;
    const message = document.createElement("span");
    message.className = "log-message";
    message.textContent = parsed.message;
    div.title = text;
    div.appendChild(icon);
    div.appendChild(kind);
    div.appendChild(message);
    return div;
  }
  __name(makeLine, "makeLine");
  var currentTaskNode = null;
  var currentToolNode = null;
  var currentSystemNode = null;
  function createGroupedNode(type, title, info, desc, icon) {
    const nodeEl = document.createElement("div");
    nodeEl.className = "grouped-node expanded";
    nodeEl.dataset.type = type;
    const header = document.createElement("div");
    header.className = "grouped-header";
    const headerContent = document.createElement("div");
    headerContent.className = "grouped-header-content";
    const row1 = document.createElement("div");
    row1.className = "grouped-header-row1";
    const titleWrap = document.createElement("div");
    titleWrap.className = "grouped-title-wrap";
    const iconSpan = makeIcon(icon, "grouped-title-icon");
    const titleSpan = document.createElement("span");
    titleSpan.className = `grouped-header-title ${type}`;
    titleSpan.textContent = title;
    titleWrap.appendChild(iconSpan);
    titleWrap.appendChild(titleSpan);
    const infoSpan = document.createElement("span");
    infoSpan.className = "grouped-header-info grouped-badge";
    infoSpan.textContent = info;
    if (info === "Running...") infoSpan.classList.add("running");
    row1.appendChild(titleWrap);
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
    return { el: nodeEl, header, body, descSpan, infoSpan, titleSpan };
  }
  __name(createGroupedNode, "createGroupedNode");
  function ensureSystemNode(out) {
    if (currentSystemNode) {
      return currentSystemNode;
    }
    currentSystemNode = createGroupedNode("task", "Session", "Active", "Initialization and runtime status", "session");
    out.appendChild(currentSystemNode.el);
    return currentSystemNode;
  }
  __name(ensureSystemNode, "ensureSystemNode");
  function appendLine(text) {
    const out = el.output();
    const atBottom = Math.abs(out.scrollHeight - out.scrollTop - out.clientHeight) < 40;
    const lineEl = makeLine(text);
    out.appendChild(lineEl);
    const parsed = parseLine(text);
    const kind = parsed.kind;
    if (kind === "request" || kind === "user") {
      currentSystemNode = null;
      if (!currentTaskNode) {
        currentTaskNode = createGroupedNode("task", kind === "request" ? "Task request" : "User message", "Active", parsed.message, "task");
        out.appendChild(currentTaskNode.el);
      } else {
        currentTaskNode.descSpan.textContent = parsed.message;
      }
      currentToolNode = null;
    } else if (kind === "tool-start") {
      const { name, details } = parseToolInvocation(text, "[tool:start]");
      currentToolNode = createGroupedNode("tool", name, "Running...", details || "Executing tool...", "tool");
      if (currentTaskNode) {
        currentTaskNode.body.appendChild(currentToolNode.el);
      } else {
        out.appendChild(currentToolNode.el);
      }
    } else if (kind === "tool-done" || kind === "tool-error") {
      const { name, details } = parseToolInvocation(text, kind === "tool-done" ? "[tool:done]" : "[tool:error]");
      if (currentToolNode) {
        currentToolNode.infoSpan.classList.remove("running");
        if (name.length > 0) {
          currentToolNode.titleSpan.textContent = name;
        }
        if (details.length > 0) {
          currentToolNode.descSpan.textContent = details;
        }
        if (kind === "tool-error") {
          currentToolNode.el.classList.add("error");
          currentToolNode.infoSpan.classList.add("error");
          currentToolNode.infoSpan.textContent = "Error";
        } else {
          currentToolNode.el.classList.add("done");
          currentToolNode.infoSpan.classList.add("done");
          const duration = details.match(/\b\d+ms\b/)?.[0];
          currentToolNode.infoSpan.textContent = duration ? `Done ${duration}` : "Done";
        }
        currentToolNode.body.appendChild(lineEl.cloneNode(true));
        if (kind === "tool-done") {
          currentToolNode.el.classList.remove("expanded");
        }
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
      } else {
        const systemNode = ensureSystemNode(out);
        systemNode.body.appendChild(lineEl.cloneNode(true));
        if (kind === "run") {
          systemNode.infoSpan.classList.remove("running");
          systemNode.infoSpan.classList.add("done");
          systemNode.infoSpan.textContent = "Ready";
        }
      }
    } else {
      const clone = lineEl.cloneNode(true);
      if (currentToolNode) {
        currentToolNode.body.appendChild(clone);
      } else if (currentTaskNode) {
        currentTaskNode.body.appendChild(clone);
      } else {
        const systemNode = ensureSystemNode(out);
        systemNode.body.appendChild(clone);
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
    currentSystemNode = null;
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
    currentSystemNode = null;
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
    const logMaxCharsRaw = Number.parseInt(strVal("logMaxChars") || "500000", 10);
    const logMaxChars = Number.isFinite(logMaxCharsRaw) && logMaxCharsRaw > 0 ? logMaxCharsRaw : 5e5;
    const telegramMaxLogLinesRaw = Number.parseInt(strVal("telegramMaxLogLines") || "300", 10);
    const telegramMaxLogLines = Number.isFinite(telegramMaxLogLinesRaw) && telegramMaxLogLinesRaw > 0 ? telegramMaxLogLinesRaw : 300;
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
      logMaxChars,
      telegramMaxLogLines,
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
    setStr("logMaxChars", String(s.logMaxChars ?? 5e5));
    setStr("telegramMaxLogLines", String(s.telegramMaxLogLines ?? 300));
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
    el.output().setAttribute("data-view", "grouped");
    saveState();
  });
  var enabledKinds = /* @__PURE__ */ new Set();
  var filterQuery = "";
  function applyGroupedFilters() {
    const output = el.output();
    const query = filterQuery.trim().toLowerCase();
    const hasKindFilters = enabledKinds.size > 0;
    const hasQuery = query.length > 0;
    const lines = Array.from(output.querySelectorAll(".grouped-body .log-line"));
    for (const line of lines) {
      const kind = line.dataset.kind || "text";
      const text = (line.textContent || "").toLowerCase();
      const kindMatch = !hasKindFilters || enabledKinds.has(kind);
      const queryMatch = !hasQuery || text.includes(query);
      line.style.display = kindMatch && queryMatch ? "" : "none";
    }
    const nodes = Array.from(output.querySelectorAll(".grouped-node"));
    for (const node of nodes) {
      const nodeLines = Array.from(node.querySelectorAll(".grouped-body .log-line"));
      const visibleLines = nodeLines.filter((line) => line.style.display !== "none");
      const shouldHide = (hasKindFilters || hasQuery) && nodeLines.length > 0 && visibleLines.length === 0;
      node.style.display = shouldHide ? "none" : "";
    }
  }
  __name(applyGroupedFilters, "applyGroupedFilters");
  function updateFilterButtons() {
    const buttons = Array.from(document.querySelectorAll(".log-filter-btn"));
    for (const button of buttons) {
      const kind = button.dataset.kind || "all";
      if (kind === "all") {
        button.classList.toggle("active", enabledKinds.size === 0);
        continue;
      }
      button.classList.toggle("active", enabledKinds.has(kind));
    }
  }
  __name(updateFilterButtons, "updateFilterButtons");
  function bindLogFilters() {
    const buttons = Array.from(document.querySelectorAll(".log-filter-btn"));
    const input = document.getElementById("logFilterQuery");
    const clear = document.getElementById("logFilterClear");
    for (const button of buttons) {
      button.addEventListener("click", () => {
        const kind = button.dataset.kind || "all";
        if (kind === "all") {
          enabledKinds.clear();
        } else if (enabledKinds.has(kind)) {
          enabledKinds.delete(kind);
        } else {
          enabledKinds.add(kind);
        }
        updateFilterButtons();
        applyGroupedFilters();
      });
    }
    input?.addEventListener("input", () => {
      filterQuery = input.value;
      applyGroupedFilters();
    });
    clear?.addEventListener("click", () => {
      enabledKinds.clear();
      filterQuery = "";
      if (input) input.value = "";
      updateFilterButtons();
      applyGroupedFilters();
    });
  }
  __name(bindLogFilters, "bindLogFilters");
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
    applyGroupedFilters();
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
    el.viewGroupedBtn().classList.add("active");
    el.output().setAttribute("data-view", "grouped");
  }
  bindLogFilters();
  updateFilterButtons();
  applyGroupedFilters();
  setControlState(el.status().textContent ?? "");
  cmd.requestSettings();
})();
