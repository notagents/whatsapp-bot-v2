import { NextResponse } from "next/server";
import { listMdDocs, createMdDoc } from "@/lib/kb-v2/md/loader";
import { enqueueJob } from "@/lib/jobs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  const status = searchParams.get("status") as "active" | "archived" | null;
  const docs = await listMdDocs(sessionId, status ?? undefined);
  return NextResponse.json({ docs });
}

export async function POST(request: Request) {
  let body: {
    sessionId: string;
    slug: string;
    title: string;
    markdown?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { sessionId, slug, title, markdown = "" } = body;
  if (!sessionId || !slug?.trim() || !title?.trim()) {
    return NextResponse.json(
      { error: "sessionId, slug, title required" },
      { status: 400 }
    );
  }
  const docId = await createMdDoc({
    sessionId,
    slug: slug.trim(),
    title: title.trim(),
    markdown: String(markdown ?? "").trim(),
    status: "active",
    updatedAt: 0,
  });
  await enqueueJob({
    type: "kbReindexMarkdown",
    payload: { docId: docId.toString() },
  });
  return NextResponse.json({ docId });
}
