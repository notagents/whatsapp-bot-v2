import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/ui-auth-middleware";
import {
  getSynonymsConfig,
  upsertSynonymsConfig,
  addSynonymGroup,
  deleteSynonymGroupByIndex,
  deleteSynonymsConfig,
} from "@/lib/kb-v2/tables/synonyms";
import type { KbSynonymGroup } from "@/lib/kb-v2/types";

type RouteParams = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  try {
    await requireAuth(request);
  } catch (res) {
    return res as Response;
  }
  const { sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  const config = await getSynonymsConfig(sessionId);
  return NextResponse.json({
    ok: true,
    data: config ?? { sessionId, synonymGroups: [], updatedAt: 0 },
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    await requireAuth(request);
  } catch (res) {
    return res as Response;
  }
  const { sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  let body: { synonymGroups?: KbSynonymGroup[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }
  const synonymGroups = Array.isArray(body.synonymGroups)
    ? body.synonymGroups
    : [];
  const valid = synonymGroups.every(
    (g) => g && Array.isArray(g.terms) && typeof g.enabled === "boolean"
  );
  if (!valid) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "synonymGroups must be an array of { terms: string[], category?: string, enabled: boolean }",
      },
      { status: 400 }
    );
  }
  await upsertSynonymsConfig(sessionId, synonymGroups);
  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    await requireAuth(request);
  } catch (res) {
    return res as Response;
  }
  const { sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  let body: { terms?: string[]; category?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }
  const terms = Array.isArray(body.terms) ? body.terms : [];
  const enabled = typeof body.enabled === "boolean" ? body.enabled : true;
  const category =
    typeof body.category === "string" ? body.category : undefined;
  if (terms.length === 0) {
    return NextResponse.json(
      { ok: false, error: "terms (non-empty array) required" },
      { status: 400 }
    );
  }
  const group: KbSynonymGroup = {
    terms,
    enabled,
    ...(category && { category }),
  };
  const config = await addSynonymGroup(sessionId, group);
  return NextResponse.json({ ok: true, data: config });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    await requireAuth(request);
  } catch (res) {
    return res as Response;
  }
  const { sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  const url = new URL(request.url);
  const groupIndexParam = url.searchParams.get("groupIndex");
  let groupIndex: number | undefined;
  if (groupIndexParam !== null) {
    const n = parseInt(groupIndexParam, 10);
    if (!Number.isNaN(n)) groupIndex = n;
  }
  if (groupIndex === undefined) {
    try {
      const body = await request.json();
      if (typeof (body as { groupIndex?: number }).groupIndex === "number") {
        groupIndex = (body as { groupIndex: number }).groupIndex;
      }
    } catch {
      void 0;
    }
  }
  if (typeof groupIndex === "number") {
    const removed = await deleteSynonymGroupByIndex(sessionId, groupIndex);
    if (!removed) {
      return NextResponse.json(
        { ok: false, error: "Group not found or index out of range" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  }
  const deleted = await deleteSynonymsConfig(sessionId);
  if (!deleted) {
    return NextResponse.json(
      { ok: false, error: "Config not found" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
