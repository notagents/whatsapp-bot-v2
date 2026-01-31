import type { ObjectId } from "mongodb";
import {
  getDb,
  MESSAGES_COLLECTION,
  RESPONSES_ENABLED_COLLECTION,
  TURNS_COLLECTION,
  AGENT_RUNS_COLLECTION,
  MEMORY_COLLECTION,
  JOBS_COLLECTION,
  CONVERSATION_STATE_COLLECTION,
  LOCKS_COLLECTION,
} from "./db";

export type Message = {
  _id?: ObjectId;
  whatsappId: string;
  sessionId: string;
  userID: string;
  channel: "whatsapp";
  messageText: string;
  messageTime: number;
  source: "user" | "bot";
  processed: boolean;
  botMessageId?: string;
};

export type ResponsesEnabled = {
  whatsappId: string;
  sessionId: string;
  userID: string;
  enabled: boolean;
  updatedAt: number;
  disabledUntilUTC?: string;
};

export type TurnStatus = "queued" | "running" | "done" | "failed" | "blocked";

export type TurnRouter = {
  agentId: string;
  reason: string;
  confidence: number;
};

export type TurnResponse = {
  text?: string;
  messageId?: ObjectId;
  sentAt?: number;
  blockedReason?: string;
};

export type TurnMetaFlow = {
  mode: "simple" | "fsm";
  flowPath: string;
  state?: string;
  kbUsed?: boolean;
  kbChunks?: number;
};

export type Turn = {
  _id?: ObjectId;
  whatsappId: string;
  sessionId: string;
  userID: string;
  createdAt: number;
  messageIds: ObjectId[];
  text: string;
  status: TurnStatus;
  router?: TurnRouter;
  response?: TurnResponse;
  meta?: { rawEventIds?: string[]; flow?: TurnMetaFlow };
};

export type AgentRunStatus = "running" | "success" | "error";

export type AgentRunInputMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AgentRunInput = {
  systemPromptVersion: string;
  messages: AgentRunInputMessage[];
  context: {
    recentMessages: Message[];
    memory: Memory;
    state: Record<string, unknown>;
  };
};

export type AgentRunOutput = {
  assistantText?: string;
  toolCalls?: Array<{ name: string; args: unknown; result: unknown }>;
  tokens?: { in?: number; out?: number };
};

export type AgentRun = {
  _id?: ObjectId;
  turnId: ObjectId;
  whatsappId: string;
  agentId: string;
  startedAt: number;
  endedAt?: number;
  status: AgentRunStatus;
  input: AgentRunInput;
  output?: AgentRunOutput;
  error?: { message: string; stack?: string };
};

export type MemoryFact = {
  key: string;
  value: string;
  confidence: number;
  updatedAt: number;
};

export type MemoryRecap = {
  text: string;
  updatedAt: number;
};

export type Memory = {
  _id?: ObjectId;
  whatsappId: string;
  userID: string;
  facts: MemoryFact[];
  recap: MemoryRecap;
};

export type JobType = "debounceTurn" | "runAgent" | "sendReply" | "memoryUpdate";

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export type Job = {
  _id?: ObjectId;
  type: JobType;
  status: JobStatus;
  payload: unknown;
  scheduledFor: number;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
};

export type ConversationStateDoc = {
  _id?: ObjectId;
  whatsappId: string;
  state: Record<string, unknown>;
  updatedAt: number;
};

export async function ensureIndexes(): Promise<void> {
  const db = await getDb();
  const messages = db.collection<Message>(MESSAGES_COLLECTION);
  await messages.createIndex({ whatsappId: 1, messageTime: -1 });
  await messages.createIndex({ whatsappId: 1, processed: 1, source: 1 });
  const responsesEnabled = db.collection<ResponsesEnabled>(RESPONSES_ENABLED_COLLECTION);
  await responsesEnabled.createIndex({ whatsappId: 1 }, { unique: true });
  const turns = db.collection<Turn>(TURNS_COLLECTION);
  await turns.createIndex({ whatsappId: 1, createdAt: -1 });
  await turns.createIndex({ status: 1, createdAt: -1 });
  const agentRuns = db.collection<AgentRun>(AGENT_RUNS_COLLECTION);
  await agentRuns.createIndex({ turnId: 1 });
  await agentRuns.createIndex({ whatsappId: 1, startedAt: -1 });
  await agentRuns.createIndex({ status: 1, startedAt: -1 });
  const memory = db.collection<Memory>(MEMORY_COLLECTION);
  await memory.createIndex({ whatsappId: 1 }, { unique: true });
  const jobs = db.collection<Job>(JOBS_COLLECTION);
  await jobs.createIndex({ status: 1, scheduledFor: 1 });
  await jobs.createIndex({ type: 1, status: 1 });
  const conversationState = db.collection<ConversationStateDoc>(CONVERSATION_STATE_COLLECTION);
  await conversationState.createIndex({ whatsappId: 1 }, { unique: true });
  const locks = db.collection<{ key: string }>(LOCKS_COLLECTION);
  await locks.createIndex({ key: 1 }, { unique: true });
}
