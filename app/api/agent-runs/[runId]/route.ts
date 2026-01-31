import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, AGENT_RUNS_COLLECTION } from "@/lib/db";
import type { AgentRun } from "@/lib/models";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const db = await getDb();
    const agentRun = await db.collection<AgentRun>(AGENT_RUNS_COLLECTION).findOne({
      _id: new ObjectId(runId),
    });
    if (!agentRun) {
      return NextResponse.json({ error: "Agent run not found" }, { status: 404 });
    }
    return NextResponse.json({ agentRun });
  } catch (err) {
    console.error("[agent-run GET]", err);
    return NextResponse.json(
      { error: "Failed to get agent run" },
      { status: 500 }
    );
  }
}
