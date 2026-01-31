import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, MESSAGES_COLLECTION } from "@/lib/db";
import type { Message } from "@/lib/models";
import { buildConversationId, getActualJid, getSessionIdFromComposite } from "@/lib/conversation";

const sendSchema = z.object({
  sessionId: z.string().min(1).default("default"),
  jid: z.string().min(1),
  text: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = sendSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { sessionId: bodySessionId, jid, text } = parsed.data;
    const sessionIdFromJid = getSessionIdFromComposite(jid);
    const sessionId = sessionIdFromJid ?? bodySessionId;
    const actualJid = getActualJid(jid);
    const whatsappId = jid.includes("@") && sessionIdFromJid ? jid : buildConversationId(sessionId, jid);
    const baileysUrl = process.env.BAILEYS_API_URL;
    const apiKey = process.env.BAILEYS_API_KEY;
    let botMessageId: string | undefined;

    if (baileysUrl) {
      const base = baileysUrl.replace(/\/$/, "");
      const url = `${base}/${encodeURIComponent(sessionId)}/messages/send`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
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
        console.error("[send] Baileys error", res.status, errText);
        return NextResponse.json(
          { error: "Baileys send failed", detail: errText },
          { status: 502 }
        );
      }
      const data = (await res.json()) as { messageId?: string };
      botMessageId = data.messageId;
    }

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
    await col.insertOne(doc);
    return NextResponse.json({ ok: true, messageId: doc._id ?? botMessageId });
  } catch (err) {
    console.error("[send]", err);
    return NextResponse.json(
      { error: "Send failed" },
      { status: 500 }
    );
  }
}
