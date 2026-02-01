import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { KB_ROWS_COLLECTION } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  const db = await getDb();
  const tableKeys = await db
    .collection(KB_ROWS_COLLECTION)
    .distinct("tableKey", { sessionId });
  const tables = await Promise.all(
    tableKeys.map(async (tableKey) => {
      const count = await db
        .collection(KB_ROWS_COLLECTION)
        .countDocuments({ sessionId, tableKey });
      return { tableKey, rowCount: count };
    })
  );
  return NextResponse.json({ tables });
}
