import type { Agent } from "./types";
import { defaultAssistant } from "./default-assistant";

const agents: Map<string, Agent> = new Map([
  ["default_assistant", defaultAssistant],
]);

export function registerAgent(agent: Agent): void {
  agents.set(agent.id, agent);
}

export function getAgent(agentId: string): Agent {
  const agent = agents.get(agentId);
  if (agent) return agent;
  return defaultAssistant;
}
