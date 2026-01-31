import { ObjectId } from "mongodb";
import { getDb, MESSAGES_COLLECTION } from "./db";
import type { Message } from "./models";
import { getActualJid } from "./conversation";

export type SendWhatsAppMessageParams = {
  sessionId: string;
  jid: string;
  text: string;
  whatsappId?: string;
};

export type SendWhatsAppMessageResult = {
  messageId?: ObjectId;
};

function toBaileysJid(jid: string, _sessionId: string): string {
  if (jid.indexOf("@") !== jid.lastIndexOf("@")) {
    return jid.slice(jid.indexOf("@") + 1);
  }
  if (!jid.includes("@")) {
    return `${jid}@s.whatsapp.net`;
  }
  const [, suffix] = jid.split("@");
  return suffix === "s.whatsapp.net" ? jid : `${suffix}@s.whatsapp.net`;
}

export async function sendWhatsAppMessage(
  params: SendWhatsAppMessageParams,
  persist = true
): Promise<SendWhatsAppMessageResult> {
  const { sessionId, jid, text, whatsappId: paramWhatsappId } = params;
  const actualJid = toBaileysJid(jid.includes("@") ? jid : `${sessionId}@${jid}`, sessionId);
  const baileysUrl = process.env.BAILEYS_API_URL;
  let botMessageId: string | undefined;

  if (baileysUrl) {
    const base = baileysUrl.replace(/\/$/, "");
    const url = `${base}/${encodeURIComponent(sessionId)}/messages/send`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const apiKey = process.env.BAILEYS_API_KEY;
    if (apiKey) headers["X-API-Key"] = apiKey;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jid: actualJid,
        type: "number",
        message: { text },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Baileys send failed: ${res.status} ${errText}`);
    }
    const data = (await res.json()) as { messageId?: string };
    botMessageId = data.messageId;
  }

  if (!persist) {
    return {};
  }

  const whatsappId = paramWhatsappId ?? (jid.includes("@") ? jid : `${sessionId}@${actualJid}`);
  const userID = getActualJid(whatsappId);
  const doc: Message = {
    whatsappId,
    sessionId,
    userID,
    channel: "whatsapp",
    messageText: text,
    messageTime: Math.floor(Date.now() / 1000),
    source: "bot",
    processed: true,
    ...(botMessageId && { botMessageId }),
  };
  const db = await getDb();
  const col = db.collection<Message>(MESSAGES_COLLECTION);
  const result = await col.insertOne(doc);
  return { messageId: result.insertedId };
}
