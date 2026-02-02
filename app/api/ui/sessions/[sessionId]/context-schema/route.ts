import { NextResponse } from "next/server";
import { getDb, SESSION_CONTEXT_CONFIG_COLLECTION } from "@/lib/db";
import type { SessionContextConfig } from "@/lib/models";
import { loadContextSchema } from "@/lib/context-extractor";
import { requireAuth } from "@/lib/ui-auth-middleware";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireAuth(_request);
  } catch (res) {
    return res as Response;
  }
  const { sessionId } = await params;
  const db = await getDb();
  const config = await db
    .collection<SessionContextConfig>(SESSION_CONTEXT_CONFIG_COLLECTION)
    .findOne({ sessionId });

  if (config?.enabled && config.schema) {
    return NextResponse.json({
      ok: true,
      schema: config.schema,
      source: "override",
      enabled: config.enabled,
    });
  }

  const schema = await loadContextSchema(sessionId);
  return NextResponse.json({
    ok: true,
    schema,
    source: schema ? "derived" : null,
    enabled: true,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireAuth(request);
  } catch (res) {
    return res as Response;
  }
  const { sessionId } = await params;
  let body: { schema?: SessionContextConfig["schema"]; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }
  const schema = body.schema;
  if (!schema || typeof schema !== "object" || !Array.isArray(schema.fields)) {
    return NextResponse.json(
      { ok: false, error: "schema with fields array required" },
      { status: 400 }
    );
  }
  const now = Date.now();
  const config: SessionContextConfig = {
    sessionId,
    schema: {
      ...schema,
      sessionId,
      version: typeof schema.version === "number" ? schema.version : 1,
      updatedAt: now,
    },
    enabled: body.enabled ?? true,
    updatedAt: now,
    updatedBy: "admin",
  };
  const db = await getDb();
  await db
    .collection<SessionContextConfig>(SESSION_CONTEXT_CONFIG_COLLECTION)
    .updateOne({ sessionId }, { $set: config }, { upsert: true });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireAuth(_request);
  } catch (res) {
    return res as Response;
  }
  const { sessionId } = await params;
  const db = await getDb();
  await db
    .collection<SessionContextConfig>(SESSION_CONTEXT_CONFIG_COLLECTION)
    .deleteOne({ sessionId });
  return NextResponse.json({ ok: true });
}
