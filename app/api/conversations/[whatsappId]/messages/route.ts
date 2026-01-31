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
      .project<Pick<Message, "messageText" | "messageTime" | "source">>({
        messageText: 1,
        messageTime: 1,
        source: 1,
      })
      .toArray();
    return NextResponse.json(list);
  } catch (err) {
    console.error("[messages GET]", err);
    return NextResponse.json(
      { error: "Failed to list messages" },
      { status: 500 }
    );
  }
}
