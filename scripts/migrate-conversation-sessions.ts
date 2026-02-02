import "dotenv/config";
import { getDb } from "../lib/db";
import {
  MESSAGES_COLLECTION,
  TURNS_COLLECTION,
  CONVERSATION_SESSIONS_COLLECTION,
} from "../lib/db";
import type { Message, ConversationSession, Turn } from "../lib/models";
import { ensureIndexes } from "../lib/models";

async function main() {
  await ensureIndexes();
  const db = await getDb();
  const messagesCol = db.collection<Message>(MESSAGES_COLLECTION);
  const turnsCol = db.collection<Turn>(TURNS_COLLECTION);
  const sessionsCol = db.collection<ConversationSession>(
    CONVERSATION_SESSIONS_COLLECTION
  );

  const whatsappIds = await messagesCol.distinct("whatsappId", {});
  let created = 0;
  let skipped = 0;

  for (const whatsappId of whatsappIds) {
    const existing = await sessionsCol.findOne({ whatsappId });
    if (existing) {
      skipped++;
      continue;
    }
    const agg = await messagesCol
      .aggregate<{ minTime: number; maxTime: number; count: number }>([
        { $match: { whatsappId } },
        {
          $group: {
            _id: null,
            minTime: { $min: "$messageTime" },
            maxTime: { $max: "$messageTime" },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            minTime: 1,
            maxTime: 1,
            count: 1,
          },
        },
      ])
      .toArray();
    const row = agg[0];
    if (!row || row.count === 0) {
      skipped++;
      continue;
    }
    const startedAt = row.minTime * 1000;
    const lastMessageAt = row.maxTime * 1000;
    const doc: Omit<ConversationSession, "_id"> = {
      whatsappId,
      sessionNumber: 1,
      startedAt,
      lastMessageAt,
      messageCount: row.count,
      status: "active",
    };
    await sessionsCol.insertOne(doc as ConversationSession);
    const turnsResult = await turnsCol.updateMany(
      { whatsappId, sessionNumber: { $exists: false } },
      { $set: { sessionNumber: 1 } }
    );
    created++;
    console.log(
      `[migrate-conversation-sessions] ${whatsappId}: session #1, turns backfilled=${turnsResult.modifiedCount}`
    );
  }

  console.log(
    `[migrate-conversation-sessions] done: created=${created} skipped=${skipped}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
