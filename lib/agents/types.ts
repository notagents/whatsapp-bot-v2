import type { ObjectId } from "mongodb";
import type { Turn, Message, Memory } from "../models";

export type KBChunkRef = { text: string; source: string };

export type AgentContext = {
  recentMessages: Message[];
  memory: Memory;
  state: Record<string, unknown>;
  kbChunks?: KBChunkRef[];
};

export type ToolCall = {
  name: string;
  args: unknown;
  result: unknown;
};

export type Action = {
  type: "SEND_MESSAGE" | "SET_STATE" | "DISABLE_AUTO";
  payload: unknown;
};

export type AgentRunParams = {
  turnId: ObjectId;
  turn: Turn;
  context: AgentContext;
  tools: ToolSet;
};

export type AgentRunResult = {
  assistantText?: string;
  toolCalls?: ToolCall[];
  actions?: Action[];
  kbUsage?: {
    mdChunks?: Array<{ docId?: string; chunkId: string; slug: string }>;
    tableRows?: Array<{ tableKey: string; pk: string }>;
  };
};

export interface ToolSet {
  definitions?: import("openai").Chat.Completions.ChatCompletionTool[];
  execute(name: string, args: unknown): Promise<unknown>;
}

export interface Agent {
  id: string;
  systemPrompt: string;
  version: string;
  run(params: AgentRunParams): Promise<AgentRunResult>;
}
