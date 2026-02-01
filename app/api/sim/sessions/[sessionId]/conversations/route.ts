import { NextRequest, NextResponse } from "next/server";
import { getDb, MESSAGES_COLLECTION } from "@/lib/db";
import type { Message } from "@/lib/models";
import { buildSimulatorConversationId } from "@/lib/conversation";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type SimConversationItem = {
  conversationId: string;
  lastMessage: Pick<Message, "messageText" | "messageTime" | "source">;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const decodedSessionId = decodeURIComponent(sessionId);
    const db = await getDb();
    const prefix = `sim:${escapeRegex(decodedSessionId)}:`;
    const messages = await db
      .collection<Message>(MESSAGES_COLLECTION)
      .find({ whatsappId: { $regex: `^${prefix}` } })
      .sort({ messageTime: -1 })
      .toArray();

    const conversationMap = new Map<string, SimConversationItem>();
    for (const msg of messages) {
      if (!conversationMap.has(msg.whatsappId)) {
        conversationMap.set(msg.whatsappId, {
          conversationId: msg.whatsappId,
          lastMessage: {
            messageText: msg.messageText,
            messageTime: msg.messageTime,
            source: msg.source,
          },
        });
      }
    }

    return NextResponse.json({
      conversations: Array.from(conversationMap.values()),
    });
  } catch (err) {
    console.error("[sim sessions conversations GET]", err);
    return NextResponse.json(
      { error: "Failed to list simulator conversations" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const decodedSessionId = decodeURIComponent(sessionId);
    const body = await request.json().catch(() => ({}));
    const testUserId =
      typeof body?.testUserId === "string" ? body.testUserId.trim() : "";
    if (!testUserId) {
      return NextResponse.json(
        { error: "testUserId required" },
        { status: 400 }
      );
    }
    const conversationId = buildSimulatorConversationId(
      decodedSessionId,
      testUserId
    );
    return NextResponse.json({ conversationId });
  } catch (err) {
    console.error("[sim sessions conversations POST]", err);
    return NextResponse.json(
      { error: "Failed to create simulator conversation" },
      { status: 500 }
    );
  }
}
