import { NextResponse } from "next/server";
import { getDb, AGENT_PROMPT_DOCUMENTS_COLLECTION } from "@/lib/db";
import type { AgentPromptDocument } from "@/lib/models";
import { validatePrompt } from "@/lib/agents/prompt-validator";
import { clearPromptResolverCache } from "@/lib/agents/prompt-resolver";
import { requireAuth } from "@/lib/ui-auth-middleware";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; agentId: string }> }
) {
  let username: string;
  try {
    username = await requireAuth(request);
  } catch (res) {
    return res as Response;
  }
  const { sessionId, agentId } = await params;
  const db = await getDb();
  const col = db.collection<AgentPromptDocument>(
    AGENT_PROMPT_DOCUMENTS_COLLECTION
  );
  const draft = await col.findOne({
    sessionId,
    agentId,
    status: "draft",
  });
  if (!draft) {
    return NextResponse.json(
      { ok: false, error: "No draft found" },
      { status: 404 }
    );
  }
  const validation = validatePrompt(
    draft.systemPromptTemplate,
    draft.model,
    draft.temperature,
    draft.maxToolRounds
  );
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
    agentId,
    status: "published",
  });
  const published: Omit<AgentPromptDocument, "_id"> = {
    sessionId,
    agentId,
    status: "published",
    format: "text",
    systemPromptTemplate: draft.systemPromptTemplate,
    model: draft.model,
    temperature: draft.temperature,
    maxToolRounds: draft.maxToolRounds,
    toolsPolicy: draft.toolsPolicy,
    version: (existingPublished?.version ?? 0) + 1,
    updatedAt: now,
    updatedBy: username,
    lastValidAt: now,
  };
  await col.updateOne(
    { sessionId, agentId, status: "published" },
    { $set: published },
    { upsert: true }
  );
  clearPromptResolverCache(sessionId, agentId);
  return NextResponse.json({ ok: true });
}
