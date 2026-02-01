import type { AgentPromptDocument, SessionRuntimeConfig } from "@/lib/models";
import {
  getDb,
  AGENT_PROMPT_DOCUMENTS_COLLECTION,
  SESSION_RUNTIME_CONFIG_COLLECTION,
} from "@/lib/db";
import { DEFAULT_SYSTEM_PROMPT_TEMPLATE } from "./default-assistant";
import { CAMI_DEFAULT_SYSTEM_PROMPT_TEMPLATE } from "./cami-default";
import { CAMI_RECOMMENDER_SYSTEM_PROMPT_TEMPLATE } from "./cami-recommender";

export type AgentConfig = {
  systemPromptTemplate: string;
  model: string;
  temperature: number;
  maxToolRounds: number;
  toolsPolicy?: { allowedTools?: string[]; maxCallsPerRound?: number };
};

type Channel = "whatsapp" | "simulator";
type Status = "draft" | "published";
type ConfigMode = SessionRuntimeConfig["configMode"];

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOOL_ROUNDS = 5;

const FALLBACK_CONFIGS: Record<string, AgentConfig> = {
  default_assistant: {
    systemPromptTemplate: DEFAULT_SYSTEM_PROMPT_TEMPLATE,
    model: DEFAULT_MODEL,
    temperature: DEFAULT_TEMPERATURE,
    maxToolRounds: DEFAULT_MAX_TOOL_ROUNDS,
  },
  cami_default: {
    systemPromptTemplate: CAMI_DEFAULT_SYSTEM_PROMPT_TEMPLATE,
    model: DEFAULT_MODEL,
    temperature: DEFAULT_TEMPERATURE,
    maxToolRounds: DEFAULT_MAX_TOOL_ROUNDS,
  },
  cami_recommender: {
    systemPromptTemplate: CAMI_RECOMMENDER_SYSTEM_PROMPT_TEMPLATE,
    model: DEFAULT_MODEL,
    temperature: DEFAULT_TEMPERATURE,
    maxToolRounds: DEFAULT_MAX_TOOL_ROUNDS,
  },
};

const CACHE_TTL_MS = 5_000;
const cache = new Map<string, { config: AgentConfig; expiresAt: number }>();

function cacheKey(sessionId: string, agentId: string, status: Status): string {
  return `prompt:${sessionId}:${agentId}:${status}`;
}

function getCached(
  sessionId: string,
  agentId: string,
  status: Status
): AgentConfig | null {
  const entry = cache.get(cacheKey(sessionId, agentId, status));
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.config;
}

function setCached(
  sessionId: string,
  agentId: string,
  status: Status,
  config: AgentConfig
): void {
  cache.set(cacheKey(sessionId, agentId, status), {
    config,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function resolveStatus(
  channel: Channel,
  configMode: ConfigMode,
  override?: Status
): Status {
  if (override) return override;
  if (configMode === "force_draft") return "draft";
  if (configMode === "force_published") return "published";
  return channel === "simulator" ? "draft" : "published";
}

function docToConfig(doc: AgentPromptDocument): AgentConfig {
  return {
    systemPromptTemplate: doc.systemPromptTemplate,
    model: doc.model,
    temperature: doc.temperature,
    maxToolRounds: doc.maxToolRounds,
    toolsPolicy: doc.toolsPolicy,
  };
}

export function getFallbackConfig(agentId: string): AgentConfig {
  const fallback = FALLBACK_CONFIGS[agentId];
  if (fallback) return fallback;
  return {
    systemPromptTemplate: DEFAULT_SYSTEM_PROMPT_TEMPLATE,
    model: DEFAULT_MODEL,
    temperature: DEFAULT_TEMPERATURE,
    maxToolRounds: DEFAULT_MAX_TOOL_ROUNDS,
  };
}

export async function resolveAgentConfig(
  sessionId: string,
  agentId: string,
  channel: Channel,
  override?: Status
): Promise<AgentConfig> {
  const db = await getDb();
  const configCol = db.collection<SessionRuntimeConfig>(
    SESSION_RUNTIME_CONFIG_COLLECTION
  );
  const configDoc = await configCol.findOne({ sessionId });
  const configMode: ConfigMode = configDoc?.configMode ?? "auto";
  const status = resolveStatus(channel, configMode, override);

  const cached = getCached(sessionId, agentId, status);
  if (cached) return cached;

  const promptCol = db.collection<AgentPromptDocument>(
    AGENT_PROMPT_DOCUMENTS_COLLECTION
  );
  let doc =
    (await promptCol.findOne({
      sessionId,
      agentId,
      status,
    })) ??
    (await promptCol.findOne({
      sessionId: "*",
      agentId,
      status,
    }));

  if (doc) {
    const config = docToConfig(doc);
    setCached(sessionId, agentId, status, config);
    return config;
  }

  const fallback = getFallbackConfig(agentId);
  setCached(sessionId, agentId, status, fallback);
  return fallback;
}

export function clearPromptResolverCache(
  sessionId?: string,
  agentId?: string
): void {
  if (!sessionId && !agentId) {
    cache.clear();
    return;
  }
  const keys = Array.from(cache.keys());
  for (const key of keys) {
    const matchSession = !sessionId || key.startsWith(`prompt:${sessionId}:`);
    const matchAgent = !agentId || key.includes(`:${agentId}:`);
    if (matchSession && matchAgent) cache.delete(key);
  }
}
