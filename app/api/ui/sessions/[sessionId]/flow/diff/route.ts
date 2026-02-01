import { NextResponse } from "next/server";
import { getDb, FLOW_DOCUMENTS_COLLECTION } from "@/lib/db";
import type { FlowDocument } from "@/lib/models";
import { loadFlowFromFilesystem } from "@/lib/flows/registry";
import { requireAuth } from "@/lib/ui-auth-middleware";

const FLOW_NAME = "main";
const FLOW_TYPE = "flow";

function unifiedDiff(oldText: string, newText: string): string {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (
      i < oldLines.length &&
      j < newLines.length &&
      oldLines[i] === newLines[j]
    ) {
      lines.push(" " + oldLines[i]);
      i++;
      j++;
    } else if (
      j < newLines.length &&
      (i >= oldLines.length || oldLines.indexOf(newLines[j], i) === -1)
    ) {
      lines.push("+" + newLines[j]);
      j++;
    } else if (
      i < oldLines.length &&
      (j >= newLines.length || newLines.indexOf(oldLines[i], j) === -1)
    ) {
      lines.push("-" + oldLines[i]);
      i++;
    } else {
      lines.push(" " + oldLines[i]);
      i++;
      j++;
    }
  }
  return lines.join("\n");
}

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
  const col = db.collection<FlowDocument>(FLOW_DOCUMENTS_COLLECTION);
  const draft = await col.findOne({
    sessionId,
    type: FLOW_TYPE,
    name: FLOW_NAME,
    status: "draft",
  });
  const published = await col.findOne({
    sessionId,
    type: FLOW_TYPE,
    name: FLOW_NAME,
    status: "published",
  });
  let draftText: string;
  let publishedText: string;
  if (draft) {
    draftText = draft.text;
  } else {
    const fromFs = await loadFlowFromFilesystem(sessionId);
    draftText = JSON.stringify(fromFs.config, null, 2);
  }
  if (published) {
    publishedText = published.text;
  } else {
    const fromFs = await loadFlowFromFilesystem(sessionId);
    publishedText = JSON.stringify(fromFs.config, null, 2);
  }
  const diff = unifiedDiff(publishedText, draftText);
  return NextResponse.json({
    ok: true,
    data: { draft: draftText, published: publishedText, diff },
  });
}
