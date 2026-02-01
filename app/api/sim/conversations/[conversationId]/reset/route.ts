import { NextRequest, NextResponse } from "next/server";
import { getDb, CONVERSATION_STATE_COLLECTION, MEMORY_COLLECTION } from "@/lib/db";
import { parseSimulatorConversationId } from "@/lib/conversation";

export async function POST(
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
    await db.collection(CONVERSATION_STATE_COLLECTION).deleteOne({ whatsappId: decoded });
    await db.collection(MEMORY_COLLECTION).deleteOne({ whatsappId: decoded });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[sim conversations reset POST]", err);
    return NextResponse.json(
      { error: "Failed to reset conversation" },
      { status: 500 }
    );
  }
}
