import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { AgentSettings } from "../config/settings";
import type { RuntimeConfig, RuntimeEvent } from "../engine/types";
import { getPromptStackSignature } from "../prompts/promptStack";
import { TaskRunner, type TaskRunnerState } from "./taskRunner";

export function buildRuntimeConfig(
	agent: AgentSettings,
	options: {
		cwd: string;
		allowedTools?: string[];
		allowOutOfWorkspace?: boolean;
	},
): RuntimeConfig {
	return {
		...agent,
		allowedTools: options.allowedTools ?? agent.allowedTools,
		allowOutOfWorkspace:
			options.allowOutOfWorkspace ?? agent.allowOutOfWorkspace,
		cwd: options.cwd,
		language: agent.language === "auto" ? undefined : agent.language,
	};
}

export function createRuntimeSignature(
	config: RuntimeConfig,
	tools: AgentTool[],
): string {
	return JSON.stringify({
		provider: config.provider,
		model: config.model,
		baseUrl: config.baseUrl || "",
		maxSteps: config.maxSteps,
		apiKeySet: config.apiKey.length > 0,
		allowedTools: config.allowedTools,
		tools: tools.map((tool) => tool.name),
		language: config.language,
		responseStyle: config.responseStyle,
		promptSignature: getPromptStackSignature(config.cwd),
	});
}

export function createTaskRunner(options: {
	onEvent: (event: RuntimeEvent) => void;
	onStateChange: (state: TaskRunnerState) => void;
	workspaceRoot?: string;
	watchdogTimeoutMs?: number;
}): TaskRunner {
	return new TaskRunner(
		options.onEvent,
		options.onStateChange,
		options.watchdogTimeoutMs,
		options.workspaceRoot,
	);
}
