import { NextRequest, NextResponse } from "next/server";
import {
  getDb,
  MESSAGES_COLLECTION,
  TURNS_COLLECTION,
  AGENT_RUNS_COLLECTION,
  CONVERSATION_STATE_COLLECTION,
  MEMORY_COLLECTION,
  RESPONSES_ENABLED_COLLECTION,
} from "@/lib/db";
import type {
  Message,
  Turn,
  AgentRun,
  ConversationStateDoc,
  Memory,
  ResponsesEnabled,
} from "@/lib/models";
import type { MonitorConversationDetail } from "@/lib/types/monitor";
import { getSessionIdFromComposite } from "@/lib/conversation";
import { requireAuth } from "@/lib/ui-auth-middleware";

function toSerializable<T extends { _id?: unknown }>(
  doc: T
): Omit<T, "_id"> & { _id?: string } {
  if (doc == null) return doc as Omit<T, "_id"> & { _id?: string };
  const { _id, ...rest } = doc;
  return { ...rest, _id: _id != null ? String(_id) : undefined } as Omit<
    T,
    "_id"
  > & {
    _id?: string;
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; whatsappId: string }> }
) {
  try {
    await requireAuth(_request);
  } catch (res) {
    return res as Response;
  }
  try {
    const { sessionId, whatsappId: rawWhatsappId } = await params;
    const whatsappId = decodeURIComponent(rawWhatsappId);
    const extractedSessionId = getSessionIdFromComposite(whatsappId);
    if (extractedSessionId !== sessionId) {
      return NextResponse.json(
        { error: "Invalid whatsappId for session" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(_request.url);
    const limitMessages = Math.min(
      Math.max(1, parseInt(searchParams.get("limitMessages") ?? "200", 10)),
      500
    );
    const limitTurns = Math.min(
      Math.max(1, parseInt(searchParams.get("limitTurns") ?? "50", 10)),
      100
    );
    const limitRuns = Math.min(
      Math.max(1, parseInt(searchParams.get("limitRuns") ?? "50", 10)),
      100
    );
    const includeRuns = searchParams.get("includeRuns") !== "false";

    const db = await getDb();
    const messagesCol = db.collection<Message>(MESSAGES_COLLECTION);
    const turnsCol = db.collection<Turn>(TURNS_COLLECTION);
    const agentRunsCol = db.collection<AgentRun>(AGENT_RUNS_COLLECTION);
    const stateCol = db.collection<ConversationStateDoc>(
      CONVERSATION_STATE_COLLECTION
    );
    const memoryCol = db.collection<Memory>(MEMORY_COLLECTION);
    const responsesCol = db.collection<ResponsesEnabled>(
      RESPONSES_ENABLED_COLLECTION
    );

    const [messages, turns, agentRuns, state, memory, responsesEnabled] =
      await Promise.all([
        messagesCol
          .find({ whatsappId, channel: "whatsapp" })
          .sort({ messageTime: 1 })
          .limit(limitMessages)
          .toArray(),
        turnsCol
          .find({ whatsappId })
          .sort({ createdAt: -1 })
          .limit(limitTurns)
          .toArray(),
        includeRuns
          ? agentRunsCol
              .find({ whatsappId })
              .sort({ startedAt: -1 })
              .limit(limitRuns)
              .toArray()
          : Promise.resolve([]),
        stateCol.findOne({ whatsappId }),
        memoryCol.findOne({ whatsappId }),
        responsesCol.findOne({ whatsappId }),
      ]);

    const serializedMessages = messages.map((m) =>
      toSerializable(m)
    ) as MonitorConversationDetail["messages"];
    const serializedTurns = turns.map((t) => ({
      ...toSerializable(t),
      messageIds: (t.messageIds ?? []).map(String),
    })) as MonitorConversationDetail["turns"];
    const serializedRuns = agentRuns.map((r) => ({
      ...toSerializable(r),
      turnId: r.turnId ? String(r.turnId) : "",
    })) as MonitorConversationDetail["agentRuns"];

    const response: MonitorConversationDetail = {
      conversation: { sessionId, whatsappId },
      messages: serializedMessages,
      turns: serializedTurns,
      agentRuns: serializedRuns,
      state: state
        ? {
            whatsappId: state.whatsappId,
            state: state.state,
            updatedAt: state.updatedAt,
          }
        : null,
      memory: memory
        ? {
            whatsappId: memory.whatsappId,
            userID: memory.userID,
            facts: memory.facts ?? [],
            recap: memory.recap ?? { text: "", updatedAt: 0 },
            structuredContext: memory.structuredContext,
            contextSchemaVersion: memory.contextSchemaVersion,
          }
        : null,
      responsesEnabled: responsesEnabled ?? null,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[monitor conversation detail GET]", err);
    return NextResponse.json(
      { error: "Failed to get conversation detail" },
      { status: 500 }
    );
  }
}
