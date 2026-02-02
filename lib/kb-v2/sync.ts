import { getDb } from "@/lib/db";
import {
  KB_ROWS_COLLECTION,
  KB_SYNC_RUNS_COLLECTION,
  KB_SYNC_BATCH_PKS_COLLECTION,
} from "@/lib/db";
import type { KbRow, KbSyncRun, KbSyncBatchPks } from "./types";

export type SyncPayload = {
  batchId: string;
  mode: "mirror";
  primaryKey: string;
  rows: Array<Record<string, unknown>>;
  batchIndex?: number;
  isLastBatch?: boolean;
};

export type SyncResult = {
  success: boolean;
  stats: {
    upserted: number;
    deleted: number;
    unchanged: number;
  };
  error?: string;
};

function normalizeSearchName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 1);
}

type BulkWriteOp = {
  updateOne: {
    filter: { sessionId: string; tableKey: string; pk: string };
    update: { $set: Omit<KbRow, "_id"> };
    upsert: true;
  };
};

function buildUpsertOps(
  sessionId: string,
  tableKey: string,
  batchId: string,
  primaryKey: string,
  rows: Array<Record<string, unknown>>,
  now: number
): BulkWriteOp[] {
  const nameField = "name";
  const categoryField = "category";
  return rows.map((row) => {
    const pk = String(row[primaryKey]);
    const data = { ...row } as Record<string, unknown>;
    const nameVal = data[nameField];
    const searchName =
      nameVal != null ? normalizeSearchName(String(nameVal)) : undefined;
    const nameTokens = searchName ? tokenize(searchName) : undefined;
    const categoryVal = data[categoryField];
    const searchCategory =
      categoryVal != null ? String(categoryVal).trim() : undefined;

    const doc: Omit<KbRow, "_id"> = {
      sessionId,
      tableKey,
      pk,
      data,
      search: {
        ...(searchName && { name: searchName }),
        ...(nameTokens && nameTokens.length > 0 && { nameTokens }),
        ...(searchCategory && { category: searchCategory }),
      },
      updatedAt: now,
      source: { provider: "n8n", batchId },
    };

    return {
      updateOne: {
        filter: { sessionId, tableKey, pk },
        update: { $set: doc },
        upsert: true,
      },
    };
  });
}

export async function syncTable(
  sessionId: string,
  tableKey: string,
  payload: SyncPayload
): Promise<SyncResult> {
  const { batchId, mode, primaryKey, rows, batchIndex, isLastBatch } = payload;
  const db = await getDb();
  const syncRunsCol = db.collection<KbSyncRun>(KB_SYNC_RUNS_COLLECTION);
  const batchPksCol = db.collection<KbSyncBatchPks>(
    KB_SYNC_BATCH_PKS_COLLECTION
  );
  const rowsCol = db.collection<KbRow>(KB_ROWS_COLLECTION);

  const existingRun = await syncRunsCol.findOne({
    sessionId,
    tableKey,
    batchId,
    status: "success",
  });
  if (existingRun) {
    return {
      success: true,
      stats: existingRun.stats,
    };
  }

  const pkKey = primaryKey;
  for (const row of rows) {
    const pkVal = row[pkKey];
    if (pkVal === undefined || pkVal === null || String(pkVal).trim() === "") {
      return {
        success: false,
        stats: { upserted: 0, deleted: 0, unchanged: 0 },
        error: `primaryKey "${pkKey}" missing or empty in row`,
      };
    }
  }

  const isMultiBatch = batchIndex !== undefined || isLastBatch === false;
  const now = Date.now();

  if (!isMultiBatch) {
    await syncRunsCol.insertOne({
      sessionId,
      tableKey,
      batchId,
      receivedAt: now,
      status: "running",
      stats: { upserted: 0, deleted: 0, unchanged: 0 },
    } as KbSyncRun);

    try {
      const pkSet = new Set(rows.map((r) => String(r[pkKey])));
      const ops = buildUpsertOps(
        sessionId,
        tableKey,
        batchId,
        pkKey,
        rows,
        now
      );
      let upserted = 0;
      let unchanged = 0;
      if (ops.length > 0) {
        const result = await rowsCol.bulkWrite(ops);
        upserted = result.upsertedCount + result.modifiedCount;
        unchanged = result.matchedCount - result.modifiedCount;
      }
      let deleted = 0;
      if (mode === "mirror") {
        const deleteResult = await rowsCol.deleteMany({
          sessionId,
          tableKey,
          pk: { $nin: Array.from(pkSet) },
        });
        deleted = deleteResult.deletedCount;
      }
      await syncRunsCol.updateOne(
        { sessionId, tableKey, batchId },
        {
          $set: {
            status: "success",
            stats: { upserted, deleted, unchanged },
          },
        }
      );
      return {
        success: true,
        stats: { upserted, deleted, unchanged },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await syncRunsCol.updateOne(
        { sessionId, tableKey, batchId },
        { $set: { status: "error", error: errorMessage } }
      );
      return {
        success: false,
        stats: { upserted: 0, deleted: 0, unchanged: 0 },
        error: errorMessage,
      };
    }
  }

  let runningRun = await syncRunsCol.findOne({
    sessionId,
    tableKey,
    batchId,
    status: "running",
  });
  if (!runningRun) {
    await syncRunsCol.insertOne({
      sessionId,
      tableKey,
      batchId,
      receivedAt: now,
      status: "running",
      stats: { upserted: 0, deleted: 0, unchanged: 0 },
    } as KbSyncRun);
  }

  const currentBatchIndex = batchIndex ?? 0;
  const pks = rows.map((r) => String(r[pkKey]));
  await batchPksCol.insertOne({
    sessionId,
    tableKey,
    batchId,
    batchIndex: currentBatchIndex,
    pks,
    receivedAt: now,
  } as KbSyncBatchPks);

  const ops = buildUpsertOps(sessionId, tableKey, batchId, pkKey, rows, now);
  let upserted = 0;
  let unchanged = 0;
  if (ops.length > 0) {
    const result = await rowsCol.bulkWrite(ops);
    upserted = result.upsertedCount + result.modifiedCount;
    unchanged = result.matchedCount - result.modifiedCount;
  }

  if (isLastBatch !== true) {
    return {
      success: true,
      stats: { upserted, deleted: 0, unchanged },
    };
  }

  try {
    const batchPksDocs = await batchPksCol
      .find({ sessionId, tableKey, batchId })
      .toArray();
    const allPks = new Set<string>();
    for (const doc of batchPksDocs) {
      for (const pk of doc.pks) allPks.add(pk);
    }
    let deleted = 0;
    if (mode === "mirror") {
      const deleteResult = await rowsCol.deleteMany({
        sessionId,
        tableKey,
        pk: { $nin: Array.from(allPks) },
      });
      deleted = deleteResult.deletedCount;
    }
    const finalStats = { upserted, deleted, unchanged };
    await syncRunsCol.updateOne(
      { sessionId, tableKey, batchId },
      { $set: { status: "success", stats: finalStats } }
    );
    await batchPksCol.deleteMany({ sessionId, tableKey, batchId });
    return {
      success: true,
      stats: finalStats,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await syncRunsCol.updateOne(
      { sessionId, tableKey, batchId },
      { $set: { status: "error", error: errorMessage } }
    );
    return {
      success: false,
      stats: { upserted: 0, deleted: 0, unchanged: 0 },
      error: errorMessage,
    };
  }
}
