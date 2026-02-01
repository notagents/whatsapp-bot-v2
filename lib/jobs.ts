import { ObjectId } from "mongodb";
import { getDb } from "./db";
import {
  JOBS_COLLECTION,
  TURNS_COLLECTION,
  MESSAGES_COLLECTION,
  LOCKS_COLLECTION,
  AGENT_RUNS_COLLECTION,
} from "./db";
import type { Job, JobType, Turn, Message, AgentRun } from "./models";
import {
  normalizeUserID,
  isSimulatorConversation,
  parseSimulatorConversationId,
} from "./conversation";
import { reindexMarkdownDoc } from "./kb-v2/md/chunker";

const DEBOUNCE_DELAY_MS = 3000;
const LOCK_TTL_MS = 60000;
const MAX_ATTEMPTS = 3;
const UNPROCESSED_WINDOW_MS = 30000;

export type EnqueueJobPayload =
  | {
      type: "debounceTurn";
      payload: { whatsappId: string };
      scheduledFor?: number;
    }
  | { type: "runAgent"; payload: { turnId: string }; scheduledFor?: number }
  | {
      type: "sendReply";
      payload: { turnId: string; agentRunId: string };
      scheduledFor?: number;
    }
  | {
      type: "memoryUpdate";
      payload: { turnId: string; agentRunId: string };
      scheduledFor?: number;
    }
  | {
      type: "kbReindexMarkdown";
      payload: { docId: string };
      scheduledFor?: number;
    };

function getJobTypeAndPayload(enqueue: EnqueueJobPayload): {
  type: JobType;
  payload: unknown;
  scheduledFor: number;
} {
  const now = Date.now();
  switch (enqueue.type) {
    case "debounceTurn":
      return {
        type: "debounceTurn",
        payload: { whatsappId: enqueue.payload.whatsappId },
        scheduledFor: enqueue.scheduledFor ?? now + DEBOUNCE_DELAY_MS,
      };
    case "runAgent":
      return {
        type: "runAgent",
        payload: enqueue.payload,
        scheduledFor: enqueue.scheduledFor ?? now,
      };
    case "sendReply":
      return {
        type: "sendReply",
        payload: enqueue.payload,
        scheduledFor: enqueue.scheduledFor ?? now,
      };
    case "memoryUpdate":
      return {
        type: "memoryUpdate",
        payload: enqueue.payload,
        scheduledFor: enqueue.scheduledFor ?? now,
      };
    case "kbReindexMarkdown":
      return {
        type: "kbReindexMarkdown",
        payload: enqueue.payload,
        scheduledFor: enqueue.scheduledFor ?? now,
      };
    default:
      throw new Error("Unknown job type");
  }
}

export async function enqueueJob(
  enqueue: EnqueueJobPayload
): Promise<ObjectId> {
  const { type, payload, scheduledFor } = getJobTypeAndPayload(enqueue);
  const db = await getDb();
  const col = db.collection<Job>(JOBS_COLLECTION);
  const now = Date.now();
  const doc: Omit<Job, "_id"> = {
    type,
    status: "pending",
    payload,
    scheduledFor,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    createdAt: now,
  };
  const result = await col.insertOne(doc as Job);
  return result.insertedId;
}

async function acquireLock(key: string): Promise<boolean> {
  const db = await getDb();
  const col = db.collection<{ key: string; expiresAt: number }>(
    LOCKS_COLLECTION
  );
  const now = Date.now();
  const existing = await col.findOne({ key });
  if (existing && existing.expiresAt > now) return false;
  await col.updateOne(
    { key },
    { $set: { key, expiresAt: now + LOCK_TTL_MS } },
    { upsert: true }
  );
  return true;
}

async function releaseLock(key: string): Promise<void> {
  const db = await getDb();
  await db.collection(LOCKS_COLLECTION).deleteOne({ key });
}

async function getUnprocessedMessages(
  whatsappId: string,
  windowMs: number
): Promise<Message[]> {
  const db = await getDb();
  const since = Math.floor((Date.now() - windowMs) / 1000);
  const messages = await db
    .collection<Message>(MESSAGES_COLLECTION)
    .find({
      whatsappId,
      source: "user",
      processed: false,
      messageTime: { $gte: since },
    })
    .sort({ messageTime: 1 })
    .limit(50)
    .toArray();
  return messages;
}

