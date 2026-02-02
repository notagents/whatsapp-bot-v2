import type { ObjectId } from "mongodb";
import OpenAI from "openai";
import { getDb } from "./db";
import {
  MESSAGES_COLLECTION,
  MEMORY_COLLECTION,
  SESSION_CONTEXT_CONFIG_COLLECTION,
} from "./db";
import type { Message, Memory, SessionContextConfig } from "./models";
import type { ContextSchema } from "./context-schema";
import {
  buildExtractionPrompt,
  deriveSchemaFromFSM,
  parseBySchema,
} from "./context-schema";
import { resolveFlow } from "./flows/resolver";
import type { FSMFlowConfig } from "./flows/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONTEXT_TTL_HOURS = Number(process.env.CONTEXT_TTL_HOURS) || 24;
const ENABLE_STRUCTURED_CONTEXT =
  process.env.ENABLE_STRUCTURED_CONTEXT !== "false";
const EXTRACTOR_MODEL = "gpt-4o-mini";
const RECENT_MESSAGES_FOR_EXTRACTION = 15;

const EXTRACTED_AT_KEY = "_extractedAt";
const SCHEMA_VERSION_KEY = "_schemaVersion";

function conversationFromMessages(messages: Message[]): string {
  return messages
    .map((m) =>
      m.source === "user"
        ? `Usuario: ${m.messageText}`
        : `Bot: ${m.messageText}`
    )
    .join("\n");
}

function getExtractedAt(
  existing: Record<string, unknown> | null | undefined
): number {
  if (!existing) return 0;
  const v = existing[EXTRACTED_AT_KEY] ?? existing["extractedAt"];
  return typeof v === "number" ? v : 0;
}

export function shouldResetContext(
  lastUpdated: number,
  ttlHours: number = CONTEXT_TTL_HOURS
): boolean {
  const elapsed = Date.now() - lastUpdated;
  const ttlMs = ttlHours * 60 * 60 * 1000;
  return elapsed > ttlMs;
}

export async function loadContextSchema(
  sessionId: string
): Promise<ContextSchema | null> {
  const db = await getDb();
  const config = await db
    .collection<SessionContextConfig>(SESSION_CONTEXT_CONFIG_COLLECTION)
    .findOne({ sessionId });

  if (config?.enabled && config.schema) {
    return config.schema;
  }

  const resolved = await resolveFlow(sessionId, "whatsapp");
  if (resolved.config.mode === "fsm") {
    return deriveSchemaFromFSM(sessionId, resolved.config as FSMFlowConfig);
  }

  return null;
}

function mergeContext(
  existing: Record<string, unknown> | null | undefined,
  extracted: Record<string, unknown>,
  extractedAt: number,
  schemaVersion: number,
  turnId?: ObjectId
): Record<string, unknown> {
  const base = existing ?? {};
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(extracted)) {
    if (v !== undefined && v !== null) {
      out[k] = v;
    } else if (base[k] !== undefined && base[k] !== null) {
      out[k] = base[k];
    }
  }
  out[EXTRACTED_AT_KEY] = extractedAt;
  out[SCHEMA_VERSION_KEY] = schemaVersion;
  if (turnId) out["_lastUpdatedTurn"] = turnId;
  return out;
}

export async function extractStructuredContext(
  whatsappId: string,
  sessionId: string,
  recentMessages: Message[],
  existing: Record<string, unknown> | null | undefined,
  turnId?: ObjectId
): Promise<Record<string, unknown> | null> {
  if (!ENABLE_STRUCTURED_CONTEXT || recentMessages.length === 0) {
    const at = getExtractedAt(existing);
    if (existing && at > 0 && !shouldResetContext(at)) {
      return existing;
    }
    return null;
  }

  const schema = await loadContextSchema(sessionId);
  if (!schema) {
    return existing ?? null;
  }

  const extractedAt = getExtractedAt(existing);
  if (extractedAt > 0 && shouldResetContext(extractedAt)) {
    const now = Date.now();
    return mergeContext(null, {}, now, schema.version, turnId);
  }

  const conversation = conversationFromMessages(recentMessages);
  if (!conversation.trim()) return existing ?? null;

  try {
    const prompt = buildExtractionPrompt(schema, conversation);
    const completion = await openai.chat.completions.create({
      model: EXTRACTOR_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 512,
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return existing ?? null;

    const extracted = parseBySchema(content, schema);
    const now = Date.now();
    const merged = mergeContext(
      existing,
      extracted,
      now,
      schema.version,
      turnId
    );
    return merged;
  } catch {
    return existing ?? null;
  }
}

export async function loadRecentMessagesForExtraction(
  whatsappId: string
): Promise<Message[]> {
  const db = await getDb();
  const messages = await db
    .collection<Message>(MESSAGES_COLLECTION)
    .find({ whatsappId })
    .sort({ messageTime: -1 })
    .limit(RECENT_MESSAGES_FOR_EXTRACTION)
    .toArray();
  return messages.reverse();
}

export async function persistStructuredContext(
  whatsappId: string,
  structured: Record<string, unknown> | null
): Promise<void> {
  const db = await getDb();
  const col = db.collection<Memory>(MEMORY_COLLECTION);
  if (structured === null) {
    await col.updateOne(
      { whatsappId },
      { $unset: { structuredContext: "" } },
      { upsert: false }
    );
    return;
  }
  await col.updateOne(
    { whatsappId },
    {
      $set: { structuredContext: structured },
      $setOnInsert: {
        whatsappId,
        userID: whatsappId,
        facts: [],
        recap: { text: "", updatedAt: 0 },
      },
    },
    { upsert: true }
  );
}

export function formatStructuredContextForPrompt(
  structured: Record<string, unknown> | null | undefined
): string {
  if (!structured || typeof structured !== "object") return "ninguno";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(structured)) {
    if (key.startsWith("_")) continue;
    if (value == null) continue;
    const label = key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .toLowerCase()
      .trim();
    parts.push(`${label}: ${value}`);
  }
  return parts.length > 0 ? parts.join("; ") : "ninguno";
}
