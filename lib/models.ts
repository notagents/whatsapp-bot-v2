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
  KB_MD_DOCS_COLLECTION,
  KB_MD_CHUNKS_COLLECTION,
  KB_TABLES_COLLECTION,
  KB_ROWS_COLLECTION,
  KB_SYNC_RUNS_COLLECTION,
  FLOW_DOCUMENTS_COLLECTION,
  AGENT_PROMPT_DOCUMENTS_COLLECTION,
  SESSION_RUNTIME_CONFIG_COLLECTION,
} from "./db";
import type {
  KbMdDoc,
  KbMdChunk,
  KbTable,
  KbRow,
  KbSyncRun,
} from "./kb-v2/types";
import type { FlowConfig } from "./flows/types";

export type Message = {
  _id?: ObjectId;
  whatsappId: string;
  sessionId: string;
  userID: string;
  channel: "whatsapp" | "simulator";
  messageText: string;
  messageTime: number;
  source: "user" | "bot";
  processed: boolean;
  botMessageId?: string;
  configOverride?: "draft" | "published";
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
  channel?: "whatsapp" | "simulator";
  createdAt: number;
  messageIds: ObjectId[];
  text: string;
  status: TurnStatus;
  router?: TurnRouter;
  response?: TurnResponse;
  meta?: { rawEventIds?: string[]; flow?: TurnMetaFlow };
  configOverride?: "draft" | "published";
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
  kbUsage?: {
    mdChunks?: Array<{ docId?: string; chunkId: string; slug: string }>;
    tableRows?: Array<{ tableKey: string; pk: string }>;
  };
  aiClassification?: {
    selectedRoute: string;
    confidence: number;
    reasoning: string;
    routerType: "ai" | "keyword";
  };
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

export type JobType =
  | "debounceTurn"
  | "runAgent"
  | "sendReply"
  | "memoryUpdate"
  | "kbReindexMarkdown";

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

export type FlowDocumentStatus = "draft" | "published";

export type FlowDocument = {
  _id?: ObjectId;
  sessionId: string;
  type: "flow";
  name: string;
  status: FlowDocumentStatus;
  format: "json";
  text: string;
  parsed?: FlowConfig;
  schemaVersion: number;
  version: number;
  updatedAt: number;
  updatedBy: string;
  lastValidAt: number;
  lastError?: { message: string; at: number };
};

export type AgentPromptDocumentStatus = "draft" | "published";

export type AgentPromptToolsPolicy = {
  allowedTools?: string[];
  maxCallsPerRound?: number;
};

export type AgentPromptDocument = {
  _id?: ObjectId;
  sessionId: string;
  agentId: string;
  status: AgentPromptDocumentStatus;
  format: "text";
  systemPromptTemplate: string;
  model: string;
  temperature: number;
  maxToolRounds: number;
  toolsPolicy?: AgentPromptToolsPolicy;
  version: number;
  updatedAt: number;
  updatedBy: string;
  lastValidAt: number;
  lastError?: { message: string; at: number };
};

export type SessionRuntimeConfigMode =
  | "auto"
  | "force_draft"
  | "force_published";

export type SessionRuntimeConfig = {
  _id?: ObjectId;
  sessionId: string;
  configMode: SessionRuntimeConfigMode;
  updatedAt: number;
  updatedBy: string;
};

export async function ensureIndexes(): Promise<void> {
  const db = await getDb();
  const messages = db.collection<Message>(MESSAGES_COLLECTION);
  await messages.createIndex({ whatsappId: 1, messageTime: -1 });
  await messages.createIndex({ whatsappId: 1, processed: 1, source: 1 });
  const responsesEnabled = db.collection<ResponsesEnabled>(
    RESPONSES_ENABLED_COLLECTION
  );
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
  const conversationState = db.collection<ConversationStateDoc>(
    CONVERSATION_STATE_COLLECTION
  );
  await conversationState.createIndex({ whatsappId: 1 }, { unique: true });
  const locks = db.collection<{ key: string }>(LOCKS_COLLECTION);
  await locks.createIndex({ key: 1 }, { unique: true });
  const kbMdDocs = db.collection<KbMdDoc>(KB_MD_DOCS_COLLECTION);
  await kbMdDocs.createIndex({ sessionId: 1, slug: 1 }, { unique: true });
  await kbMdDocs.createIndex({ sessionId: 1, status: 1 });
  const kbMdChunks = db.collection<KbMdChunk>(KB_MD_CHUNKS_COLLECTION);
  await kbMdChunks.createIndex(
    { sessionId: 1, docId: 1, chunkId: 1 },
    { unique: true }
  );
  await kbMdChunks.createIndex({ text: "text" });
  const kbTables = db.collection<KbTable>(KB_TABLES_COLLECTION);
  await kbTables.createIndex({ sessionId: 1, tableKey: 1 }, { unique: true });
  const kbRows = db.collection<KbRow>(KB_ROWS_COLLECTION);
  await kbRows.createIndex(
    { sessionId: 1, tableKey: 1, pk: 1 },
    { unique: true }
  );
  await kbRows.createIndex({ sessionId: 1, tableKey: 1, "search.category": 1 });
  await kbRows.createIndex({ "search.name": "text" });
  const kbSyncRuns = db.collection<KbSyncRun>(KB_SYNC_RUNS_COLLECTION);
  await kbSyncRuns.createIndex(
    { sessionId: 1, tableKey: 1, batchId: 1 },
    { unique: true }
  );
  await kbSyncRuns.createIndex({ status: 1, receivedAt: -1 });
  const flowDocuments = db.collection<FlowDocument>(FLOW_DOCUMENTS_COLLECTION);
  await flowDocuments.createIndex(
    { sessionId: 1, type: 1, name: 1, status: 1 },
    { unique: true }
  );
  await flowDocuments.createIndex({ sessionId: 1, status: 1 });
  const agentPromptDocuments = db.collection<AgentPromptDocument>(
    AGENT_PROMPT_DOCUMENTS_COLLECTION
  );
  await agentPromptDocuments.createIndex(
    { sessionId: 1, agentId: 1, status: 1 },
    { unique: true }
  );
  await agentPromptDocuments.createIndex({ sessionId: 1, status: 1 });
  const sessionRuntimeConfig = db.collection<SessionRuntimeConfig>(
    SESSION_RUNTIME_CONFIG_COLLECTION
  );
  await sessionRuntimeConfig.createIndex({ sessionId: 1 }, { unique: true });
}
