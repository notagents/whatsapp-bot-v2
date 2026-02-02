import { getDb } from "./db";
import {
  CONVERSATION_SESSIONS_COLLECTION,
  CONVERSATION_STATE_COLLECTION,
} from "./db";
import type {
  ConversationSession,
  ConversationSessionClosedReason,
  ConversationStateDoc,
  HistoricalRecap,
} from "./models";
import {
  generateSessionRecap,
  appendHistoricalRecap,
  updateMemoryRecap,
} from "./memory";

const SESSION_TIMEOUT_HOURS = Number(process.env.SESSION_TIMEOUT_HOURS) || 6;
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_HOURS * 60 * 60 * 1000;

export async function getActiveSession(
  whatsappId: string
): Promise<ConversationSession | null> {
  const db = await getDb();
  return db
    .collection<ConversationSession>(CONVERSATION_SESSIONS_COLLECTION)
    .findOne({ whatsappId, status: "active" }, { sort: { lastMessageAt: -1 } });
}

export async function getSession(
  whatsappId: string,
  sessionNumber: number
): Promise<ConversationSession | null> {
  const db = await getDb();
  return db
    .collection<ConversationSession>(CONVERSATION_SESSIONS_COLLECTION)
    .findOne({ whatsappId, sessionNumber });
}

async function getNextSessionNumber(whatsappId: string): Promise<number> {
  const db = await getDb();
  const last = await db
    .collection<ConversationSession>(CONVERSATION_SESSIONS_COLLECTION)
    .findOne(
      { whatsappId },
      { sort: { sessionNumber: -1 }, projection: { sessionNumber: 1 } }
    );
  return (last?.sessionNumber ?? 0) + 1;
}

async function closeSession(
  session: ConversationSession,
  reason: ConversationSessionClosedReason,
  recap?: string
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db
    .collection<ConversationSession>(CONVERSATION_SESSIONS_COLLECTION)
    .updateOne(
      { _id: session._id },
      {
        $set: {
          status: "closed",
          closedAt: now,
          closedReason: reason,
          ...(recap != null && { recap }),
        },
      }
    );
}

async function createSession(
  whatsappId: string,
  sessionNumber: number
): Promise<ConversationSession> {
  const db = await getDb();
  const now = Date.now();
  const doc: Omit<ConversationSession, "_id"> = {
    whatsappId,
    sessionNumber,
    startedAt: now,
    lastMessageAt: now,
    messageCount: 0,
    status: "active",
  };
  const result = await db
    .collection<ConversationSession>(CONVERSATION_SESSIONS_COLLECTION)
    .insertOne(doc as ConversationSession);
  return { ...doc, _id: result.insertedId };
}

function resetConversationState(whatsappId: string): Promise<unknown> {
  return getDb().then((db) =>
    db
      .collection<ConversationStateDoc>(CONVERSATION_STATE_COLLECTION)
      .updateOne({ whatsappId }, { $set: { state: {}, updatedAt: Date.now() } })
  );
}

export async function getOrCreateActiveSession(
  whatsappId: string
): Promise<ConversationSession> {
  const db = await getDb();
  const sessionsCol = db.collection<ConversationSession>(
    CONVERSATION_SESSIONS_COLLECTION
  );
  const active = await sessionsCol.findOne(
    { whatsappId, status: "active" },
    { sort: { lastMessageAt: -1 } }
  );
  const now = Date.now();

  if (!active) {
    const sessionNumber = await getNextSessionNumber(whatsappId);
    return createSession(whatsappId, sessionNumber);
  }

  const elapsed = now - active.lastMessageAt;
  if (elapsed < SESSION_TIMEOUT_MS) {
    return active;
  }

  const recapText = await generateSessionRecap(
    whatsappId,
    active.sessionNumber
  );
  const entry: HistoricalRecap = {
    sessionNumber: active.sessionNumber,
    text: recapText,
    startedAt: active.startedAt,
    closedAt: now,
    messageCount: active.messageCount,
  };
  await closeSession(active, "timeout", recapText);
  await appendHistoricalRecap(whatsappId, entry);
  await updateMemoryRecap(whatsappId, "");
  await resetConversationState(whatsappId);

  const nextNumber = active.sessionNumber + 1;
  return createSession(whatsappId, nextNumber);
}

export async function touchSession(
  whatsappId: string,
  sessionNumber: number,
  lastMessageAt: number,
  messageCountDelta: number
): Promise<void> {
  const db = await getDb();
  await db
    .collection<ConversationSession>(CONVERSATION_SESSIONS_COLLECTION)
    .updateOne(
      { whatsappId, sessionNumber, status: "active" },
      {
        $set: { lastMessageAt },
        $inc: { messageCount: messageCountDelta },
      }
    );
}
