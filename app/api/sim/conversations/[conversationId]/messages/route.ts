import { NextRequest, NextResponse } from "next/server";
import { getDb, MESSAGES_COLLECTION } from "@/lib/db";
import type { Message } from "@/lib/models";
import { parseSimulatorConversationId } from "@/lib/conversation";
import { enqueueJob } from "@/lib/jobs";

const DEBOUNCE_DELAY_MS = 3000;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const decoded = decodeURIComponent(conversationId);
    const parsed = parseSimulatorConversationId(decoded);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid simulator conversation ID" },
        { status: 400 }
      );
    }
    const db = await getDb();
    const messages = await db
      .collection<Message>(MESSAGES_COLLECTION)
      .find({ whatsappId: decoded })
      .sort({ messageTime: 1 })
      .limit(200)
      .project<Pick<Message, "messageText" | "messageTime" | "source">>({
        messageText: 1,
        messageTime: 1,
        source: 1,
      })
      .toArray();
    return NextResponse.json({ messages });
  } catch (err) {
    console.error("[sim conversations messages GET]", err);
    return NextResponse.json(
      { error: "Failed to list messages" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const decoded = decodeURIComponent(conversationId);
    const parsed = parseSimulatorConversationId(decoded);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid simulator conversation ID" },
        { status: 400 }
      );
    }
    const body = await request.json().catch(() => ({}));
    const text =
      typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json(
        { error: "text required" },
        { status: 400 }
      );
    }
    const { sessionId, testUserId } = parsed;
    const db = await getDb();
    const messageDoc: Message = {
      whatsappId: decoded,
      sessionId,
      userID: testUserId,
      channel: "simulator",
      messageText: text,
      messageTime: Math.floor(Date.now() / 1000),
      source: "user",
      processed: false,
    };
    await db.collection<Message>(MESSAGES_COLLECTION).insertOne(messageDoc);
    await enqueueJob({
      type: "debounceTurn",
      payload: { whatsappId: decoded },
      scheduledFor: Date.now() + DEBOUNCE_DELAY_MS,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[sim conversations messages POST]", err);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
