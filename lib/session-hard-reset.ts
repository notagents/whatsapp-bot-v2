import { ObjectId } from "mongodb";
import { getDb } from "./db";
import {
  MESSAGES_COLLECTION,
  TURNS_COLLECTION,
  AGENT_RUNS_COLLECTION,
  MEMORY_COLLECTION,
  CONVERSATION_STATE_COLLECTION,
  RESPONSES_ENABLED_COLLECTION,
  JOBS_COLLECTION,
  LOCKS_COLLECTION,
  SESSION_RESET_RUNS_COLLECTION,
} from "./db";
import type { DeleteCounts, SessionResetRun } from "./models";

const RESET_LOCK_TTL_MS = 120000;

async function acquireResetLock(sessionId: string): Promise<boolean> {
  const db = await getDb();
  const col = db.collection<{ key: string; expiresAt: number }>(
    LOCKS_COLLECTION
  );
  const key = `reset:${sessionId}`;
  const now = Date.now();

  const existing = await col.findOne({ key });
  if (existing && existing.expiresAt > now) return false;

  await col.updateOne(
    { key },
    { $set: { key, expiresAt: now + RESET_LOCK_TTL_MS } },
    { upsert: true }
  );
  return true;
}

function releaseResetLock(sessionId: string): Promise<unknown> {
  const key = `reset:${sessionId}`;
  return getDb().then((db) =>
    db.collection(LOCKS_COLLECTION).deleteOne({ key })
  );
}

export async function dryRunHardReset(
  sessionId: string
): Promise<DeleteCounts> {
  const db = await getDb();
  const whatsappIds = await db
    .collection(MESSAGES_COLLECTION)
    .distinct("whatsappId", { sessionId });
  const turnIds = await db
    .collection(TURNS_COLLECTION)
    .distinct("_id", { sessionId });
  const turnLockKeys = whatsappIds.map((w) => `turn:${w}`);

  const [
    jobsCount,
    locksCount,
    messagesCount,
    turnsCount,
    agentRunsCount,
    memoryCount,
    conversationStateCount,
    responsesCount,
  ] = await Promise.all([
    db.collection(JOBS_COLLECTION).countDocuments({ sessionId }),
    turnLockKeys.length === 0
      ? 0
      : db
          .collection(LOCKS_COLLECTION)
          .countDocuments({ key: { $in: turnLockKeys } }),
    db.collection(MESSAGES_COLLECTION).countDocuments({ sessionId }),
    db.collection(TURNS_COLLECTION).countDocuments({ sessionId }),
    turnIds.length === 0
      ? 0
      : db
          .collection(AGENT_RUNS_COLLECTION)
          .countDocuments({ turnId: { $in: turnIds } }),
    whatsappIds.length === 0
      ? 0
      : db
          .collection(MEMORY_COLLECTION)
          .countDocuments({ whatsappId: { $in: whatsappIds } }),
    whatsappIds.length === 0
      ? 0
      : db
          .collection(CONVERSATION_STATE_COLLECTION)
          .countDocuments({ whatsappId: { $in: whatsappIds } }),
    db.collection(RESPONSES_ENABLED_COLLECTION).countDocuments({ sessionId }),
  ]);

  const legacyJobs = await db
    .collection(JOBS_COLLECTION)
    .find({ sessionId: { $exists: false } })
    .toArray();
  let legacyJobsForSession = 0;
  for (const j of legacyJobs) {
    const p = j.payload as { whatsappId?: string; turnId?: string };
    if (p.whatsappId) {
      const msg = await db
        .collection(MESSAGES_COLLECTION)
        .findOne(
          { whatsappId: p.whatsappId },
          { projection: { sessionId: 1 } }
        );
      if (msg?.sessionId === sessionId) legacyJobsForSession++;
    } else if (p.turnId) {
      const turn = await db
        .collection(TURNS_COLLECTION)
        .findOne(
          { _id: new ObjectId(p.turnId) },
          { projection: { sessionId: 1 } }
        );
      if (turn?.sessionId === sessionId) legacyJobsForSession++;
    }
  }

  return {
    jobs: jobsCount + legacyJobsForSession,
    locks: locksCount,
    messages: messagesCount,
    turns: turnsCount,
    agent_runs: agentRunsCount,
    memory: memoryCount,
    conversation_state: conversationStateCount,
    responsesEnabled: responsesCount,
  };
}

