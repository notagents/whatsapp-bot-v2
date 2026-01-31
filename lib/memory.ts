import OpenAI from "openai";
import { getDb } from "./db";
import { MEMORY_COLLECTION } from "./db";
import type { Turn, Memory, MemoryFact } from "./models";
import { getRecentTurns } from "./turns";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type FactInput = { key: string; value: string; confidence: number };

const EXTRACT_FACTS_PROMPT = `Analiza esta conversación y extrae hechos importantes sobre el usuario.
Responde SOLO con un objeto JSON que tenga una clave "facts" con un array de objetos.
Cada objeto: { "key": "nombre_campo", "value": "valor", "confidence": 0.0 a 1.0 }

Ejemplo: { "facts": [ { "key": "user_name", "value": "Juan", "confidence": 0.95 } ] }

Conversación:
`;

export async function extractFactsFromTurn(turn: Turn): Promise<FactInput[]> {
  if (!turn.text.trim()) return [];
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "user",
        content: EXTRACT_FACTS_PROMPT + turn.text,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as { facts?: FactInput[] };
    const facts = parsed.facts ?? [];
    return facts.filter(
      (f) =>
        typeof f.key === "string" &&
        typeof f.value === "string" &&
        typeof f.confidence === "number"
    );
  } catch {
    return [];
  }
}

export async function upsertMemoryFacts(
  whatsappId: string,
  userID: string,
  newFacts: FactInput[]
): Promise<void> {
  if (newFacts.length === 0) return;
  const db = await getDb();
  const col = db.collection<Memory>(MEMORY_COLLECTION);
  const now = Date.now();
  await col.updateOne(
    { whatsappId },
    {
      $setOnInsert: { whatsappId, userID, facts: [], recap: { text: "", updatedAt: 0 } },
    },
    { upsert: true }
  );
  for (const fact of newFacts) {
    const doc: MemoryFact = {
      key: fact.key,
      value: fact.value,
      confidence: Math.min(1, Math.max(0, fact.confidence)),
      updatedAt: now,
    };
    const existing = await col.findOne({
      whatsappId,
      "facts.key": fact.key,
    });
    if (existing) {
      await col.updateOne(
        { whatsappId, "facts.key": fact.key },
        { $set: { "facts.$.value": doc.value, "facts.$.confidence": doc.confidence, "facts.$.updatedAt": doc.updatedAt } }
      );
    } else {
      await col.updateOne(
        { whatsappId },
        { $push: { facts: doc } }
      );
    }
  }
}

const RECAP_PROMPT = `Resume en 2-3 oraciones el contexto general de esta conversación (en español):

`;

export async function generateRecap(turns: Turn[]): Promise<string> {
  if (turns.length === 0) return "";
  const conversationText = turns
    .reverse()
    .map(
      (t) =>
        `Usuario: ${t.text}\nBot: ${t.response?.text ?? "(sin respuesta)"}`
    )
    .join("\n\n");
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: RECAP_PROMPT + conversationText }],
    temperature: 0.3,
    max_tokens: 150,
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

export async function updateMemoryRecap(whatsappId: string, recap: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.collection<Memory>(MEMORY_COLLECTION).updateOne(
    { whatsappId },
    {
      $set: { "recap.text": recap, "recap.updatedAt": now },
      $setOnInsert: { whatsappId, userID: whatsappId, facts: [] },
    },
    { upsert: true }
  );
}
