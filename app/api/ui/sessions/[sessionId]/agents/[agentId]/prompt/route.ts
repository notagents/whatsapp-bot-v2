import { NextResponse } from "next/server";
import { getDb, AGENT_PROMPT_DOCUMENTS_COLLECTION } from "@/lib/db";
import type { AgentPromptDocument } from "@/lib/models";
import { validatePrompt } from "@/lib/agents/prompt-validator";
import { clearPromptResolverCache } from "@/lib/agents/prompt-resolver";
import { getFallbackConfig } from "@/lib/agents/prompt-resolver";
import { requireAuth } from "@/lib/ui-auth-middleware";

type Status = "draft" | "published";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; agentId: string }> }
) {
  try {
    await requireAuth(request);
  } catch (res) {
    return res as Response;
  }
  const { sessionId, agentId } = await params;
  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") ?? "draft") as Status;
  if (status !== "draft" && status !== "published") {
    return NextResponse.json(
      { ok: false, error: "Invalid status" },
      { status: 400 }
    );
  }
  const db = await getDb();
  const col = db.collection<AgentPromptDocument>(
    AGENT_PROMPT_DOCUMENTS_COLLECTION
  );
  let doc = await col.findOne({ sessionId, agentId, status });
  if (!doc) doc = await col.findOne({ sessionId: "*", agentId, status });
  if (doc) {
    return NextResponse.json({
      ok: true,
      data: {
        sessionId: doc.sessionId,
        agentId: doc.agentId,
        status: doc.status,
        systemPromptTemplate: doc.systemPromptTemplate,
        model: doc.model,
        temperature: doc.temperature,
        maxToolRounds: doc.maxToolRounds,
        toolsPolicy: doc.toolsPolicy,
        version: doc.version,
        updatedAt: doc.updatedAt,
        updatedBy: doc.updatedBy,
        lastValidAt: doc.lastValidAt,
        lastError: doc.lastError,
        existsInDB: true,
      },
    });
  }
  const fallback = getFallbackConfig(agentId);
  return NextResponse.json({
    ok: true,
    data: {
      sessionId,
      agentId,
      status,
      systemPromptTemplate: fallback.systemPromptTemplate,
      model: fallback.model,
      temperature: fallback.temperature,
      maxToolRounds: fallback.maxToolRounds,
      toolsPolicy: fallback.toolsPolicy,
      version: 0,
      updatedAt: 0,
      updatedBy: "",
      existsInDB: false,
    },
  });
}

export async function PUT(
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
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  if (status !== "draft") {
    return NextResponse.json(
      { ok: false, error: "Only draft can be updated via PUT" },
      { status: 400 }
    );
  }
  let body: {
    systemPromptTemplate?: string;
    model?: string;
    temperature?: number;
    maxToolRounds?: number;
    version?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid body" },
      { status: 400 }
    );
  }
  const systemPromptTemplate = body.systemPromptTemplate ?? "";
  const model = body.model ?? "gpt-5-mini";
  const temperature = body.temperature ?? 0.7;
  const maxToolRounds = body.maxToolRounds ?? 5;
  const version = body.version ?? 0;
  const validation = validatePrompt(
    systemPromptTemplate,
    model,
    temperature,
    maxToolRounds
  );
  const now = Date.now();
  const db = await getDb();
  const col = db.collection<AgentPromptDocument>(
    AGENT_PROMPT_DOCUMENTS_COLLECTION
  );
  const filter = { sessionId, agentId, status: "draft" as const };
  const existing = await col.findOne(filter);
  if (existing && existing.version !== version) {
    return NextResponse.json(
      { ok: false, error: "Version conflict; refresh and retry" },
      { status: 409 }
    );
  }
  if (!validation.valid) {
    const update: Partial<AgentPromptDocument> = {
      systemPromptTemplate,
      model,
      temperature,
      maxToolRounds,
      version: (existing?.version ?? 0) + 1,
      updatedAt: now,
      updatedBy: username,
      lastError: { message: validation.error, at: now },
    };
    if (existing) {
      await col.updateOne(filter, { $set: update });
    } else {
      await col.insertOne({
        sessionId,
        agentId,
        status: "draft",
        format: "text",
        lastValidAt: 0,
        ...update,
      } as AgentPromptDocument);
    }
    clearPromptResolverCache(sessionId, agentId);
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: 400 }
    );
  }
  const update: Partial<AgentPromptDocument> = {
    systemPromptTemplate,
    model,
    temperature,
    maxToolRounds,
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
      agentId,
      status: "draft",
      format: "text",
      lastValidAt: now,
      ...update,
    } as AgentPromptDocument);
  }
  clearPromptResolverCache(sessionId, agentId);
  return NextResponse.json({ ok: true });
}
