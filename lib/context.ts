import type { ObjectId } from "mongodb";
import { getDb } from "./db";
import {
  MESSAGES_COLLECTION,
  MEMORY_COLLECTION,
  CONVERSATION_STATE_COLLECTION,
} from "./db";
import type { Message, Memory, ConversationStateDoc } from "./models";
import { getActualJid } from "./conversation";
import {
  extractStructuredContext,
  persistStructuredContext,
} from "./context-extractor";

const RECENT_MESSAGES_LIMIT = 20;
const CONTEXT_SNAPSHOT_MESSAGES_LIMIT = 20;

export type ContextSnapshotMessage = {
  messageText: string;
  source: "user" | "bot";
  messageTime: number;
};

export type ContextSnapshotStructuredContext = {
  environment?: "interior" | "exterior";
  seedType?: "automatica" | "fotoperiodica";
  budget?: number;
  space?: string;
  plantCount?: number;
  hasEquipment?: boolean;
  extractedAt: number;
  lastUpdatedTurn?: string;
};

export type ContextSnapshot = {
  memory: {
    structuredContext?: ContextSnapshotStructuredContext | null;
    facts: Memory["facts"];
    recap: Memory["recap"];
  };
  state: Record<string, unknown>;
  recentMessages: ContextSnapshotMessage[];
};

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

export async function buildContext(
  whatsappId: string,
  turnId?: ObjectId
): Promise<Context> {
  const db = await getDb();
  const recentMessages = await db
    .collection<Message>(MESSAGES_COLLECTION)
    .find({ whatsappId })
    .sort({ messageTime: -1 })
    .limit(RECENT_MESSAGES_LIMIT)
    .toArray();
  const memoryDoc = await db
    .collection<Memory>(MEMORY_COLLECTION)
    .findOne({ whatsappId });
  let memory: Memory = memoryDoc ?? {
    ...defaultMemory,
    whatsappId,
    userID: getActualJid(whatsappId),
  };
  const structured = await extractStructuredContext(
    whatsappId,
    recentMessages,
    memory.structuredContext,
    turnId
  );
  if (structured !== memory.structuredContext) {
    await persistStructuredContext(whatsappId, structured);
    memory = { ...memory, structuredContext: structured ?? undefined };
  }
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

const MESSAGE_TEXT_TRUNCATE = 200;

export async function getContextSnapshot(
  whatsappId: string
): Promise<ContextSnapshot> {
  const db = await getDb();
  const recentMessages = await db
    .collection<Message>(MESSAGES_COLLECTION)
    .find({ whatsappId })
    .sort({ messageTime: -1 })
    .limit(CONTEXT_SNAPSHOT_MESSAGES_LIMIT)
    .toArray();
  const memoryDoc = await db
    .collection<Memory>(MEMORY_COLLECTION)
    .findOne({ whatsappId });
  const stateDoc = await db
    .collection<ConversationStateDoc>(CONVERSATION_STATE_COLLECTION)
    .findOne({ whatsappId });
  const memory = memoryDoc ?? {
    ...defaultMemory,
    whatsappId,
    userID: getActualJid(whatsappId),
  };
  const structuredContext = memory.structuredContext
    ? {
        ...memory.structuredContext,
        lastUpdatedTurn: memory.structuredContext.lastUpdatedTurn?.toString(),
      }
    : null;
  const messages: ContextSnapshotMessage[] = recentMessages
    .reverse()
    .map((m) => ({
      messageText:
        m.messageText.length > MESSAGE_TEXT_TRUNCATE
          ? m.messageText.slice(0, MESSAGE_TEXT_TRUNCATE) + "…"
          : m.messageText,
      source: m.source,
      messageTime: m.messageTime,
    }));
  return {
    memory: {
      structuredContext: structuredContext ?? undefined,
      facts: memory.facts,
      recap: memory.recap,
    },
    state: stateDoc?.state ?? {},
    recentMessages: messages,
  };
}
