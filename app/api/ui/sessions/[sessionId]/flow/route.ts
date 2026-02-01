import { NextResponse } from "next/server";
import { getDb, FLOW_DOCUMENTS_COLLECTION } from "@/lib/db";
import type { FlowDocument } from "@/lib/models";
import { loadFlowFromFilesystem } from "@/lib/flows/registry";
import { validateFlow } from "@/lib/flows/validator";
import { clearFlowResolverCache } from "@/lib/flows/resolver";
import { requireAuth } from "@/lib/ui-auth-middleware";

const FLOW_NAME = "main" as const;
const FLOW_TYPE = "flow" as const;
const SCHEMA_VERSION = 1;

type Status = "draft" | "published";

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
  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") ?? "draft") as Status;
  if (status !== "draft" && status !== "published") {
    return NextResponse.json(
      { ok: false, error: "Invalid status" },
      { status: 400 }
    );
  }
  const db = await getDb();
  const col = db.collection<FlowDocument>(FLOW_DOCUMENTS_COLLECTION);
  const doc = await col.findOne({
    sessionId,
    type: FLOW_TYPE,
    name: FLOW_NAME,
    status,
  });
  if (doc) {
    return NextResponse.json({
      ok: true,
      data: {
        sessionId: doc.sessionId,
        status: doc.status,
        text: doc.text,
        version: doc.version,
        updatedAt: doc.updatedAt,
        updatedBy: doc.updatedBy,
        lastValidAt: doc.lastValidAt,
        lastError: doc.lastError,
        existsInDB: true,
      },
    });
  }
  const fromFs = await loadFlowFromFilesystem(sessionId);
  const text = JSON.stringify(fromFs.config, null, 2);
  return NextResponse.json({
    ok: true,
    data: {
      sessionId,
      status,
      text,
      version: 0,
      updatedAt: 0,
      updatedBy: "",
      existsInDB: false,
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
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  if (status !== "draft") {
    return NextResponse.json(
      { ok: false, error: "Only draft can be updated via PUT" },
      { status: 400 }
    );
  }
  let body: { text?: string; version?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid body" },
      { status: 400 }
    );
  }
  const text = body.text ?? "";
  const version = body.version ?? 0;
  const validation = validateFlow(text);
  const now = Date.now();
  const db = await getDb();
  const col = db.collection<FlowDocument>(FLOW_DOCUMENTS_COLLECTION);
  const filter = {
    sessionId,
    type: FLOW_TYPE,
    name: FLOW_NAME,
    status: "draft" as const,
  };
  const existing = await col.findOne(filter);
  if (existing && existing.version !== version) {
    return NextResponse.json(
      { ok: false, error: "Version conflict; refresh and retry" },
      { status: 409 }
    );
  }
  if (!validation.valid) {
    const update: Partial<FlowDocument> = {
      text,
      version: (existing?.version ?? 0) + 1,
      updatedAt: now,
      updatedBy: username,
      lastValidAt: existing?.lastValidAt ?? 0,
      lastError: { message: validation.error, at: now },
    };
    if (existing) {
      await col.updateOne(filter, { $set: update });
    } else {
      await col.insertOne({
        sessionId,
        type: FLOW_TYPE,
        name: FLOW_NAME,
        status: "draft",
        format: "json",
        schemaVersion: SCHEMA_VERSION,
        ...update,
        lastValidAt: 0,
      } as FlowDocument);
    }
    clearFlowResolverCache(sessionId);
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: 400 }
    );
  }
  const update: Partial<FlowDocument> = {
    text,
    parsed: validation.parsed,
    version: (existing?.version ?? 0) + 1,
    updatedAt: now,
    updatedBy: username,
    lastValidAt: now,
    lastError: undefined,
  };
  if (existing) {
    await col.updateOne(filter, { $set: update });
  } else {
    await col.insertOne({
      sessionId,
      type: FLOW_TYPE,
      name: FLOW_NAME,
      status: "draft",
      format: "json",
      schemaVersion: SCHEMA_VERSION,
      lastValidAt: now,
      ...update,
    } as FlowDocument);
  }
  clearFlowResolverCache(sessionId);
  return NextResponse.json({ ok: true });
}