export async function executeHardReset(
  sessionId: string,
  requestedBy: string
): Promise<{ resetRunId: string; deleted: DeleteCounts }> {
  const db = await getDb();
  const resetRunsCol = db.collection<SessionResetRun>(
    SESSION_RESET_RUNS_COLLECTION
  );
  const runDoc: Omit<SessionResetRun, "_id"> = {
    sessionId,
    requestedAt: Date.now(),
    requestedBy,
    mode: "execute",
    status: "running",
  };
  const insertResult = await resetRunsCol.insertOne(runDoc as SessionResetRun);
  const resetRunId = insertResult.insertedId!.toString();

  const acquired = await acquireResetLock(sessionId);
  if (!acquired) {
    await resetRunsCol.updateOne(
      { _id: insertResult.insertedId },
      {
        $set: {
          status: "error",
          error: "Reset already in progress",
          completedAt: Date.now(),
        },
      }
    );
    throw new Error("Reset already in progress");
  }

  try {
    const whatsappIds = await db
      .collection(MESSAGES_COLLECTION)
      .distinct("whatsappId", { sessionId });
    const turnIds = await db
      .collection(TURNS_COLLECTION)
      .distinct("_id", { sessionId });
    const turnLockKeys = whatsappIds.map((w) => `turn:${w}`);

    const jobsWithSessionResult = await db
      .collection(JOBS_COLLECTION)
      .deleteMany({ sessionId });
    let jobsDeleted = jobsWithSessionResult.deletedCount;
    const legacyJobs = await db
      .collection(JOBS_COLLECTION)
      .find({ sessionId: { $exists: false } })
      .toArray();
    const toDelete: ObjectId[] = [];
    for (const j of legacyJobs) {
      const p = j.payload as { whatsappId?: string; turnId?: string };
      if (p.whatsappId) {
        const msg = await db
          .collection(MESSAGES_COLLECTION)
          .findOne(
            { whatsappId: p.whatsappId },
            { projection: { sessionId: 1 } }
          );
        if (msg?.sessionId === sessionId)
          toDelete.push((j as { _id: ObjectId })._id);
      } else if (p.turnId) {
        const turn = await db
          .collection(TURNS_COLLECTION)
          .findOne(
            { _id: new ObjectId(p.turnId) },
            { projection: { sessionId: 1 } }
          );
        if (turn?.sessionId === sessionId)
          toDelete.push((j as { _id: ObjectId })._id);
      }
    }
    if (toDelete.length > 0) {
      await db
        .collection(JOBS_COLLECTION)
        .deleteMany({ _id: { $in: toDelete } });
      jobsDeleted += toDelete.length;
    }

    const locksDeleted =
      turnLockKeys.length === 0
        ? 0
        : (
            await db
              .collection(LOCKS_COLLECTION)
              .deleteMany({ key: { $in: turnLockKeys } })
          ).deletedCount;

    const messagesDeleted = (
      await db.collection(MESSAGES_COLLECTION).deleteMany({ sessionId })
    ).deletedCount;
    const turnsDeleted = (
      await db.collection(TURNS_COLLECTION).deleteMany({ sessionId })
    ).deletedCount;

    const agentRunsDeleted =
      turnIds.length === 0
        ? 0
        : (
            await db
              .collection(AGENT_RUNS_COLLECTION)
              .deleteMany({ turnId: { $in: turnIds } })
          ).deletedCount;

    const memoryDeleted =
      whatsappIds.length === 0
        ? 0
        : (
            await db
              .collection(MEMORY_COLLECTION)
              .deleteMany({ whatsappId: { $in: whatsappIds } })
          ).deletedCount;
    const conversationStateDeleted =
      whatsappIds.length === 0
        ? 0
        : (
            await db
              .collection(CONVERSATION_STATE_COLLECTION)
              .deleteMany({ whatsappId: { $in: whatsappIds } })
          ).deletedCount;
    const responsesEnabledDeleted = (
      await db
        .collection(RESPONSES_ENABLED_COLLECTION)
        .deleteMany({ sessionId })
    ).deletedCount;

    const deleted: DeleteCounts = {
      jobs: jobsDeleted,
      locks: locksDeleted,
      messages: messagesDeleted,
      turns: turnsDeleted,
      agent_runs: agentRunsDeleted,
      memory: memoryDeleted,
      conversation_state: conversationStateDeleted,
      responsesEnabled: responsesEnabledDeleted,
    };

    await resetRunsCol.updateOne(
      { _id: insertResult.insertedId },
      {
        $set: {
          status: "success",
          deletedCounts: deleted,
          completedAt: Date.now(),
        },
      }
    );
    await releaseResetLock(sessionId);
    return { resetRunId, deleted };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await resetRunsCol.updateOne(
      { _id: insertResult.insertedId },
      {
        $set: {
          status: "error",
          error: errorMessage,
          completedAt: Date.now(),
        },
      }
    );
    await releaseResetLock(sessionId);
    throw err;
  }
}
