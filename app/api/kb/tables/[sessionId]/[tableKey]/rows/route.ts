import { NextResponse } from "next/server";
import { lookupRows, queryRows } from "@/lib/kb-v2/tables/query";

type RouteParams = { params: Promise<{ sessionId: string; tableKey: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const { sessionId, tableKey } = await params;
  if (!sessionId || !tableKey) {
    return NextResponse.json(
      { error: "sessionId and tableKey required" },
      { status: 400 }
    );
  }
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const limitParam = searchParams.get("limit");
  const limit = limitParam
    ? Math.min(Math.max(1, parseInt(limitParam, 10)), 100)
    : 20;

  const rows = query
    ? await lookupRows({ sessionId, tableKey, query, limit })
    : await queryRows({ sessionId, tableKey, limit });

  return NextResponse.json({
    rows: rows.map((r) => ({ pk: r.pk, data: r.data, updatedAt: r.updatedAt })),
  });
}
