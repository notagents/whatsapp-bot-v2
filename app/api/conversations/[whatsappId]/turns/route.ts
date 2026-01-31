import { NextRequest, NextResponse } from "next/server";
import { getDb, TURNS_COLLECTION } from "@/lib/db";
import type { Turn } from "@/lib/models";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ whatsappId: string }> }
) {
  try {
    const { whatsappId } = await params;
    const limit = Math.min(
      50,
      Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10))
    );
    const db = await getDb();
    const turns = await db
      .collection<Turn>(TURNS_COLLECTION)
      .find({ whatsappId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return NextResponse.json({ turns });
  } catch (err) {
    console.error("[turns GET]", err);
    return NextResponse.json(
      { error: "Failed to list turns" },
      { status: 500 }
    );
  }
}
