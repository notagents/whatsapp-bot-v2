import { getDb } from "@/lib/db";
import { KB_SYNONYMS_CONFIG_COLLECTION } from "@/lib/db";
import type { KbSynonymsConfig, KbSynonymGroup } from "@/lib/kb-v2/types";

const CACHE_TTL_MS = 60_000;
const cache = new Map<
  string,
  { config: KbSynonymsConfig | null; expires: number }
>();

export async function getSynonymsConfig(
  sessionId: string
): Promise<KbSynonymsConfig | null> {
  const key = sessionId;
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && entry.expires > now) {
    return entry.config;
  }
  const db = await getDb();
  const doc = await db
    .collection<KbSynonymsConfig>(KB_SYNONYMS_CONFIG_COLLECTION)
    .findOne({ sessionId });
  const config = doc ?? null;
  cache.set(key, { config, expires: now + CACHE_TTL_MS });
  return config;
}

export async function expandQueryWithSynonyms(
  query: string,
  sessionId: string,
  tableKey?: string
): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;
  const config = await getSynonymsConfig(sessionId);
  if (!config?.synonymGroups?.length) return trimmed;
  const qLower = trimmed.toLowerCase();
  const added = new Set<string>();
  const words = qLower.split(/\s+/).filter(Boolean);
  for (const group of config.synonymGroups) {
    if (!group.enabled) continue;
    if (
      group.category != null &&
      tableKey != null &&
      group.category !== tableKey
    )
      continue;
    const terms = group.terms ?? [];
    const normalizedTerms = terms
      .map((t) => t.toLowerCase().trim())
      .filter(Boolean);
    const hasMatch = words.some((w) =>
      normalizedTerms.some((t) => t === w || t.includes(w) || w.includes(t))
    );
    if (hasMatch) {
      for (const t of normalizedTerms) {
        if (!words.includes(t)) added.add(t);
      }
    }
  }
  if (added.size === 0) return trimmed;
  return [trimmed, ...added].join(" ");
}

export function invalidateSynonymsCache(sessionId: string): void {
  cache.delete(sessionId);
}

export async function upsertSynonymsConfig(
  sessionId: string,
  synonymGroups: KbSynonymGroup[]
): Promise<KbSynonymsConfig> {
  const now = Date.now();
  const doc: KbSynonymsConfig = {
    sessionId,
    synonymGroups,
    updatedAt: now,
  };
  const db = await getDb();
  await db
    .collection<KbSynonymsConfig>(KB_SYNONYMS_CONFIG_COLLECTION)
    .updateOne(
      { sessionId },
      { $set: { synonymGroups, updatedAt: now } },
      { upsert: true }
    );
  invalidateSynonymsCache(sessionId);
  return doc;
}

export async function addSynonymGroup(
  sessionId: string,
  group: KbSynonymGroup
): Promise<KbSynonymsConfig | null> {
  const db = await getDb();
  const col = db.collection<KbSynonymsConfig>(KB_SYNONYMS_CONFIG_COLLECTION);
  const now = Date.now();
  const existing = await col.findOne({ sessionId });
  const groups = existing?.synonymGroups ?? [];
  const updated = { synonymGroups: [...groups, group], updatedAt: now };
  const result = await col.updateOne(
    { sessionId },
    { $set: updated },
    { upsert: true }
  );
  invalidateSynonymsCache(sessionId);
  if (result.upsertedCount + result.modifiedCount === 0) return null;
  return {
    sessionId,
    synonymGroups: updated.synonymGroups,
    updatedAt: now,
  };
}

export async function deleteSynonymGroupByIndex(
  sessionId: string,
  groupIndex: number
): Promise<boolean> {
  const db = await getDb();
  const col = db.collection<KbSynonymsConfig>(KB_SYNONYMS_CONFIG_COLLECTION);
  const doc = await col.findOne({ sessionId });
  if (
    !doc?.synonymGroups?.length ||
    groupIndex < 0 ||
    groupIndex >= doc.synonymGroups.length
  ) {
    return false;
  }
  const groups = doc.synonymGroups.filter((_, i) => i !== groupIndex);
  const now = Date.now();
  if (groups.length === 0) {
    await col.deleteOne({ sessionId });
  } else {
    await col.updateOne(
      { sessionId },
      { $set: { synonymGroups: groups, updatedAt: now } }
    );
  }
  invalidateSynonymsCache(sessionId);
  return true;
}

export async function deleteSynonymsConfig(
  sessionId: string
): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .collection<KbSynonymsConfig>(KB_SYNONYMS_CONFIG_COLLECTION)
    .deleteOne({ sessionId });
  invalidateSynonymsCache(sessionId);
  return result.deletedCount === 1;
}
