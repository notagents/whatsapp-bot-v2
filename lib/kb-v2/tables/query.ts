import { getDb } from "@/lib/db";
import { KB_ROWS_COLLECTION } from "@/lib/db";
import type { KbRow } from "@/lib/kb-v2/types";

export type TableLookupParams = {
  sessionId: string;
  tableKey: string;
  query: string;
  limit: number;
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
  const name = [
    (row.search as { name?: string })?.name,
    (row.data as { name?: string })?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const q = query.toLowerCase().trim();
  let score = 0;
  if (name.includes(q)) score += 100;
  const qWords = q.split(/\s+/).filter(Boolean);
  for (const w of qWords) {
    if (w.length > 1 && name.includes(w)) score += 20;
  }
  for (const hint of numericHints) {
    if (hint && name.includes(hint)) score += 50;
  }
  return score;
}

export async function lookupRows(params: TableLookupParams): Promise<KbRow[]> {
  const { sessionId, tableKey, query, limit } = params;
  if (!query?.trim()) {
    return queryRows({ sessionId, tableKey, limit });
  }
  const db = await getDb();
  const col = db.collection<KbRow>(KB_ROWS_COLLECTION);
  const cap = Math.min(limit * 2, 50);
  let rows: KbRow[];
  try {
    const cursor = col
      .find({
        sessionId,
        tableKey,
        $text: { $search: query },
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
    const cursor = col
      .find({
        sessionId,
        tableKey,
        $or: [
          { "search.name": { $regex: query.trim(), $options: "i" } },
          { "data.name": { $regex: query.trim(), $options: "i" } },
        ],
      })
      .limit(cap);
    rows = (await cursor.toArray()) as KbRow[];
  }
  const numericHints = extractNumericHints(query);
  if (numericHints.length > 0 || query.includes(" ")) {
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
