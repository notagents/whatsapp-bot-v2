import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/ui-auth-middleware";
import { dryRunHardReset, executeHardReset } from "@/lib/session-hard-reset";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  let username: string;
  try {
    username = await requireAuth(request);
  } catch (res) {
    return res as Response;
  }
  const { sessionId } = await params;
  let body: { confirmSessionId?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const confirmSessionId =
    typeof body.confirmSessionId === "string" ? body.confirmSessionId : "";
  const mode = body.mode ?? "dry_run";
  if (confirmSessionId !== sessionId) {
    return NextResponse.json(
      { error: "confirmSessionId must match sessionId" },
      { status: 400 }
    );
  }
  if (mode !== "dry_run" && mode !== "execute") {
    return NextResponse.json(
      { error: "mode must be dry_run or execute" },
      { status: 400 }
    );
  }
  try {
    if (mode === "dry_run") {
      const wouldDelete = await dryRunHardReset(sessionId);
      return NextResponse.json({
        sessionId,
        mode: "dry_run",
        wouldDelete,
      });
    }
    const { resetRunId, deleted } = await executeHardReset(sessionId, username);
    return NextResponse.json({
      sessionId,
      mode: "execute",
      deleted,
      resetRunId,
      completedAt: Date.now(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Reset already in progress") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("[hard-reset]", err);
    return NextResponse.json({ error: "Hard reset failed" }, { status: 500 });
  }
}
