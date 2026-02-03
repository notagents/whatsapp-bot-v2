import { getDb } from "@/lib/db";
import { KB_ROWS_COLLECTION } from "@/lib/db";
import type { KbRow } from "@/lib/kb-v2/types";
import { expandQueryWithSynonyms } from "./synonyms";

export type TableLookupParams = {
  sessionId: string;
  tableKey: string;
  query: string;
  limit: number;
  filter?: Record<string, unknown>;
};

export type TableGetParams = {
  sessionId: string;
  tableKey: string;
  pk: string;
};

export type TableQueryParams = {
  sessionId: string;
  tableKey: string;
  filter?: Record<string, unknown>;
  limit: number;
};

function extractNumericHints(query: string): string[] {
  const digits = query.replace(/\D/g, " ").trim().split(/\s+/).filter(Boolean);
  const normalized = query
    .toLowerCase()
    .replace(/\s*(lts?|lt|litros?|kg|gr|g|ml)\s*/gi, " ")
    .trim();
  const fromWords = normalized.match(/\d+/g) ?? [];
  return [...new Set([...digits, ...fromWords])];
}

function scoreRowForQuery(
  row: KbRow,
  query: string,
  numericHints: string[]
): number {
  const search = row.search as
    | {
        name?: string;
        aliases?: string[];
      }
    | undefined;
  const name = [search?.name, (row.data as { name?: string })?.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const aliases = (search?.aliases ?? []).join(" ").toLowerCase();
  const q = query.toLowerCase().trim();
  let score = 0;
  if (name.includes(q)) score += 100;
  if (aliases && q.length > 1 && aliases.includes(q)) score += 80;
  const qWords = q.split(/\s+/).filter(Boolean);
  for (const w of qWords) {
    if (w.length > 1 && name.includes(w)) score += 20;
    if (aliases && aliases.includes(w)) score += 15;
  }
  for (const hint of numericHints) {
    if (hint && name.includes(hint)) score += 50;
  }
  return score;
}

export async function lookupRows(params: TableLookupParams): Promise<KbRow[]> {
  const { sessionId, tableKey, query, limit, filter = {} } = params;
  if (!query?.trim()) {
    return queryRows({ sessionId, tableKey, limit, filter });
  }
  const searchQuery = await expandQueryWithSynonyms(query, sessionId, tableKey);
  const db = await getDb();
  const col = db.collection<KbRow>(KB_ROWS_COLLECTION);
  const cap = Math.min(limit * 2, 50);
  const baseMatch: Record<string, unknown> = { sessionId, tableKey };
  for (const [key, value] of Object.entries(filter)) {
    baseMatch[`data.${key}`] = value;
  }
  let rows: KbRow[];
  try {
    const cursor = col
      .find({
        ...baseMatch,
        $text: { $search: searchQuery },
      })
      .project({
        sessionId: 1,
        tableKey: 1,
        pk: 1,
        data: 1,
        search: 1,
        updatedAt: 1,
      })
      .limit(cap);
    rows = (await cursor.toArray()) as KbRow[];
  } catch {
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const terms = searchQuery
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(escapeRegex);
    const regexQuery = terms.join("|");
    const orConditions: Record<string, unknown>[] = [
      { "search.name": { $regex: query.trim(), $options: "i" } },
      { "data.name": { $regex: query.trim(), $options: "i" } },
    ];
    if (regexQuery) {
      orConditions.push({
        "search.aliases": { $regex: new RegExp(regexQuery, "i") },
      });
    }
    const cursor = col
      .find({
        ...baseMatch,
        $or: orConditions,
      })
      .limit(cap);
    rows = (await cursor.toArray()) as KbRow[];
  }
  const numericHints = extractNumericHints(query);
  if (rows.length > 1) {
    rows = [...rows].sort((a, b) => {
      const sa = scoreRowForQuery(a, query, numericHints);
      const sb = scoreRowForQuery(b, query, numericHints);
      return sb - sa;
    });
  }
  return rows.slice(0, limit);
}

export async function getRowByPk(
  params: TableGetParams
): Promise<KbRow | null> {
  const { sessionId, tableKey, pk } = params;
  const db = await getDb();
  return db
    .collection<KbRow>(KB_ROWS_COLLECTION)
    .findOne({ sessionId, tableKey, pk });
}

export async function queryRows(params: TableQueryParams): Promise<KbRow[]> {
  const { sessionId, tableKey, filter = {}, limit } = params;
  const db = await getDb();
  const match: Record<string, unknown> = { sessionId, tableKey };
  for (const [key, value] of Object.entries(filter)) {
    match[`data.${key}`] = value;
  }
  return db
    .collection<KbRow>(KB_ROWS_COLLECTION)
    .find(match)
    .limit(Math.min(limit, 100))
    .toArray();
}
