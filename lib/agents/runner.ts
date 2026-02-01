import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { AGENT_RUNS_COLLECTION } from "@/lib/db";
import type { AgentRun, Turn } from "@/lib/models";
import type { Agent, AgentRunParams, AgentRunResult } from "./types";
import { createToolSet, type KbToolConfig } from "./tools";

export type ExecuteAgentRunParams = {
  turnId: ObjectId;
  agentId: string;
  turn: Turn;
  context: AgentRunParams["context"];
  agent: Agent;
  kbConfig?: KbToolConfig;
  aiClassification?: {
    selectedRoute: string;
    confidence: number;
    reasoning: string;
    routerType: "ai" | "keyword";
  };
};

export async function executeAgentRun(
  params: ExecuteAgentRunParams
): Promise<AgentRun> {
  const { turnId, agentId, turn, context, agent, kbConfig, aiClassification } =
    params;
  const db = await getDb();
  const tools = createToolSet(turn.whatsappId, turn.sessionId, kbConfig);
  const runParams: AgentRunParams = {
    turnId,
    turn,
    context,
    tools,
  };
  const startedAt = Date.now();
  const input = {
    systemPromptVersion: agent.version,
    messages: [
      { role: "system" as const, content: agent.systemPrompt },
      { role: "user" as const, content: turn.text },
    ],
    context: {
      recentMessages: context.recentMessages,
      memory: context.memory,
      state: context.state,
    },
  };
  const runDoc: Omit<AgentRun, "_id"> = {
    turnId,
    whatsappId: turn.whatsappId,
    agentId,
    startedAt,
    status: "running",
    input,
  };
  const col = db.collection<AgentRun>(AGENT_RUNS_COLLECTION);
  const insertResult = await col.insertOne(runDoc as AgentRun);
  const runId = insertResult.insertedId;
  let agentResult: AgentRunResult;
  try {
    agentResult = await agent.run(runParams);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    await col.updateOne(
      { _id: runId },
      {
        $set: {
          status: "error" as const,
          endedAt: Date.now(),
          error: { message: errorMessage, stack: errorStack },
        },
      }
    );
    throw err;
  }
  await col.updateOne(
    { _id: runId },
    {
      $set: {
        status: "success" as const,
        endedAt: Date.now(),
        output: {
          assistantText: agentResult.assistantText,
          toolCalls: agentResult.toolCalls,
          ...(agentResult.kbUsage && { kbUsage: agentResult.kbUsage }),
          ...(aiClassification && { aiClassification }),
        },
      },
    }
  );
  const updated = await col.findOne({ _id: runId });
  return updated!;
}

export { getAgent } from "./registry";
