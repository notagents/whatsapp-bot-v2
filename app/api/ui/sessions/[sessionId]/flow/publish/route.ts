import { NextResponse } from "next/server";
import { getDb, FLOW_DOCUMENTS_COLLECTION } from "@/lib/db";
import type { FlowDocument } from "@/lib/models";
import { validateFlow } from "@/lib/flows/validator";
import { clearFlowResolverCache } from "@/lib/flows/resolver";
import { requireAuth } from "@/lib/ui-auth-middleware";

const FLOW_NAME = "main";
const FLOW_TYPE = "flow";
const SCHEMA_VERSION = 1;

export async function POST(
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
  const db = await getDb();
  const col = db.collection<FlowDocument>(FLOW_DOCUMENTS_COLLECTION);
  const draft = await col.findOne({
    sessionId,
    type: FLOW_TYPE,
    name: FLOW_NAME,
    status: "draft",
  });
  if (!draft) {
    return NextResponse.json(
      { ok: false, error: "No draft found" },
      { status: 404 }
    );
  }
  const validation = validateFlow(draft.text);
  if (!validation.valid) {
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: 400 }
    );
  }
  if (draft.lastError) {
    return NextResponse.json(
      { ok: false, error: "Draft has validation errors" },
      { status: 400 }
    );
  }
  const now = Date.now();
  const existingPublished = await col.findOne({
    sessionId,
    type: FLOW_TYPE,
    name: FLOW_NAME,
    status: "published",
  });
  const published: Omit<FlowDocument, "_id"> = {
    sessionId,
    type: FLOW_TYPE,
    name: FLOW_NAME,
    status: "published",
    format: "json",
    text: draft.text,
    parsed: validation.parsed,
    schemaVersion: SCHEMA_VERSION,
    version: (existingPublished?.version ?? 0) + 1,
    updatedAt: now,
    updatedBy: username,
    lastValidAt: now,
  };
  await col.updateOne(
    {
      sessionId,
      type: FLOW_TYPE,
      name: FLOW_NAME,
      status: "published",
    },
    { $set: published },
    { upsert: true }
  );
  clearFlowResolverCache(sessionId);
  return NextResponse.json({ ok: true });
}