async function markMessagesProcessed(messageIds: ObjectId[]): Promise<void> {
  if (messageIds.length === 0) return;
  const db = await getDb();
  await db
    .collection<Message>(MESSAGES_COLLECTION)
    .updateMany({ _id: { $in: messageIds } }, { $set: { processed: true } });
}

async function processDebounceTurn(job: Job): Promise<void> {
  const payload = job.payload as { whatsappId: string };
  const { whatsappId } = payload;
  const lockKey = `turn:${whatsappId}`;
  const acquired = await acquireLock(lockKey);
  if (!acquired) return;
  try {
    const messages = await getUnprocessedMessages(
      whatsappId,
      UNPROCESSED_WINDOW_MS
    );
    if (messages.length === 0) return;
    const first = messages[0];
    const turnDoc: Omit<Turn, "_id"> = {
      whatsappId,
      sessionId: first.sessionId,
      userID: normalizeUserID(first.userID),
      channel: first.channel,
      createdAt: Date.now(),
      messageIds: messages.map((m) => m._id!).filter(Boolean),
      text: messages
        .map((m) => m.messageText)
        .join(" ")
        .trim(),
      status: "queued",
      ...(first.configOverride && { configOverride: first.configOverride }),
    };
    const db = await getDb();
    const turnResult = await db
      .collection<Turn>(TURNS_COLLECTION)
      .insertOne(turnDoc as Turn);
    const turnId = turnResult.insertedId!;
    await markMessagesProcessed(turnDoc.messageIds);
    await enqueueJob({
      type: "runAgent",
      payload: { turnId: turnId.toString() },
      scheduledFor: Date.now(),
    });
  } finally {
    await releaseLock(lockKey);
  }
}

