import type { ObjectId } from "mongodb";
import { getDb, MESSAGES_COLLECTION, RESPONSES_ENABLED_COLLECTION } from "./db";

export type Message = {
  _id?: ObjectId;
  whatsappId: string;
  sessionId: string;
  userID: string;
  channel: "whatsapp";
  messageText: string;
  messageTime: number;
  source: "user" | "bot";
  processed: boolean;
  botMessageId?: string;
};

export type ResponsesEnabled = {
  whatsappId: string;
  sessionId: string;
  userID: string;
  enabled: boolean;
  updatedAt: number;
  disabledUntilUTC?: string;
};

export async function ensureIndexes(): Promise<void> {
  const db = await getDb();
  const messages = db.collection<Message>(MESSAGES_COLLECTION);
  await messages.createIndex({ whatsappId: 1, messageTime: -1 });
  await messages.createIndex({ whatsappId: 1, processed: 1, source: 1 });
  const responsesEnabled = db.collection<ResponsesEnabled>(RESPONSES_ENABLED_COLLECTION);
  await responsesEnabled.createIndex({ whatsappId: 1 }, { unique: true });
}
