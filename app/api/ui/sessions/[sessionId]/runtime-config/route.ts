import { NextResponse } from "next/server";
import { getDb, SESSION_RUNTIME_CONFIG_COLLECTION } from "@/lib/db";
import type { SessionRuntimeConfig } from "@/lib/models";
import { clearFlowResolverCache } from "@/lib/flows/resolver";
import { clearPromptResolverCache } from "@/lib/agents/prompt-resolver";
import { requireAuth } from "@/lib/ui-auth-middleware";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireAuth(request);
  } catch (res) {
    return res as Response;
  }
  const { sessionId } = await params;
  const db = await getDb();
  const col = db.collection<SessionRuntimeConfig>(
    SESSION_RUNTIME_CONFIG_COLLECTION
  );
  const doc = await col.findOne({ sessionId });
  const configMode = doc?.configMode ?? "auto";
  return NextResponse.json({
    ok: true,
    data: {
      sessionId,
      configMode,
      updatedAt: doc?.updatedAt ?? 0,
      updatedBy: doc?.updatedBy ?? "",
    },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  let username: string;
  try {
    username = await requireAuth(request);
  } catch (res) {
    return res as Response;
  }
  const { sessionId } = await params;
  let body: { configMode?: SessionRuntimeConfig["configMode"] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid body" },
      { status: 400 }
    );
  }
  const configMode = body.configMode ?? "auto";
  if (
    configMode !== "auto" &&
    configMode !== "force_draft" &&
    configMode !== "force_published"
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid configMode" },
      { status: 400 }
    );
  }
  const now = Date.now();
  const db = await getDb();
  const col = db.collection<SessionRuntimeConfig>(
    SESSION_RUNTIME_CONFIG_COLLECTION
  );
  await col.updateOne(
    { sessionId },
    { $set: { configMode, updatedAt: now, updatedBy: username } },
    { upsert: true }
  );
  clearFlowResolverCache(sessionId);
  clearPromptResolverCache(sessionId);
  return NextResponse.json({ ok: true });
}
