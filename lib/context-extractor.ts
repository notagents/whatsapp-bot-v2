import type { ObjectId } from "mongodb";
import OpenAI from "openai";
import { getDb } from "./db";
import { MESSAGES_COLLECTION, MEMORY_COLLECTION } from "./db";
import type { Message, Memory, StructuredContext } from "./models";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONTEXT_TTL_HOURS = Number(process.env.CONTEXT_TTL_HOURS) || 24;
const ENABLE_STRUCTURED_CONTEXT =
  process.env.ENABLE_STRUCTURED_CONTEXT !== "false";
const EXTRACTOR_MODEL = "gpt-4o-mini";
const RECENT_MESSAGES_FOR_EXTRACTION = 15;

export type { StructuredContext };

const EXTRACT_STRUCTURED_PROMPT = `Analiza esta conversacion de WhatsApp entre usuario y bot de una tienda de cultivo (semillas, sustratos, iluminacion, etc).
Extrae SOLO informacion que el USUARIO haya dicho explícitamente o que se infiera claramente de sus mensajes.
Responde SOLO con un JSON valido, sin markdown, con estas claves (usa null si no aplica):
- environment: "interior" | "exterior" si el usuario dijo donde va a cultivar
- seedType: "automatica" | "fotoperiodica" si el usuario eligio tipo de semilla
- budget: numero en pesos (ej: 35000) si el usuario menciono presupuesto
- space: string si dijo donde (placard, habitacion, balcon, etc)
- plantCount: numero si dijo cuantas plantas
- hasEquipment: true/false si dijo que tiene algo comprado o arranca de cero

Ejemplo: {"environment":"interior","seedType":"automatica","budget":35000,"space":"placard","plantCount":3,"hasEquipment":false}

Conversacion:
`;

function conversationFromMessages(messages: Message[]): string {
  return messages
    .map((m) =>
      m.source === "user"
        ? `Usuario: ${m.messageText}`
        : `Bot: ${m.messageText}`
    )
    .join("\n");
}

function parseExtraction(raw: string): Partial<StructuredContext> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<StructuredContext> = {};
    if (
      parsed.environment === "interior" ||
      parsed.environment === "exterior"
    ) {
      out.environment = parsed.environment;
    }
    if (
      parsed.seedType === "automatica" ||
      parsed.seedType === "fotoperiodica"
    ) {
      out.seedType = parsed.seedType;
    }
    if (typeof parsed.budget === "number" && parsed.budget > 0) {
      out.budget = parsed.budget;
    }
    if (typeof parsed.space === "string" && parsed.space.trim()) {
      out.space = parsed.space.trim();
    }
    if (typeof parsed.plantCount === "number" && parsed.plantCount > 0) {
      out.plantCount = parsed.plantCount;
    }
    if (typeof parsed.hasEquipment === "boolean") {
      out.hasEquipment = parsed.hasEquipment;
    }
    return out;
  } catch {
    return {};
  }
}

function mergeStructuredContext(
  existing: StructuredContext | null | undefined,
  extracted: Partial<StructuredContext>,
  extractedAt: number,
  lastUpdatedTurn?: ObjectId
): StructuredContext {
  const base = existing ?? { extractedAt: 0 };
  return {
    environment: extracted.environment ?? base.environment,
    seedType: extracted.seedType ?? base.seedType,
    budget: extracted.budget ?? base.budget,
    space: extracted.space ?? base.space,
    plantCount: extracted.plantCount ?? base.plantCount,
    hasEquipment: extracted.hasEquipment ?? base.hasEquipment,
    extractedAt,
    lastUpdatedTurn: lastUpdatedTurn ?? base.lastUpdatedTurn,
  };
}

export function shouldResetContext(
  lastUpdated: number,
  ttlHours: number = CONTEXT_TTL_HOURS
): boolean {
  const elapsed = Date.now() - lastUpdated;
  const ttlMs = ttlHours * 60 * 60 * 1000;
  return elapsed > ttlMs;
}

export async function extractStructuredContext(
  whatsappId: string,
  recentMessages: Message[],
  existing: StructuredContext | null | undefined,
  turnId?: ObjectId
): Promise<StructuredContext | null> {
  if (!ENABLE_STRUCTURED_CONTEXT || recentMessages.length === 0) {
    if (existing && !shouldResetContext(existing.extractedAt)) {
      return existing;
    }
    return null;
  }
  if (existing && shouldResetContext(existing.extractedAt)) {
    const now = Date.now();
    return mergeStructuredContext(null, {}, now, turnId);
  }
  const conversation = conversationFromMessages(recentMessages);
  if (!conversation.trim()) return existing ?? null;
  try {
    const completion = await openai.chat.completions.create({
      model: EXTRACTOR_MODEL,
      messages: [
        {
          role: "user",
          content: EXTRACT_STRUCTURED_PROMPT + conversation,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 256,
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return existing ?? null;
    const extracted = parseExtraction(content);
    const now = Date.now();
    const merged = mergeStructuredContext(existing, extracted, now, turnId);
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
  structured: StructuredContext | null
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
  structured: StructuredContext | null | undefined
): string {
  if (!structured) return "ninguno";
  const parts: string[] = [];
  if (structured.environment) parts.push(`ambiente: ${structured.environment}`);
  if (structured.seedType)
    parts.push(`tipo de semilla: ${structured.seedType}`);
  if (structured.budget != null)
    parts.push(`presupuesto: ${structured.budget} pesos`);
  if (structured.space) parts.push(`espacio: ${structured.space}`);
  if (structured.plantCount != null)
    parts.push(`cantidad de plantas: ${structured.plantCount}`);
  if (structured.hasEquipment != null)
    parts.push(`tiene equipo: ${structured.hasEquipment ? "si" : "no"}`);
  if (parts.length === 0) return "ninguno";
  return parts.join("; ");
}
