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
    connectChannels: /* @__PURE__ */ __name(() => vscode_api_default.postMessage({ command: "connectChannels" }), "connectChannels"),
    disconnectChannels: /* @__PURE__ */ __name(() => vscode_api_default.postMessage({ command: "disconnectChannels" }), "disconnectChannels"),
    runTask: /* @__PURE__ */ __name((prompt) => vscode_api_default.postMessage({ command: "runTask", prompt }), "runTask"),
    requestSettings: /* @__PURE__ */ __name(() => vscode_api_default.postMessage({ command: "requestSettings" }), "requestSettings"),
    requestTaskResult: /* @__PURE__ */ __name(() => vscode_api_default.postMessage({ command: "requestTaskResult" }), "requestTaskResult"),
    saveSettings: /* @__PURE__ */ __name((settings) => vscode_api_default.postMessage({ command: "saveSettings", settings }), "saveSettings"),
    showTaskDiff: /* @__PURE__ */ __name(() => vscode_api_default.postMessage({ command: "showTaskDiff" }), "showTaskDiff"),
    runTaskChecks: /* @__PURE__ */ __name(() => vscode_api_default.postMessage({ command: "runTaskChecks" }), "runTaskChecks"),
    rerunTaskChanges: /* @__PURE__ */ __name(() => vscode_api_default.postMessage({ command: "rerunTaskChanges" }), "rerunTaskChanges"),
    resumeTaskChanges: /* @__PURE__ */ __name(() => vscode_api_default.postMessage({ command: "resumeTaskChanges" }), "resumeTaskChanges"),
    commitTaskChanges: /* @__PURE__ */ __name(() => vscode_api_default.postMessage({ command: "commitTaskChanges" }), "commitTaskChanges"),
    revertTaskChanges: /* @__PURE__ */ __name(() => vscode_api_default.postMessage({ command: "revertTaskChanges" }), "revertTaskChanges"),
    fetchModels: /* @__PURE__ */ __name((provider, baseUrl, apiKey) => vscode_api_default.postMessage({ command: "fetchModels", provider, baseUrl, apiKey }), "fetchModels")
  };

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
    send: '<path d="M4 19l16-7L4 5v5l10 2-10 2z"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
    agent: '<rect x="6" y="6" width="12" height="12" rx="2"/><circle cx="10" cy="12" r="1"/><circle cx="14" cy="12" r="1"/><path d="M10 16h4"/>',
    channel: '<path d="M4 19l16-7L4 5v5l10 2-10 2z"/>',
    task: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6M9 17h4"/>',
    session: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 3v4M16 3v4M8 12h8"/>',
    tool: '<path d="M14 3a5 5 0 0 0 0 10l5 5 2-2-5-5a5 5 0 0 0-2-8z"/><path d="M4 20l6-6"/>',
    github: '<path d="M9 19c-4.5 1.4-4.5-2.1-6.3-2.8"/><path d="M15 22v-3.3a3.3 3.3 0 0 0-.9-2.6c3-.3 6.1-1.5 6.1-6.6a5.2 5.2 0 0 0-1.4-3.6 4.9 4.9 0 0 0-.1-3.6s-1.1-.3-3.7 1.4a12.8 12.8 0 0 0-6.7 0C5.7 2 4.6 2.3 4.6 2.3a4.9 4.9 0 0 0-.1 3.6 5.2 5.2 0 0 0-1.4 3.6c0 5 3.1 6.2 6.1 6.6a3.3 3.3 0 0 0-.9 2.6V22"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 2.5 12.4 0 18"/><path d="M12 3c-2.5 2.6-2.5 12.4 0 18"/>',
    "collapse-all": '<path d="M7 14l5-5 5 5"/><path d="M7 19l5-5 5 5"/>',
    "expand-all": '<path d="M7 10l5 5 5-5"/><path d="M7 5l5 5 5-5"/>'
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

  // src/webview/ui-state.ts
  var el = {
    status: /* @__PURE__ */ __name(() => document.getElementById("status"), "status"),
    phase: /* @__PURE__ */ __name(() => document.getElementById("phase"), "phase"),
    output: /* @__PURE__ */ __name(() => document.getElementById("output"), "output"),
    prompt: /* @__PURE__ */ __name(() => document.getElementById("prompt"), "prompt"),
    agentToggleBtn: /* @__PURE__ */ __name(() => document.getElementById("agentToggleBtn"), "agentToggleBtn"),
    runBtn: /* @__PURE__ */ __name(() => document.getElementById("runBtn"), "runBtn"),
    tabLogs: /* @__PURE__ */ __name(() => document.getElementById("tabLogs"), "tabLogs"),
    tabSettings: /* @__PURE__ */ __name(() => document.getElementById("tabSettings"), "tabSettings"),
    logsPane: /* @__PURE__ */ __name(() => document.getElementById("logsPane"), "logsPane"),
    settingsPane: /* @__PURE__ */ __name(() => document.getElementById("settingsPane"), "settingsPane"),
    settingsToolbar: /* @__PURE__ */ __name(() => document.getElementById("settingsToolbar"), "settingsToolbar"),
    settingsNote: /* @__PURE__ */ __name(() => document.getElementById("settingsNote"), "settingsNote"),
    saveSettingsBtn: /* @__PURE__ */ __name(() => document.getElementById("saveSettingsBtn"), "saveSettingsBtn"),
    fetchModelsBtn: /* @__PURE__ */ __name(() => document.getElementById("fetchModelsBtn"), "fetchModelsBtn"),
    modelPicker: /* @__PURE__ */ __name(() => document.getElementById("modelPicker"), "modelPicker"),
    settingsNav: /* @__PURE__ */ __name(() => document.getElementById("settingsNav"), "settingsNav"),
    settingsCats: /* @__PURE__ */ __name(() => document.querySelectorAll(".settings-cat"), "settingsCats"),
    settingsNavItems: /* @__PURE__ */ __name(() => document.querySelectorAll(".settings-nav-item"), "settingsNavItems"),
    viewGroupedBtn: /* @__PURE__ */ __name(() => document.getElementById("viewGroupedBtn"), "viewGroupedBtn"),
    viewListBtn: /* @__PURE__ */ __name(() => document.getElementById("viewListBtn"), "viewListBtn"),
    logViewToggles: /* @__PURE__ */ __name(() => document.getElementById("logViewToggles"), "logViewToggles"),
    taskResultCard: /* @__PURE__ */ __name(() => document.getElementById("taskResultCard"), "taskResultCard"),
    taskResultBody: /* @__PURE__ */ __name(() => document.getElementById("taskResultBody"), "taskResultBody"),
    taskResultToggleBtn: /* @__PURE__ */ __name(() => document.getElementById("taskResultToggleBtn"), "taskResultToggleBtn"),
    taskResultTitle: /* @__PURE__ */ __name(() => document.getElementById("taskResultTitle"), "taskResultTitle"),
    taskResultSummary: /* @__PURE__ */ __name(() => document.getElementById("taskResultSummary"), "taskResultSummary"),
    taskResultMeta: /* @__PURE__ */ __name(() => document.getElementById("taskResultMeta"), "taskResultMeta"),
    taskResultPrompt: /* @__PURE__ */ __name(() => document.getElementById("taskResultPrompt"), "taskResultPrompt"),
    taskResultFiles: /* @__PURE__ */ __name(() => document.getElementById("taskResultFiles"), "taskResultFiles"),
    taskResultChecks: /* @__PURE__ */ __name(() => document.getElementById("taskResultChecks"), "taskResultChecks"),
    taskDiffBtn: /* @__PURE__ */ __name(() => document.getElementById("taskDiffBtn"), "taskDiffBtn"),
    taskChecksBtn: /* @__PURE__ */ __name(() => document.getElementById("taskChecksBtn"), "taskChecksBtn"),
    taskRerunBtn: /* @__PURE__ */ __name(() => document.getElementById("taskRerunBtn"), "taskRerunBtn"),
    taskResumeBtn: /* @__PURE__ */ __name(() => document.getElementById("taskResumeBtn"), "taskResumeBtn"),
    taskCommitBtn: /* @__PURE__ */ __name(() => document.getElementById("taskCommitBtn"), "taskCommitBtn"),
    taskRevertBtn: /* @__PURE__ */ __name(() => document.getElementById("taskRevertBtn"), "taskRevertBtn")
  };
  var agentActive = false;
  var channelsConnected = false;
  function getTranslations() {
    return window.__tcTranslations || {};
  }
  __name(getTranslations, "getTranslations");
  function getTooltipText(key, fallback) {
    return getTranslations()[key] || fallback;
  }
  __name(getTooltipText, "getTooltipText");
  function setToggleVisual(button, state, icon, tooltipKey, tooltipFallback) {
    button.dataset.state = state;
    button.classList.toggle("is-on", state === "on");
    button.classList.toggle("is-off", state === "off");
    button.dataset.tooltipKey = tooltipKey;
    const tooltip = getTooltipText(tooltipKey, tooltipFallback);
    button.dataset.tooltip = tooltip;
    button.setAttribute("aria-label", tooltip);
    button.innerHTML = "";
    button.appendChild(makeIcon(icon, "top-icon-glyph"));
  }
  __name(setToggleVisual, "setToggleVisual");
  function statusMeansAgentActive(statusText) {
    const lower = statusText.trim().toLowerCase();
    if (!lower) return false;
    if (lower.includes("idle") || lower.includes("stopped") || lower.includes("error")) return false;
    return true;
  }
  __name(statusMeansAgentActive, "statusMeansAgentActive");
  function applyAgentToggle() {
    const button = el.agentToggleBtn();
    if (agentActive || channelsConnected) {
      setToggleVisual(button, "on", "stop", "tt_toggle_agent_stop", "Stop TeleCode (agent + channels)");
    } else {
      setToggleVisual(button, "off", "run", "tt_toggle_agent_start", "Start TeleCode (agent + channels)");
    }
  }
  __name(applyAgentToggle, "applyAgentToggle");
  function setStatus(text) {
    const s = el.status();
    s.textContent = text;
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
    el.runBtn().disabled = running;
    setAgentToggleState(statusMeansAgentActive(statusText));
  }
  __name(setControlState, "setControlState");
  function setAgentToggleState(active) {
    agentActive = active;
    applyAgentToggle();
  }
  __name(setAgentToggleState, "setAgentToggleState");
  function setChannelsToggleState(connected) {
    channelsConnected = connected;
    applyAgentToggle();
  }
  __name(setChannelsToggleState, "setChannelsToggleState");
  function isAgentToggleOn() {
    return agentActive;
  }
  __name(isAgentToggleOn, "isAgentToggleOn");
  function refreshToggleLabels() {
    applyAgentToggle();
  }
  __name(refreshToggleLabels, "refreshToggleLabels");
  function setTab(tab) {
    const isLogs = tab === "logs";
    el.tabLogs().classList.toggle("active", isLogs);
    el.tabSettings().classList.toggle("active", !isLogs);
    el.logsPane().classList.toggle("hidden", !isLogs);
    el.settingsPane().classList.toggle("hidden", isLogs);
    el.saveSettingsBtn().classList.toggle("hidden", isLogs);
    el.settingsNote().classList.toggle("hidden", isLogs);
    el.settingsToolbar().classList.toggle("hidden", isLogs);
    el.logViewToggles().classList.toggle("hidden", !isLogs);
  }
  __name(setTab, "setTab");

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
    if (/^\[(telegram|whatsapp)(?::[^\]]+)?\]/i.test(normalized)) return "channel";
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
  function parseLine(line) {
    const kind = classifyLine(line);
    const meta = LINE_META[kind];
    if (kind === "channel") {
      const normalized = normalizeStructuredLine(line);
      const match = normalized.match(/^\[(telegram|whatsapp)(?::([^\]]+))?\](.*)$/i);
      const source = (match?.[1] || "channel").toUpperCase();
      const sourceId = source === "TELEGRAM" ? "telegram" : source === "WHATSAPP" ? "whatsapp" : void 0;
      const tag = (match?.[2] || "").toLowerCase();
      let bodyRaw = match?.[3] || "";
      if (bodyRaw.startsWith(" ")) {
        bodyRaw = bodyRaw.slice(1);
      }
      if (source === "WHATSAPP" && tag === "qrsvg") {
        const body2 = bodyRaw.trim();
        const variant = body2.startsWith("PHN2Zy") ? "whatsapp-qr-svg" : "whatsapp-qr-note";
        return {
          kind,
          message: body2.length > 0 ? body2 : normalized,
          icon: meta.icon,
          label: source,
          source: sourceId,
          variant
        };
      }
      const body = bodyRaw.trim();
      return {
        kind,
        message: body.length > 0 ? body : normalized,
        icon: meta.icon,
        label: source,
        source: sourceId
      };
    }
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
    if (parsed.source) {
      div.dataset.source = parsed.source;
    }
    if (parsed.variant) {
      div.dataset.variant = parsed.variant;
      div.classList.add(`variant-${parsed.variant}`);
    }
    const icon = makeIcon(parsed.icon, "log-icon");
    const kind = document.createElement("span");
    kind.className = "log-kind";
    kind.textContent = parsed.label;
    const message = document.createElement("span");
    message.className = "log-message";
    if (parsed.variant === "whatsapp-qr-svg") {
      const img = document.createElement("img");
      img.className = "qr-svg-image";
      img.alt = "WhatsApp QR";
      img.src = `data:image/svg+xml;base64,${parsed.message}`;
      message.appendChild(img);
    } else {
      message.textContent = parsed.message;
    }
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
  var streamText = "";
  var streamListLine = null;
  var streamGroupedLine = null;
  var currentRunSummary = null;
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
  function setLineText(line, text) {
    const updated = makeLine(text);
    line.replaceWith(updated);
    return updated;
  }
  __name(setLineText, "setLineText");
  function appendToCurrentGroupedContext(line, out) {
    const clone = line.cloneNode(true);
    if (currentToolNode) {
      currentToolNode.body.appendChild(clone);
      return clone;
    }
    if (currentTaskNode) {
      currentTaskNode.body.appendChild(clone);
      return clone;
    }
    const systemNode = ensureSystemNode(out);
    systemNode.body.appendChild(clone);
    return clone;
  }
  __name(appendToCurrentGroupedContext, "appendToCurrentGroupedContext");
  function beginOrUpdateStreamingText(chunk) {
    if (chunk.length === 0) {
      return;
    }
    const out = el.output();
    streamText += chunk;
    if (!streamListLine) {
      streamListLine = makeLine(streamText);
      out.appendChild(streamListLine);
      streamGroupedLine = appendToCurrentGroupedContext(streamListLine, out);
      return;
    }
    streamListLine = setLineText(streamListLine, streamText);
    if (streamGroupedLine) {
      streamGroupedLine = setLineText(streamGroupedLine, streamText);
    }
  }
  __name(beginOrUpdateStreamingText, "beginOrUpdateStreamingText");
  function finalizeStreamingText() {
    streamText = "";
    streamListLine = null;
    streamGroupedLine = null;
  }
  __name(finalizeStreamingText, "finalizeStreamingText");
  function appendLine(text) {
    const out = el.output();
    const atBottom = Math.abs(out.scrollHeight - out.scrollTop - out.clientHeight) < 40;
    const lineEl = makeLine(text);
    out.appendChild(lineEl);
    const parsed = parseLine(text);
    const kind = parsed.kind;
    if ((kind === "request" || kind === "user") && parsed.message.length > 0) {
      currentRunSummary = {
        startedAt: Date.now(),
        tools: 0,
        errors: 0,
        prompt: parsed.message.slice(0, 120)
      };
    }
    if (kind === "tool-start" && currentRunSummary) {
      currentRunSummary.tools += 1;
    }
    if (kind === "tool-error" && currentRunSummary) {
      currentRunSummary.errors += 1;
    }
    if (kind !== "text") {
      finalizeStreamingText();
    }
    if (kind === "request" || kind === "user") {
      currentSystemNode = null;
      if (!currentTaskNode) {
        currentTaskNode = createGroupedNode("task", kind === "request" ? "Task request" : "User message", "Active", parsed.message, "task");
        out.appendChild(currentTaskNode.el);
      } else {
        currentTaskNode.descSpan.textContent = parsed.message;
      }
      currentToolNode = null;
    } else if (kind === "tool-start" || kind === "tool-done" || kind === "tool-error") {
      currentToolNode = null;
      const clone = lineEl.cloneNode(true);
      if (currentTaskNode) {
        currentTaskNode.body.appendChild(clone);
      } else {
        const systemNode = ensureSystemNode(out);
        systemNode.body.appendChild(clone);
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
      if (kind === "run" && currentRunSummary) {
        const elapsedMs = Math.max(0, Date.now() - currentRunSummary.startedAt);
        window.dispatchEvent(new CustomEvent("run-summary", {
          detail: {
            tools: currentRunSummary.tools,
            errors: currentRunSummary.errors,
            elapsedMs,
            prompt: currentRunSummary.prompt
          }
        }));
        currentRunSummary = null;
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
    finalizeStreamingText();
    if (!text) return;
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) appendLine(line);
    }
    out.scrollTop = out.scrollHeight;
  }
  __name(replaceOutput, "replaceOutput");
  function appendOutput(text) {
    if (text.length === 0) {
      return;
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.length === 0) {
        if (i < lines.length - 1) {
          finalizeStreamingText();
        }
        continue;
      }
      const kind = classifyLine(line);
      if (kind !== "text") {
        finalizeStreamingText();
        appendLine(line);
        continue;
      }
      beginOrUpdateStreamingText(line);
      if (i < lines.length - 1) {
        finalizeStreamingText();
      }
    }
  }
  __name(appendOutput, "appendOutput");
  function clearOutput() {
    el.output().innerHTML = "";
    currentTaskNode = null;
    currentToolNode = null;
    currentSystemNode = null;
    finalizeStreamingText();
  }
  __name(clearOutput, "clearOutput");
  function collapseAllGroups() {
    const out = el.output();
    const nodes = Array.from(out.querySelectorAll(".grouped-node"));
    for (const node of nodes) {
      node.classList.remove("expanded");
    }
  }
  __name(collapseAllGroups, "collapseAllGroups");
  function expandAllGroups() {
    const out = el.output();
    const nodes = Array.from(out.querySelectorAll(".grouped-node"));
    for (const node of nodes) {
      node.classList.add("expanded");
    }
  }
  __name(expandAllGroups, "expandAllGroups");

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
    const channelLogLinesRaw = Number.parseInt(strVal("channelLogLines") || "300", 10);
    const channelLogLines = Number.isFinite(channelLogLinesRaw) && channelLogLinesRaw > 0 ? channelLogLinesRaw : 300;
    return {
      provider: strVal("provider"),
      model: strVal("model"),
      apiKey: strVal("apiKey"),
      baseUrl: strVal("baseUrl"),
      maxSteps,
      responseStyle: strVal("responseStyle"),
      language: strVal("language"),
      uiLanguage: strVal("uiLanguage"),
      statusVerbosity: strVal("statusVerbosity"),
      safeModeProfile: strVal("safeModeProfile"),
      allowOutOfWorkspace: boolVal("allowOutOfWorkspace"),
      logMaxChars,
      channelLogLines,
      telegramEnabled: boolVal("telegramEnabled"),
      telegramBotToken: strVal("telegramBotToken"),
      telegramChatId: strVal("telegramChatId"),
      telegramApiRoot: strVal("telegramApiRoot"),
      telegramForceIPv4: boolVal("telegramForceIPv4"),
      whatsappEnabled: boolVal("whatsappEnabled"),
      whatsappSessionPath: strVal("whatsappSessionPath"),
      whatsappAllowSelfCommands: boolVal("whatsappAllowSelfCommands"),
      whatsappAccessMode: strVal("whatsappAccessMode") || "self",
      whatsappAllowedPhones: strVal("whatsappAllowedPhones")
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
    setStr("statusVerbosity", s.statusVerbosity ?? "normal");
    setStr("safeModeProfile", s.safeModeProfile ?? "balanced");
    setBool("allowOutOfWorkspace", s.allowOutOfWorkspace === true);
    setStr("logMaxChars", String(s.logMaxChars ?? 5e5));
    setStr("channelLogLines", String(s.channelLogLines ?? 300));
    setBool("telegramEnabled", s.telegramEnabled === true);
    setStr("telegramBotToken", s.telegramBotToken ?? "");
    setStr("telegramChatId", s.telegramChatId ?? "");
    setStr("telegramApiRoot", s.telegramApiRoot ?? "");
    setBool("telegramForceIPv4", s.telegramForceIPv4 !== false);
    setBool("whatsappEnabled", s.whatsappEnabled === true);
    setStr("whatsappSessionPath", s.whatsappSessionPath ?? "~/.telecode-ai/whatsapp-session.json");
    setBool("whatsappAllowSelfCommands", s.whatsappAllowSelfCommands !== false);
    setStr("whatsappAccessMode", s.whatsappAccessMode ?? "self");
    setStr("whatsappAllowedPhones", s.whatsappAllowedPhones ?? "");
  }
  __name(writeForm, "writeForm");

  // src/webview/task-result.ts
  var taskResultExpanded = false;
  function formatCheckList(result) {
    if (result.checks.length === 0) {
      return "Checks: not run";
    }
    return result.checks.map((check) => `${check.label}: ${check.status}${check.summary ? ` (${check.summary})` : ""}`).join(" \u2022 ");
  }
  __name(formatCheckList, "formatCheckList");
  function formatFiles(result) {
    if (result.changedFiles.length === 0) {
      return "No changed files";
    }
    return result.changedFiles.slice(0, 6).map((file) => `${file.status}: ${file.path}`).join("\n");
  }
  __name(formatFiles, "formatFiles");
  function syncTaskResultCollapse() {
    const card = el.taskResultCard();
    const body = el.taskResultBody();
    const toggle = el.taskResultToggleBtn();
    if (!card || !body) {
      return;
    }
    card.dataset.expanded = taskResultExpanded ? "true" : "false";
    body.classList.toggle("hidden", !taskResultExpanded);
    toggle.setAttribute("aria-expanded", taskResultExpanded ? "true" : "false");
  }
  __name(syncTaskResultCollapse, "syncTaskResultCollapse");
  function bindTaskResultActions() {
    el.taskResultToggleBtn()?.addEventListener("click", () => {
      taskResultExpanded = !taskResultExpanded;
      syncTaskResultCollapse();
    });
    el.taskDiffBtn()?.addEventListener("click", () => cmd.showTaskDiff());
    el.taskChecksBtn()?.addEventListener("click", () => cmd.runTaskChecks());
    el.taskRerunBtn()?.addEventListener("click", () => cmd.rerunTaskChanges());
    el.taskResumeBtn()?.addEventListener("click", () => cmd.resumeTaskChanges());
    el.taskCommitBtn()?.addEventListener("click", () => cmd.commitTaskChanges());
    el.taskRevertBtn()?.addEventListener("click", () => cmd.revertTaskChanges());
  }
  __name(bindTaskResultActions, "bindTaskResultActions");
  function renderTaskResultCard(result) {
    const card = el.taskResultCard();
    if (!card) {
      return;
    }
    if (!result) {
      card.classList.add("hidden");
      return;
    }
    card.classList.remove("hidden");
    syncTaskResultCollapse();
    el.taskResultTitle().textContent = result.outcome === "completed" ? "Last task completed" : result.outcome === "failed" ? "Last task failed" : "Last task interrupted";
    el.taskResultSummary().textContent = result.summary;
    el.taskResultMeta().textContent = [
      result.branch ? `branch: ${result.branch}` : "branch: -",
      `at: ${new Date(result.completedAt).toLocaleString()}`
    ].join(" \u2022 ");
    el.taskResultPrompt().textContent = result.prompt;
    el.taskResultFiles().textContent = formatFiles(result);
    el.taskResultChecks().textContent = formatCheckList(result);
    el.taskDiffBtn().disabled = result.changedFiles.length === 0;
    el.taskChecksBtn().disabled = false;
    el.taskRerunBtn().disabled = false;
    el.taskResumeBtn().disabled = result.outcome !== "interrupted";
    el.taskCommitBtn().disabled = !result.canCommit;
    el.taskRevertBtn().disabled = result.changedFiles.length === 0;
  }
  __name(renderTaskResultCard, "renderTaskResultCard");

  // src/webview/messages.ts
  function handleMessage(raw) {
    const msg = raw;
    switch (msg.type) {
      case "status":
        setStatus(msg.text);
        setControlState(msg.text);
        break;
      case "channelsState":
        setChannelsToggleState(msg.connected === true);
        break;
      case "progress":
        {
          const text = (msg.text ?? "").trim();
          const lower = text.toLowerCase();
          const isIdleLike = lower === "idle" || lower === "ready" || lower.startsWith("idle \u2022") || lower.startsWith("ready \u2022");
          setPhaseText(msg.busy || !isIdleLike ? text : "");
          el.phase().dataset.busy = msg.busy ? "1" : "0";
        }
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
      case "taskResult":
        renderTaskResultCard(msg.result);
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
        if (typeof msg.text === "string") {
          window.dispatchEvent(new CustomEvent("build-info", { detail: msg.text }));
        }
        break;
      case "translate":
        if (msg.translations) {
          window.dispatchEvent(new CustomEvent("translate", { detail: msg.translations }));
        }
        break;
    }
  }
  __name(handleMessage, "handleMessage");

  // src/webview/tooltip-service.ts
  var TOOLTIP_SELECTOR = "[data-tooltip], [data-tooltip-key]";
  var VIEWPORT_GAP = 8;
  var tooltipEl = null;
  var activeTarget = null;
  var hideTimeout;
  function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    const el2 = document.createElement("div");
    el2.className = "tc-tooltip";
    el2.setAttribute("role", "tooltip");
    document.body.appendChild(el2);
    tooltipEl = el2;
    el2.addEventListener("mouseenter", () => {
      if (hideTimeout) window.clearTimeout(hideTimeout);
    });
    el2.addEventListener("mouseleave", () => {
      if (activeTarget && activeTarget.dataset.tooltipClick === "true") return;
      hideTimeout = window.setTimeout(hideTooltip, 150);
    });
    return el2;
  }
  __name(ensureTooltip, "ensureTooltip");
  function placements(preferred) {
    const p = preferred === "right" || preferred === "bottom" || preferred === "left" ? preferred : "top";
    const order = ["top", "right", "bottom", "left"];
    return [p, ...order.filter((x) => x !== p)];
  }
  __name(placements, "placements");
  function calcPos(trigger, tipRect, place) {
    let top;
    let left;
    if (place === "top") {
      top = trigger.top - tipRect.height - VIEWPORT_GAP;
      left = trigger.left + (trigger.width - tipRect.width) / 2;
    } else if (place === "bottom") {
      top = trigger.bottom + VIEWPORT_GAP;
      left = trigger.left + (trigger.width - tipRect.width) / 2;
    } else if (place === "right") {
      top = trigger.top + (trigger.height - tipRect.height) / 2;
      left = trigger.right + VIEWPORT_GAP;
    } else {
      top = trigger.top + (trigger.height - tipRect.height) / 2;
      left = trigger.left - tipRect.width - VIEWPORT_GAP;
    }
    const fits = top >= 4 && left >= 4 && top + tipRect.height <= window.innerHeight - 4 && left + tipRect.width <= window.innerWidth - 4;
    return { top, left, fits };
  }
  __name(calcPos, "calcPos");
  function showTooltip(target) {
    if (hideTimeout) window.clearTimeout(hideTimeout);
    const text = (target.dataset.tooltip || "").trim();
    if (!text) return;
    const tip = ensureTooltip();
    if (activeTarget !== target) {
      tip.textContent = text;
      activeTarget = target;
    }
    tip.dataset.open = "1";
    const preferred = target.dataset.tooltipPlacement || "top";
    tip.style.top = "0px";
    tip.style.left = "0px";
    const tipRect = tip.getBoundingClientRect();
    const triggerRect = target.getBoundingClientRect();
    let pos = calcPos(triggerRect, tipRect, "top");
    for (const place of placements(preferred)) {
      const next = calcPos(triggerRect, tipRect, place);
      if (next.fits) {
        pos = next;
        tip.dataset.place = place;
        break;
      }
    }
    const clampedTop = Math.max(4, Math.min(pos.top, window.innerHeight - tipRect.height - 4));
    const clampedLeft = Math.max(4, Math.min(pos.left, window.innerWidth - tipRect.width - 4));
    tip.style.top = `${clampedTop}px`;
    tip.style.left = `${clampedLeft}px`;
  }
  __name(showTooltip, "showTooltip");
  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.dataset.open = "0";
    activeTarget = null;
  }
  __name(hideTooltip, "hideTooltip");
  function bindElement(el2) {
    if (el2.dataset.tooltipBound === "1") return;
    el2.dataset.tooltipBound = "1";
    if (el2.dataset.tooltipClick === "true") {
      el2.addEventListener("click", (e) => {
        e.stopPropagation();
        if (tooltipEl?.dataset.open === "1" && activeTarget === el2) {
          hideTooltip();
        } else {
          showTooltip(el2);
        }
      });
    } else {
      el2.addEventListener("mouseenter", () => showTooltip(el2));
      el2.addEventListener("mouseleave", () => {
        hideTimeout = window.setTimeout(hideTooltip, 150);
      });
      el2.addEventListener("focus", () => showTooltip(el2));
      el2.addEventListener("blur", () => {
        hideTimeout = window.setTimeout(hideTooltip, 150);
      });
    }
  }
  __name(bindElement, "bindElement");
  function initTooltips() {
    const all = Array.from(document.querySelectorAll(TOOLTIP_SELECTOR));
    for (const el2 of all) bindElement(el2);
    window.addEventListener("scroll", () => {
      if (activeTarget && tooltipEl?.dataset.open === "1") showTooltip(activeTarget);
    }, true);
    window.addEventListener("resize", () => {
      if (activeTarget && tooltipEl?.dataset.open === "1") showTooltip(activeTarget);
    });
    document.addEventListener("click", (e) => {
      if (tooltipEl && tooltipEl.dataset.open === "1") {
        const t = e.target;
        if (!tooltipEl.contains(t) && (!activeTarget || !activeTarget.contains(t))) {
          hideTooltip();
        }
      }
    });
  }
  __name(initTooltips, "initTooltips");
  function applyTooltipTranslations(t) {
    const all = Array.from(document.querySelectorAll("[data-tooltip-key]"));
    for (const el2 of all) {
      const key = el2.dataset.tooltipKey || "";
      if (key && t[key]) {
        el2.dataset.tooltip = t[key];
      }
    }
  }
  __name(applyTooltipTranslations, "applyTooltipTranslations");

  // src/webview/index.ts
  function deriveAllowOutOfWorkspaceByProfile(profile) {
    return profile === "power";
  }
  __name(deriveAllowOutOfWorkspaceByProfile, "deriveAllowOutOfWorkspaceByProfile");
  function syncSafeModeControls(profile) {
    const effective = profile || "balanced";
    const inline = document.getElementById("safeModeProfileInline");
    if (inline) inline.value = effective;
    const allowOut = document.getElementById("allowOutOfWorkspace");
    if (allowOut) {
      allowOut.checked = deriveAllowOutOfWorkspaceByProfile(effective);
      allowOut.disabled = effective !== "power";
    }
    const settingsSelect = document.getElementById("safeModeProfile");
    if (settingsSelect) settingsSelect.value = effective;
  }
  __name(syncSafeModeControls, "syncSafeModeControls");
  function updateComposerMeta() {
    const provider = document.getElementById("provider")?.value?.trim() || "-";
    const model = document.getElementById("model")?.value?.trim() || "-";
    const style = document.getElementById("responseStyle")?.value?.trim() || "-";
    const metaProvider = document.getElementById("metaProvider");
    const metaModel = document.getElementById("metaModel");
    const metaStyle = document.getElementById("metaStyle");
    if (metaProvider) metaProvider.textContent = `provider: ${provider}`;
    if (metaModel) metaModel.textContent = `model: ${model}`;
    if (metaStyle) metaStyle.textContent = `style: ${style}`;
  }
  __name(updateComposerMeta, "updateComposerMeta");
  function initStaticIcons() {
    const sendBtn = el.runBtn();
    sendBtn.innerHTML = "";
    sendBtn.appendChild(makeIcon("send", "send-icon"));
    refreshToggleLabels();
    const aboutIcons = Array.from(document.querySelectorAll("[data-about-icon]"));
    const allowed = /* @__PURE__ */ new Set(["github", "globe", "run", "task", "channel", "tool"]);
    for (const holder of aboutIcons) {
      const id = holder.dataset.aboutIcon;
      holder.innerHTML = "";
      if (id && allowed.has(id)) {
        holder.appendChild(makeIcon(id, "about-link-icon"));
      }
    }
    updateGroupsToggleButton(true);
  }
  __name(initStaticIcons, "initStaticIcons");
  function updateGroupsToggleButton(collapseAction) {
    const btn = document.getElementById("toggleAllGroupsBtn");
    if (!btn) return;
    btn.dataset.action = collapseAction ? "collapse" : "expand";
    const key = collapseAction ? "btn_collapse_all" : "btn_expand_all";
    const t = window.__tcTranslations || {};
    const text = t[key] || (collapseAction ? "Collapse all" : "Expand all");
    btn.dataset.tooltipKey = key;
    btn.dataset.tooltip = text;
    btn.setAttribute("aria-label", text);
    btn.innerHTML = "";
    btn.appendChild(makeIcon(collapseAction ? "collapse-all" : "expand-all", "log-action-icon"));
  }
  __name(updateGroupsToggleButton, "updateGroupsToggleButton");
  function bindSafeModeStrip() {
    const inline = document.getElementById("safeModeProfileInline");
    inline?.addEventListener("change", () => {
      const profile = inline.value || "balanced";
      const settings = readForm();
      settings.safeModeProfile = profile;
      settings.allowOutOfWorkspace = deriveAllowOutOfWorkspaceByProfile(profile);
      cmd.saveSettings(settings);
      syncSafeModeControls(profile);
    });
  }
  __name(bindSafeModeStrip, "bindSafeModeStrip");
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
      tab: el.tabLogs().classList.contains("active") ? "logs" : "settings",
      filterKinds: pinFilters ? [...Array.from(enabledKinds), ...Array.from(enabledSources)] : [],
      filterQuery: pinFilters ? filterQuery : "",
      pinFilters
    });
  }
  __name(saveState, "saveState");
  el.viewGroupedBtn().addEventListener("click", () => {
    el.viewGroupedBtn().classList.add("active");
    el.output().setAttribute("data-view", "grouped");
    saveState();
  });
  var enabledKinds = /* @__PURE__ */ new Set();
  var enabledSources = /* @__PURE__ */ new Set();
  var filterQuery = "";
  var pinFilters = true;
  function updatePinFiltersButton() {
    const btn = document.getElementById("pinFiltersBtn");
    if (!btn) return;
    btn.classList.toggle("active", pinFilters);
  }
  __name(updatePinFiltersButton, "updatePinFiltersButton");
  function updateRunSummaryCard(data) {
    const card = document.getElementById("runSummaryCard");
    if (!card) return;
    const sec = (data.elapsedMs / 1e3).toFixed(1);
    card.textContent = `"${data.prompt}" \u2022 tools ${data.tools} \u2022 errors ${data.errors} \u2022 ${sec}s`;
  }
  __name(updateRunSummaryCard, "updateRunSummaryCard");
  function applyGroupedFilters() {
    const output = el.output();
    const query = filterQuery.trim().toLowerCase();
    const hasKindFilters = enabledKinds.size > 0;
    const hasSourceFilters = enabledSources.size > 0;
    const hasQuery = query.length > 0;
    const lines = Array.from(output.querySelectorAll(".grouped-body .log-line"));
    for (const line of lines) {
      const kind = line.dataset.kind || "text";
      const source = line.dataset.source || "";
      const text = (line.textContent || "").toLowerCase();
      const kindMatch = !hasKindFilters || enabledKinds.has(kind);
      const sourceMatch = !hasSourceFilters || source !== "" && enabledSources.has(source);
      const queryMatch = !hasQuery || text.includes(query);
      line.style.display = kindMatch && sourceMatch && queryMatch ? "" : "none";
    }
    const nodes = Array.from(output.querySelectorAll(".grouped-node"));
    for (const node of nodes) {
      const nodeLines = Array.from(node.querySelectorAll(".grouped-body .log-line"));
      const visibleLines = nodeLines.filter((line) => line.style.display !== "none");
      const shouldHide = (hasKindFilters || hasSourceFilters || hasQuery) && nodeLines.length > 0 && visibleLines.length === 0;
      node.style.display = shouldHide ? "none" : "";
    }
  }
  __name(applyGroupedFilters, "applyGroupedFilters");
  function updateFilterButtons() {
    const buttons = Array.from(document.querySelectorAll(".log-filter-btn"));
    for (const button of buttons) {
      if (!button.dataset.kind && !button.dataset.source) {
        continue;
      }
      if (button.dataset.source) {
        const source = button.dataset.source;
        button.classList.toggle("active", enabledSources.has(source));
        continue;
      }
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
    const toggleAll = document.getElementById("toggleAllGroupsBtn");
    const pinBtn = document.getElementById("pinFiltersBtn");
    for (const button of buttons) {
      if (!button.dataset.kind && !button.dataset.source) {
        continue;
      }
      button.addEventListener("click", () => {
        if (button.dataset.source) {
          const source = button.dataset.source;
          if (enabledSources.has(source)) enabledSources.delete(source);
          else enabledSources.add(source);
          updateFilterButtons();
          applyGroupedFilters();
          saveState();
          return;
        }
        const kind = button.dataset.kind || "all";
        if (kind === "all") {
          enabledKinds.clear();
          enabledSources.clear();
        } else if (enabledKinds.has(kind)) {
          enabledKinds.delete(kind);
        } else {
          enabledKinds.add(kind);
        }
        updateFilterButtons();
        applyGroupedFilters();
        saveState();
      });
    }
    input?.addEventListener("input", () => {
      filterQuery = input.value;
      applyGroupedFilters();
      saveState();
    });
    clear?.addEventListener("click", () => {
      enabledKinds.clear();
      enabledSources.clear();
      filterQuery = "";
      if (input) input.value = "";
      updateFilterButtons();
      applyGroupedFilters();
      saveState();
    });
    toggleAll?.addEventListener("click", () => {
      const action = toggleAll.dataset.action || "collapse";
      if (action === "collapse") {
        collapseAllGroups();
        updateGroupsToggleButton(false);
      } else {
        expandAllGroups();
        updateGroupsToggleButton(true);
      }
      saveState();
    });
    pinBtn?.addEventListener("click", () => {
      pinFilters = !pinFilters;
      updatePinFiltersButton();
      if (!pinFilters) {
        enabledKinds.clear();
        enabledSources.clear();
        filterQuery = "";
        if (input) input.value = "";
        updateFilterButtons();
        applyGroupedFilters();
      }
      saveState();
    });
    const presets = Array.from(document.querySelectorAll(".preset-btn"));
    for (const btn of presets) {
      btn.addEventListener("click", () => {
        const preset = btn.dataset.preset || "bugfix";
        const prompt = el.prompt();
        if (preset === "bugfix") {
          prompt.value = "Find and fix the bug in the current feature. Keep changes minimal and safe, then verify.";
        } else if (preset === "refactor") {
          prompt.value = "Refactor the selected module for clarity and maintainability without changing behavior.";
        } else {
          prompt.value = "Add or improve tests for the changed behavior and cover key edge cases.";
        }
        prompt.focus();
        saveState();
      });
    }
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
  el.agentToggleBtn().addEventListener("click", () => {
    if (isAgentToggleOn()) {
      cmd.stopAgent();
      return;
    }
    cmd.startAgent();
  });
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
  function normalizePhoneCandidate(raw) {
    const normalized = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
    if (!normalized) return null;
    if (normalized.length < 7 || normalized.length > 15) return null;
    return normalized;
  }
  __name(normalizePhoneCandidate, "normalizePhoneCandidate");
  function setWhatsappAllowlistValidationError(message) {
    const input = document.getElementById("whatsappAllowedPhones");
    const error = document.getElementById("whatsappAllowedPhonesError");
    if (!input || !error) return;
    const hasError = !!message;
    input.classList.toggle("is-invalid", hasError);
    error.classList.toggle("hidden", !hasError);
    if (hasError) {
      error.textContent = message;
    }
  }
  __name(setWhatsappAllowlistValidationError, "setWhatsappAllowlistValidationError");
  function syncWhatsappAccessFields() {
    const mode = document.getElementById("whatsappAccessMode")?.value || "self";
    const field = document.getElementById("whatsappAllowedPhonesField");
    if (field) {
      field.classList.toggle("hidden", mode !== "allowlist");
    }
    if (mode !== "allowlist") {
      setWhatsappAllowlistValidationError(null);
    }
  }
  __name(syncWhatsappAccessFields, "syncWhatsappAccessFields");
  function validateWhatsappSettingsBeforeSave() {
    const mode = document.getElementById("whatsappAccessMode")?.value || "self";
    if (mode !== "allowlist") {
      setWhatsappAllowlistValidationError(null);
      return true;
    }
    const raw = document.getElementById("whatsappAllowedPhones")?.value || "";
    const tokens = raw.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
    const t = window.__tcTranslations || {};
    if (tokens.length === 0) {
      setWhatsappAllowlistValidationError(
        t.field_whatsapp_allowed_phones_error_required || "Add at least one phone for allowlist mode."
      );
      return false;
    }
    const invalid = tokens.find((item) => normalizePhoneCandidate(item) === null);
    if (invalid) {
      setWhatsappAllowlistValidationError(
        t.field_whatsapp_allowed_phones_error || "Enter valid phone list for allowlist mode."
      );
      return false;
    }
    setWhatsappAllowlistValidationError(null);
    return true;
  }
  __name(validateWhatsappSettingsBeforeSave, "validateWhatsappSettingsBeforeSave");
  el.saveSettingsBtn().addEventListener("click", () => {
    if (!validateWhatsappSettingsBeforeSave()) {
      return;
    }
    const settings = readForm();
    settings.allowOutOfWorkspace = deriveAllowOutOfWorkspaceByProfile(settings.safeModeProfile || "balanced");
    cmd.saveSettings(settings);
    updateComposerMeta();
  });
  var safeModeSelect = document.getElementById("safeModeProfile");
  safeModeSelect?.addEventListener("change", () => {
    syncSafeModeControls(safeModeSelect.value || "balanced");
  });
  var whatsappAccessModeSelect = document.getElementById("whatsappAccessMode");
  whatsappAccessModeSelect?.addEventListener("change", () => {
    syncWhatsappAccessFields();
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
    updateComposerMeta();
  });
  window.addEventListener("build-info", (e) => {
    const raw = String(e.detail || "");
    const match = raw.match(/version=([^;]+)/i);
    const version = (match?.[1] || "").trim();
    const versionEl = document.getElementById("aboutVersion");
    if (versionEl && version) {
      versionEl.textContent = version;
    }
  });
  window.addEventListener("run-summary", (e) => {
    updateRunSummaryCard(e.detail);
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
    window.__tcTranslations = t;
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
    setControlState(el.status().textContent ?? "");
    refreshToggleLabels();
    applyTooltipTranslations(t);
    const toggleAll = document.getElementById("toggleAllGroupsBtn");
    updateGroupsToggleButton((toggleAll?.dataset.action || "collapse") === "collapse");
  }
  __name(applyTranslations, "applyTranslations");
  window.addEventListener("message", (e) => {
    handleMessage(e.data);
    const anyExpanded = Array.from(document.querySelectorAll(".grouped-node")).some(
      (node) => node.classList.contains("expanded")
    );
    updateGroupsToggleButton(anyExpanded);
    const safeMode = document.getElementById("safeModeProfile")?.value || "balanced";
    syncSafeModeControls(safeMode);
    syncWhatsappAccessFields();
    updateComposerMeta();
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
    pinFilters = saved.pinFilters !== false;
    if (pinFilters && saved.filterQuery) {
      filterQuery = saved.filterQuery;
      const input = document.getElementById("logFilterQuery");
      if (input) input.value = filterQuery;
    }
    if (pinFilters && Array.isArray(saved.filterKinds)) {
      enabledKinds.clear();
      enabledSources.clear();
      for (const k of saved.filterKinds) {
        if (k === "telegram" || k === "whatsapp") enabledSources.add(k);
        else enabledKinds.add(k);
      }
    }
  }
  bindLogFilters();
  updateFilterButtons();
  updatePinFiltersButton();
  applyGroupedFilters();
  initStaticIcons();
  initTooltips();
  bindTaskResultActions();
  bindSafeModeStrip();
  syncWhatsappAccessFields();
  updateComposerMeta();
  setControlState(el.status().textContent ?? "");
  cmd.requestSettings();
  cmd.requestTaskResult();
})();
