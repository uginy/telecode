import type { AgentTool } from "@mariozechner/pi-agent-core";
import { buildRuntimeConfig, createRuntimeSignature } from "../agent/runtimeSession";
import { getEffectiveAgentPolicy } from "../agent/runtimePolicy";
import type { TaskRunner } from "../agent/taskRunner";
import type { AgentSettings } from "../config/settings";
import type { AgentRuntime } from "../engine/types";

export function ensureChannelRuntime(options: {
	settings: AgentSettings;
	tools: AgentTool[];
	taskRunner: TaskRunner;
	runtimeConfigSignature: string;
	workspaceRoot: string;
	onLog: (line: string) => void;
	initLogLine: string;
}): { runtime: AgentRuntime; signature: string } {
	const policy = getEffectiveAgentPolicy(options.settings);
	const config = buildRuntimeConfig(options.settings, {
		cwd: options.workspaceRoot,
		allowedTools: policy.allowedTools,
		allowOutOfWorkspace: policy.allowOutOfWorkspace,
	});
	const signature = createRuntimeSignature(config, options.tools);

	if (
		options.taskRunner.runtime &&
		options.runtimeConfigSignature === signature
	) {
		return {
			runtime: options.taskRunner.runtime,
			signature,
		};
	}

	options.onLog(options.initLogLine);
	return {
		runtime: options.taskRunner.initRuntime(config, options.tools),
		signature,
	};
}
