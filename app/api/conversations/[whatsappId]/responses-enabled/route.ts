import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, RESPONSES_ENABLED_COLLECTION } from "@/lib/db";
import type { ResponsesEnabled } from "@/lib/models";
import { getActualJid, getSessionIdFromComposite } from "@/lib/conversation";

const postSchema = z.object({
  enabled: z.boolean(),
  disabledUntilUTC: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ whatsappId: string }> }
) {
  try {
    const { whatsappId } = await params;
    const db = await getDb();
    const col = db.collection<ResponsesEnabled>(RESPONSES_ENABLED_COLLECTION);
    const doc = await col.findOne({ whatsappId });
    const enabled = doc?.enabled ?? true;
    const disabledUntilUTC = doc?.disabledUntilUTC;
    return NextResponse.json({ enabled, disabledUntilUTC: disabledUntilUTC ?? null });
  } catch (err) {
    console.error("[responses-enabled GET]", err);
    return NextResponse.json(
      { error: "Failed to get state" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ whatsappId: string }> }
) {
  try {
    const { whatsappId } = await params;
    const parsed = postSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { enabled, disabledUntilUTC } = parsed.data;
    const db = await getDb();
    const col = db.collection<ResponsesEnabled>(RESPONSES_ENABLED_COLLECTION);
    const sessionId = getSessionIdFromComposite(whatsappId) ?? "default";
    const userID = getActualJid(whatsappId);
    const now = Date.now();
    await col.updateOne(
      { whatsappId },
      {
        $set: {
          whatsappId,
          sessionId,
          userID,
          enabled,
          updatedAt: now,
          ...(disabledUntilUTC !== undefined && { disabledUntilUTC }),
        },
      },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, enabled, disabledUntilUTC: disabledUntilUTC ?? null });
  } catch (err) {
    console.error("[responses-enabled POST]", err);
    return NextResponse.json(
      { error: "Failed to update state" },
      { status: 500 }
    );
  }
}
