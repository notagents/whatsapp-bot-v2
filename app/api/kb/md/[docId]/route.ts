import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { getMdDocById, updateMdDoc, archiveMdDoc } from "@/lib/kb-v2/md/loader";
import { enqueueJob } from "@/lib/jobs";

type RouteParams = { params: Promise<{ docId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { docId } = await params;
  if (!ObjectId.isValid(docId)) {
    return NextResponse.json({ error: "Invalid docId" }, { status: 400 });
  }
  const doc = await getMdDocById(new ObjectId(docId));
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(doc);
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { docId } = await params;
  if (!ObjectId.isValid(docId)) {
    return NextResponse.json({ error: "Invalid docId" }, { status: 400 });
  }
  let body: {
    markdown?: string;
    title?: string;
    tags?: string[];
    version: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { markdown, title, tags, version } = body;
  if (typeof version !== "number") {
    return NextResponse.json({ error: "version required" }, { status: 400 });
  }
  const updated = await updateMdDoc(
    new ObjectId(docId),
    {
      ...(markdown !== undefined && { markdown: String(markdown) }),
      ...(title !== undefined && { title: String(title) }),
      ...(tags !== undefined && { tags: Array.isArray(tags) ? tags : [] }),
    },
    version
  );
  if (!updated) {
    return NextResponse.json({ error: "Version conflict" }, { status: 409 });
  }
  await enqueueJob({
    type: "kbReindexMarkdown",
    payload: { docId },
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { docId } = await params;
  if (!ObjectId.isValid(docId)) {
    return NextResponse.json({ error: "Invalid docId" }, { status: 400 });
  }
  const archived = await archiveMdDoc(new ObjectId(docId));
  if (!archived) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
