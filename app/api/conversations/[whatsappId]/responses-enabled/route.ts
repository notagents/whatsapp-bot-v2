import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, RESPONSES_ENABLED_COLLECTION } from "@/lib/db";
import type { ResponsesEnabled } from "@/lib/models";
import { getActualJid, getSessionIdFromComposite } from "@/lib/conversation";

const postSchema = z.object({
  enabled: z.boolean(),
  disabledUntilUTC: z.string().nullable().optional(),
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
    const setPayload: Record<string, unknown> = {
      whatsappId,
      sessionId,
      userID,
      enabled,
      updatedAt: now,
    };
    if (disabledUntilUTC !== undefined && disabledUntilUTC !== null) {
      setPayload.disabledUntilUTC = disabledUntilUTC;
    }
    const clearCooldown = enabled === true || disabledUntilUTC === null;
    if (clearCooldown) {
      await col.updateOne(
        { whatsappId },
        { $set: setPayload, $unset: { disabledUntilUTC: 1 } },
        { upsert: true }
      );
    } else {
      await col.updateOne({ whatsappId }, { $set: setPayload }, { upsert: true });
    }
    const doc = await col.findOne({ whatsappId });
    return NextResponse.json({
      ok: true,
      enabled,
      disabledUntilUTC: doc?.disabledUntilUTC ?? null,
    });
  } catch (err) {
    console.error("[responses-enabled POST]", err);
    return NextResponse.json(
      { error: "Failed to update state" },
      { status: 500 }
    );
  }
}
