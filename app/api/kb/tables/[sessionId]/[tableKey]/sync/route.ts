import { NextResponse } from "next/server";
import { syncTable } from "@/lib/kb-v2/sync";

const MAX_ROWS = 10000;

type RouteParams = { params: Promise<{ sessionId: string; tableKey: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  const expectedToken = process.env.KB_SYNC_TOKEN;
  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId, tableKey } = await params;
  if (!sessionId || !tableKey) {
    return NextResponse.json(
      { error: "sessionId and tableKey required" },
      { status: 400 }
    );
  }

  let body: {
    batchId?: string;
    mode?: string;
    primaryKey?: string;
    rows?: unknown[];
    batchIndex?: number;
    isLastBatch?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { batchId, mode, primaryKey, rows, batchIndex, isLastBatch } = body;
  if (
    !batchId ||
    typeof batchId !== "string" ||
    !primaryKey ||
    typeof primaryKey !== "string"
  ) {
    return NextResponse.json(
      { error: "batchId and primaryKey (string) required" },
      { status: 400 }
    );
  }
  if (!Array.isArray(rows)) {
    return NextResponse.json(
      { error: "rows must be an array" },
      { status: 400 }
    );
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (max ${MAX_ROWS})` },
      { status: 413 }
    );
  }

  const payload = {
    batchId: String(batchId),
    mode: mode === "mirror" ? ("mirror" as const) : ("mirror" as const),
    primaryKey: String(primaryKey),
    rows: rows as Array<Record<string, unknown>>,
    ...(typeof batchIndex === "number" && { batchIndex }),
    ...(typeof isLastBatch === "boolean" && { isLastBatch }),
  };

  const result = await syncTable(sessionId, tableKey, payload);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Sync failed", stats: result.stats },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, stats: result.stats });
}
