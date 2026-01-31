import { NextRequest, NextResponse } from "next/server";
import { getDb, MESSAGES_COLLECTION } from "@/lib/db";
import type { Message } from "@/lib/models";
import { buildConversationId } from "@/lib/conversation";

type BaileysKey = {
  remoteJid?: string;
  fromMe?: boolean;
  id?: string;
};

type BaileysMessageContent = {
  conversation?: string;
  extendedTextMessage?: { text?: string };
};

type BaileysUpsertMessage = {
  key?: BaileysKey;
  message?: BaileysMessageContent;
  messageBody?: string;
  messageTimestamp?: number;
};

type WebhookBody = {
  sessionId?: string;
  messages?: BaileysUpsertMessage[];
  data?: { messages?: BaileysUpsertMessage[] } | BaileysUpsertMessage[];
};

function extractText(
  msg: BaileysMessageContent | undefined,
  messageBody?: string
): string {
  if (typeof messageBody === "string" && messageBody.length > 0)
    return messageBody;
  if (!msg) return "";
  if (typeof msg.conversation === "string") return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  return "";
}

function normalizeMessagesArray(
  raw: unknown
): BaileysUpsertMessage[] {
  if (Array.isArray(raw)) return raw as BaileysUpsertMessage[];
  if (raw && typeof raw === "object" && !Array.isArray(raw))
    return [raw as BaileysUpsertMessage];
  return [];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as WebhookBody;
    const sessionId = body.sessionId ?? "default";
    const dataRaw = body.data;
    const messagesFromData = Array.isArray(dataRaw)
      ? dataRaw
      : (dataRaw as { messages?: unknown })?.messages;
    const messages = normalizeMessagesArray(
      body.messages ?? messagesFromData ?? []
    );
    const toInsert: Message[] = [];

    for (const item of messages) {
      const key = item.key;
      const remoteJid =
        key?.remoteJid ??
        (item as { remoteJid?: string }).remoteJid ??
        (item as { key?: { remoteJid?: string } }).key?.remoteJid;
      const fromMe =
        key?.fromMe ?? (item as { fromMe?: boolean }).fromMe ?? false;
      if (!remoteJid || fromMe === true) continue;
      const text = extractText(item.message, item.messageBody);
      const messageTime =
        item.messageTimestamp ??
        (item as { messageTimestamp?: number }).messageTimestamp ??
        Math.floor(Date.now() / 1000);
      const whatsappId = buildConversationId(sessionId, remoteJid);
      const userID = remoteJid;
      toInsert.push({
        whatsappId,
        sessionId,
        userID,
        channel: "whatsapp",
        messageText: text,
        messageTime,
        source: "user",
        processed: false,
      });
    }
    console.log("[webhook] Messages to save:", toInsert);
    if (toInsert.length === 0) {
      console.warn("[webhook] No messages to save. Payload keys:", Object.keys(body));
      return NextResponse.json({ ok: true, saved: 0 });
    }

    const db = await getDb();
    const col = db.collection<Message>(MESSAGES_COLLECTION);
    await col.insertMany(toInsert);
    return NextResponse.json({ ok: true, saved: toInsert.length });
  } catch (err) {
    console.error("[webhook]", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
