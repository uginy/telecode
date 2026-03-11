import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { AgentSettings } from "../config/settings";
import { createWorkspaceTools, filterToolsByAllowed } from "../tools";

type SafeModeProfile = "strict" | "balanced" | "power";

export type EffectiveAgentPolicy = {
	allowedTools: string[];
	allowOutOfWorkspace: boolean;
};

export function getEffectiveAgentPolicy(
	agent: AgentSettings,
): EffectiveAgentPolicy {
	const profile = agent.safeModeProfile as SafeModeProfile;
	if (profile === "strict") {
		return {
			allowedTools: ["read", "glob", "grep"],
			allowOutOfWorkspace: false,
		};
	}
	if (profile === "power") {
		return {
			allowedTools: [],
			allowOutOfWorkspace: true,
		};
	}
	return {
		allowedTools: agent.allowedTools,
		allowOutOfWorkspace: false,
	};
}

export function resolveAgentTools(agent: AgentSettings): {
	policy: EffectiveAgentPolicy;
	tools: AgentTool[];
} {
	const policy = getEffectiveAgentPolicy(agent);
	const allTools = createWorkspaceTools();
	const tools =
		policy.allowedTools.length === 0
			? allTools
			: filterToolsByAllowed(allTools, policy.allowedTools);

	return { policy, tools };
}
