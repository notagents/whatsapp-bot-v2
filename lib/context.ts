import { getDb } from "./db";
import {
  MESSAGES_COLLECTION,
  MEMORY_COLLECTION,
  CONVERSATION_STATE_COLLECTION,
} from "./db";
import type { Message, Memory, ConversationStateDoc } from "./models";
import { getActualJid } from "./conversation";

const RECENT_MESSAGES_LIMIT = 20;

export type Context = {
  recentMessages: Message[];
  memory: Memory;
  state: Record<string, unknown>;
};

const defaultMemory: Memory = {
  whatsappId: "",
  userID: "",
  facts: [],
  recap: { text: "", updatedAt: 0 },
};

export async function buildContext(whatsappId: string): Promise<Context> {
  const db = await getDb();
  const recentMessages = await db
    .collection<Message>(MESSAGES_COLLECTION)
    .find({ whatsappId })
    .sort({ messageTime: -1 })
    .limit(RECENT_MESSAGES_LIMIT)
    .toArray();
  const memoryDoc = await db.collection<Memory>(MEMORY_COLLECTION).findOne({ whatsappId });
  const memory: Memory = memoryDoc ?? {
    ...defaultMemory,
    whatsappId,
    userID: getActualJid(whatsappId),
  };
  const stateDoc = await db
    .collection<ConversationStateDoc>(CONVERSATION_STATE_COLLECTION)
    .findOne({ whatsappId });
  const state = stateDoc?.state ?? {};
  return {
    recentMessages: recentMessages.reverse(),
    memory,
    state,
  };
}
