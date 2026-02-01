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

export async function lookupRows(params: TableLookupParams): Promise<KbRow[]> {
  const { sessionId, tableKey, query, limit } = params;
  if (!query?.trim()) {
    return queryRows({ sessionId, tableKey, limit });
  }
  const db = await getDb();
  const col = db.collection<KbRow>(KB_ROWS_COLLECTION);
  try {
    const cursor = col
      .find({
        sessionId,
        tableKey,
        $text: { $search: query },
      })
      .project({
        pk: 1,
        data: 1,
        search: 1,
        updatedAt: 1,
      })
      .limit(Math.min(limit, 50));
    return cursor.toArray();
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
      .limit(Math.min(limit, 50));
    return cursor.toArray();
  }
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
