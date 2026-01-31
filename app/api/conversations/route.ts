import { NextRequest, NextResponse } from "next/server";
import { getDb, MESSAGES_COLLECTION, RESPONSES_ENABLED_COLLECTION } from "@/lib/db";
import type { Message, ResponsesEnabled } from "@/lib/models";

type ConversationSummary = {
  whatsappId: string;
  lastMessageText: string | null;
  lastMessageTime: number | null;
  responsesEnabled: boolean;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId")?.trim() ?? null;
    const db = await getDb();
    const messages = db.collection<Message>(MESSAGES_COLLECTION);
    const responses = db.collection<ResponsesEnabled>(RESPONSES_ENABLED_COLLECTION);

    const sessionsAgg = await messages
      .aggregate<{ _id: string }>([{ $group: { _id: "$sessionId" } }, { $sort: { _id: 1 } }])
      .toArray();
    const sessions = sessionsAgg.map((r) => r._id).filter(Boolean);

    const matchStage =
      sessionId != null && sessionId !== ""
        ? { $match: { whatsappId: { $regex: `^${escapeRegex(sessionId)}@` } } }
        : null;
    const pipeline = [
      ...(matchStage ? [matchStage] : []),
      { $sort: { messageTime: -1 } },
      {
        $group: {
          _id: "$whatsappId",
          lastMessageText: { $first: "$messageText" },
          lastMessageTime: { $first: "$messageTime" },
        },
      },
    ];
    const agg = await messages
      .aggregate<{ _id: string; lastMessageText: string; lastMessageTime: number }>(pipeline)
      .toArray();
    const enabledMap = new Map<string, boolean>();
    const resCursor = responses.find({});
    for await (const r of resCursor) {
      enabledMap.set(r.whatsappId, r.enabled);
    }
    const conversations: ConversationSummary[] = agg.map((row) => ({
      whatsappId: row._id,
      lastMessageText: row.lastMessageText ?? null,
      lastMessageTime: row.lastMessageTime ?? null,
      responsesEnabled: enabledMap.get(row._id) ?? true,
    }));
    return NextResponse.json({ sessions, conversations });
  } catch (err) {
    console.error("[conversations GET]", err);
    return NextResponse.json(
      { error: "Failed to list conversations" },
      { status: 500 }
    );
  }
}
