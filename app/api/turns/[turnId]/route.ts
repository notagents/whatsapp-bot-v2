import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, TURNS_COLLECTION, MESSAGES_COLLECTION, AGENT_RUNS_COLLECTION } from "@/lib/db";
import type { Turn, Message, AgentRun } from "@/lib/models";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ turnId: string }> }
) {
  try {
    const { turnId } = await params;
    const db = await getDb();
    const turn = await db.collection<Turn>(TURNS_COLLECTION).findOne({
      _id: new ObjectId(turnId),
    });
    if (!turn) {
      return NextResponse.json({ error: "Turn not found" }, { status: 404 });
    }
    const messages = await db
      .collection<Message>(MESSAGES_COLLECTION)
      .find({ _id: { $in: turn.messageIds } })
      .toArray();
    const agentRuns = await db
      .collection<AgentRun>(AGENT_RUNS_COLLECTION)
      .find({ turnId: turn._id })
      .toArray();
    return NextResponse.json({ turn, messages, agentRuns });
  } catch (err) {
    console.error("[turn GET]", err);
    return NextResponse.json(
      { error: "Failed to get turn" },
      { status: 500 }
    );
  }
}
