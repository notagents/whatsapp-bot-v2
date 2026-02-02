import { NextResponse } from "next/server";
import { getDb, MESSAGES_COLLECTION } from "@/lib/db";
import type { Message } from "@/lib/models";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ whatsappId: string }> }
) {
  try {
    const { whatsappId } = await params;
    const db = await getDb();
    const col = db.collection<Message>(MESSAGES_COLLECTION);
    const list = await col
      .find({ whatsappId })
      .sort({ messageTime: 1 })
      .project<
        Pick<Message, "_id" | "messageText" | "messageTime" | "source" | "meta">
      >({
        _id: 1,
        messageText: 1,
        messageTime: 1,
        source: 1,
        meta: 1,
      })
      .toArray();
    const serialized = list.map((m) => ({
      _id: m._id?.toString(),
      messageText: m.messageText,
      messageTime: m.messageTime,
      source: m.source,
      meta:
        m.meta && (m.meta.turnId != null || m.meta.partIndex != null)
          ? {
              turnId: m.meta.turnId?.toString?.() ?? undefined,
              partIndex: m.meta.partIndex,
            }
          : undefined,
    }));
    return NextResponse.json(serialized);
  } catch (err) {
    console.error("[messages GET]", err);
    return NextResponse.json(
      { error: "Failed to list messages" },
      { status: 500 }
    );
  }
}
