import { NextRequest, NextResponse } from "next/server";
import { getDb, MESSAGES_COLLECTION } from "@/lib/db";
import type { Message } from "@/lib/models";
import { buildConversationId } from "@/lib/conversation";
import { enqueueJob } from "@/lib/jobs";
import { updateResponsesEnabled } from "@/lib/conversation-state";

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

    const COOLDOWN_HOURS = 2;
    const db = await getDb();
    const messagesCol = db.collection<Message>(MESSAGES_COLLECTION);

    for (const item of messages) {
      const key = item.key;
      const remoteJid =
        key?.remoteJid ??
        (item as { remoteJid?: string }).remoteJid ??
        (item as { key?: { remoteJid?: string } }).key?.remoteJid;
      const fromMe =
        key?.fromMe ?? (item as { fromMe?: boolean }).fromMe ?? false;
      if (!remoteJid) continue;
      if (fromMe === true) {
        const whatsappId = buildConversationId(sessionId, remoteJid);
        const messageIdFromBaileys = key?.id ?? (item as { key?: { id?: string } }).key?.id;
        let isFromBot = false;
        if (typeof messageIdFromBaileys === "string" && messageIdFromBaileys.length > 0) {
          isFromBot = !!(await messagesCol.findOne({
            whatsappId,
            source: "bot",
            botMessageId: messageIdFromBaileys,
          }));
        }
        if (!isFromBot) {
          const textFromMe = extractText(item.message, item.messageBody).trim();
          if (textFromMe.length > 0) {
            const sinceSec = Math.floor(Date.now() / 1000) - 90;
            const recentBot = await messagesCol
              .find({ whatsappId, source: "bot", messageTime: { $gte: sinceSec } })
              .limit(20)
              .toArray();
            isFromBot = recentBot.some(
              (m) =>
                m.messageText.trim() === textFromMe ||
                textFromMe.includes(m.messageText.trim()) ||
                m.messageText.trim().includes(textFromMe)
            );
          }
        }
        if (!isFromBot) {
          const disabledUntilUTC = new Date(
            Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000
          ).toISOString();
          await updateResponsesEnabled(whatsappId, { disabledUntilUTC });
        }
        continue;
      }
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

    await messagesCol.insertMany(toInsert);
    const uniqueWhatsappIds = [...new Set(toInsert.map((m) => m.whatsappId))];
    for (const whatsappId of uniqueWhatsappIds) {
      await enqueueJob({ type: "debounceTurn", payload: { whatsappId } });
    }
    return NextResponse.json({ ok: true, saved: toInsert.length });
  } catch (err) {
    console.error("[webhook]", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