export async function processNextJob(): Promise<boolean> {
  const db = await getDb();
  const col = db.collection<Job>(JOBS_COLLECTION);
  const job = await col.findOneAndUpdate(
    { status: "pending", scheduledFor: { $lte: Date.now() } },
    {
      $set: { status: "processing" as const, startedAt: Date.now() },
      $inc: { attempts: 1 },
    },
    { sort: { scheduledFor: 1 }, returnDocument: "after" }
  );
  if (!job) return false;
  try {
    switch (job.type) {
      case "debounceTurn":
        await processDebounceTurn(job);
        break;
      case "runAgent":
        await processRunAgentImpl(job);
        break;
      case "sendReply":
        await processSendReplyImpl(job);
        break;
      case "memoryUpdate":
        await processMemoryUpdateImpl(job);
        break;
      case "kbReindexMarkdown":
        await processKbReindexMarkdown(job);
        break;
      default:
        throw new Error(`Unknown job type: ${(job as Job).type}`);
    }
    await col.updateOne(
      { _id: job._id },
      { $set: { status: "completed" as const, completedAt: Date.now() } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const shouldRetry = job.attempts < job.maxAttempts;
    await col.updateOne(
      { _id: job._id },
      {
        $set: {
          status: (shouldRetry ? "pending" : "failed") as Job["status"],
          error: errorMessage,
          ...(shouldRetry ? { scheduledFor: Date.now() + 10000 } : {}),
        },
      }
    );
    throw err;
  }
  return true;
}

const RATE_LIMIT_TURNS_PER_MINUTE = 5;

async function processRunAgentImpl(job: Job): Promise<void> {
  const payload = job.payload as { turnId: string };
  const turnId = new ObjectId(payload.turnId);
  const db = await getDb();
  const turn = await db
    .collection<Turn>(TURNS_COLLECTION)
    .findOne({ _id: turnId });
  if (!turn) throw new Error(`Turn not found: ${payload.turnId}`);
  const claimed = await db
    .collection<Turn>(TURNS_COLLECTION)
    .updateOne(
      { _id: turnId, status: "queued" },
      { $set: { status: "running" as const } }
    );
  if (claimed.modifiedCount === 0) return;
  const oneMinuteAgo = Date.now() - 60000;
  const recentCount = await db
    .collection<Turn>(TURNS_COLLECTION)
    .countDocuments({
      whatsappId: turn.whatsappId,
      createdAt: { $gte: oneMinuteAgo },
      status: { $in: ["done", "running"] },
    });
  if (recentCount > RATE_LIMIT_TURNS_PER_MINUTE) {
    console.warn("[runAgent] Blocked: rate_limit", {
      whatsappId: turn.whatsappId,
      recentCount,
    });
    await db.collection<Turn>(TURNS_COLLECTION).updateOne(
      { _id: turnId },
      {
        $set: {
          status: "blocked" as const,
          "response.blockedReason": "rate_limit",
        },
      }
    );
    return;
  }
  const { getResponsesEnabled } = await import("@/lib/conversation-state");
  const responseConfig = await getResponsesEnabled(turn.whatsappId);
  if (!responseConfig.enabled) {
    console.warn("[runAgent] Blocked: responses_disabled", {
      whatsappId: turn.whatsappId,
    });
    await db.collection<Turn>(TURNS_COLLECTION).updateOne(
      { _id: turnId },
      {
        $set: {
          status: "blocked" as const,
          "response.blockedReason": "responses_disabled",
        },
      }
    );
    return;
  }
  if (responseConfig.disabledUntilUTC) {
    const until = new Date(responseConfig.disabledUntilUTC);
    if (until > new Date()) {
      console.warn("[runAgent] Blocked: cooldown_active", {
        whatsappId: turn.whatsappId,
        disabledUntilUTC: responseConfig.disabledUntilUTC,
      });
      await db.collection<Turn>(TURNS_COLLECTION).updateOne(
        { _id: turnId },
        {
          $set: {
            status: "blocked" as const,
            "response.blockedReason": "cooldown_active",
          },
        }
      );
      return;
    }
  }
  const { buildContext } = await import("@/lib/context");
  const { resolveFlow } = await import("@/lib/flows/registry");
  const { executeFlow } = await import("@/lib/flows/runtime");
  const context = await buildContext(turn.whatsappId);
  const resolvedFlow = await resolveFlow(turn.sessionId);
  const flowResult = await executeFlow({
    sessionId: turn.sessionId,
    turn,
    context,
    resolvedFlow,
  });
  await db.collection<Turn>(TURNS_COLLECTION).updateOne(
    { _id: turnId },
    {
      $set: {
        "meta.flow": {
          mode: flowResult.meta.mode,
          flowPath: flowResult.meta.flowPath,
          ...(flowResult.meta.state && { state: flowResult.meta.state }),
          ...(flowResult.meta.kbUsed !== undefined && {
            kbUsed: flowResult.meta.kbUsed,
          }),
          ...(flowResult.meta.kbChunks !== undefined && {
            kbChunks: flowResult.meta.kbChunks,
          }),
        },
        status: "done" as const,
      },
    }
  );
  let agentRunId: ObjectId;
  if (flowResult.agentRun?._id) {
    agentRunId = flowResult.agentRun._id;
  } else if (flowResult.assistantText) {
    const syntheticRun: Omit<AgentRun, "_id"> = {
      turnId,
      whatsappId: turn.whatsappId,
      agentId: "flow_reply",
      startedAt: Date.now(),
      endedAt: Date.now(),
      status: "success",
      input: {
        systemPromptVersion: "flow",
        messages: [],
        context: {
          recentMessages: context.recentMessages,
          memory: context.memory,
          state: context.state,
        },
      },
      output: { assistantText: flowResult.assistantText },
    };
    const insertResult = await db
      .collection<AgentRun>(AGENT_RUNS_COLLECTION)
      .insertOne(syntheticRun as AgentRun);
    agentRunId = insertResult.insertedId!;
  } else {
    return;
  }
  if (flowResult.assistantText) {
    await enqueueJob({
      type: "sendReply",
      payload: { turnId: turnId.toString(), agentRunId: agentRunId.toString() },
      scheduledFor: Date.now(),
    });
    await enqueueJob({
      type: "memoryUpdate",
      payload: { turnId: turnId.toString(), agentRunId: agentRunId.toString() },
      scheduledFor: Date.now() + 5000,
    });
  }
}

async function processSendReplyImpl(job: Job): Promise<void> {
  const { getResponsesEnabled, isInCooldown } = await import(
    "@/lib/conversation-state"
  );
  const { getActualJid } = await import("@/lib/conversation");
  const { sendWhatsAppMessage } = await import("@/lib/send-whatsapp");
  const payload = job.payload as { turnId: string; agentRunId: string };
  const db = await getDb();
  const turn = await db.collection<Turn>(TURNS_COLLECTION).findOne({
    _id: new ObjectId(payload.turnId),
  });
  if (!turn) throw new Error(`Turn not found: ${payload.turnId}`);
  const agentRun = await db
    .collection<AgentRun>(AGENT_RUNS_COLLECTION)
    .findOne({ _id: new ObjectId(payload.agentRunId) });
  const assistantText = agentRun?.output?.assistantText;
  if (!agentRun || !assistantText) {
    throw new Error(`Agent run not found or no output: ${payload.agentRunId}`);
  }
  const responseConfig = await getResponsesEnabled(turn.whatsappId);
  if (!responseConfig.enabled || isInCooldown(responseConfig)) {
    console.warn("[sendReply] Skipped: responses disabled or cooldown", {
      whatsappId: turn.whatsappId,
      enabled: responseConfig.enabled,
      disabledUntilUTC: responseConfig.disabledUntilUTC,
    });
    await db
      .collection<Turn>(TURNS_COLLECTION)
      .updateOne(
        { _id: turn._id },
        { $set: { "response.blockedReason": "responses_disabled_on_send" } }
      );
    return;
  }

  if (isSimulatorConversation(turn.whatsappId)) {
    const parsed = parseSimulatorConversationId(turn.whatsappId);
    const botDoc: Message = {
      whatsappId: turn.whatsappId,
      sessionId: parsed?.sessionId ?? turn.sessionId,
      userID: parsed?.testUserId ?? turn.userID,
      channel: "simulator",
      messageText: assistantText,
      messageTime: Math.floor(Date.now() / 1000),
      source: "bot",
      processed: true,
    };
    const insertResult = await db
      .collection<Message>(MESSAGES_COLLECTION)
      .insertOne(botDoc);
    await db.collection<Turn>(TURNS_COLLECTION).updateOne(
      { _id: turn._id },
      {
        $set: {
          "response.text": assistantText,
          "response.sentAt": Date.now(),
          ...(insertResult.insertedId && {
            "response.messageId": insertResult.insertedId,
          }),
        },
      }
    );
    return;
  }

  const jid = getActualJid(turn.whatsappId);
  const result = await sendWhatsAppMessage({
    sessionId: turn.sessionId,
    jid,
    text: assistantText,
    whatsappId: turn.whatsappId,
  });
  await db.collection<Turn>(TURNS_COLLECTION).updateOne(
    { _id: turn._id },
    {
      $set: {
        "response.text": assistantText,
        "response.sentAt": Date.now(),
        ...(result.messageId && { "response.messageId": result.messageId }),
      },
    }
  );
}

async function processKbReindexMarkdown(job: Job): Promise<void> {
  const payload = job.payload as { docId: string };
  await reindexMarkdownDoc(new ObjectId(payload.docId));
}

async function processMemoryUpdateImpl(job: Job): Promise<void> {
  const {
    extractFactsFromTurn,
    upsertMemoryFacts,
    generateRecap,
    updateMemoryRecap,
  } = await import("@/lib/memory");
  const { getRecentTurns } = await import("@/lib/turns");
  const payload = job.payload as { turnId: string };
  const db = await getDb();
  const turn = await db.collection<Turn>(TURNS_COLLECTION).findOne({
    _id: new ObjectId(payload.turnId),
  });
  if (!turn) return;
  const facts = await extractFactsFromTurn(turn);
  await upsertMemoryFacts(turn.whatsappId, turn.userID, facts);
  const recentTurns = await getRecentTurns(turn.whatsappId, 10);
  const recap = await generateRecap(recentTurns);
  await updateMemoryRecap(turn.whatsappId, recap);
}

export async function pollJobs(): Promise<never> {
  for (;;) {
    try {
      const hadJob = await processNextJob();
      if (!hadJob) await sleep(2000);
    } catch (err) {
      console.error("[pollJobs] Error:", err);
      await sleep(5000);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
