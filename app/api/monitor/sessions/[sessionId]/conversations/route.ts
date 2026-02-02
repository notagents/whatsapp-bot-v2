import { NextRequest, NextResponse } from "next/server";
import { getDb, MESSAGES_COLLECTION, TURNS_COLLECTION } from "@/lib/db";
import type { Message } from "@/lib/models";
import type {
  MonitorConversationItem,
  MonitorConversationsResponse,
} from "@/lib/types/monitor";
import { requireAuth } from "@/lib/ui-auth-middleware";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function encodeCursor(lastMessageAt: number, whatsappId: string): string {
  return Buffer.from(JSON.stringify({ lastMessageAt, whatsappId })).toString(
    "base64url"
  );
}

function decodeCursor(
  cursor: string
): { lastMessageAt: number; whatsappId: string } | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    );
    if (
      typeof decoded.lastMessageAt !== "number" ||
      typeof decoded.whatsappId !== "string"
    )
      return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireAuth(request);
  } catch (res) {
    return res as Response;
  }
  try {
    const { sessionId } = await params;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)),
      100
    );
    const cursor = searchParams.get("cursor") ?? "";
    const sinceParam = searchParams.get("since");
    const since = sinceParam ? parseInt(sinceParam, 10) : undefined;
    const onlyErrors = searchParams.get("onlyErrors") === "true";

    const db = await getDb();
    const messages = db.collection<Message>(MESSAGES_COLLECTION);
    const turns = db.collection(TURNS_COLLECTION);

    let whatsappIdsWithErrors: string[] | null = null;
    if (onlyErrors) {
      const failed = await turns
        .find({ sessionId, status: "failed" })
        .project({ whatsappId: 1 })
        .toArray();
      whatsappIdsWithErrors = [
        ...new Set(failed.map((t) => (t as { whatsappId: string }).whatsappId)),
      ];
      if (whatsappIdsWithErrors.length === 0) {
        return NextResponse.json({ items: [], nextCursor: undefined });
      }
    }

    const matchStage: Record<string, unknown> = {
      sessionId,
      channel: "whatsapp",
    };
    if (since != null && !Number.isNaN(since)) {
      matchStage.messageTime = { $gte: since };
    }
    if (whatsappIdsWithErrors) {
      const ids = search
        ? whatsappIdsWithErrors.filter((id) =>
            id.toLowerCase().includes(search.toLowerCase())
          )
        : whatsappIdsWithErrors;
      matchStage.whatsappId =
        ids.length > 0 ? { $in: ids } : { $in: ["__none__"] };
    } else if (search) {
      matchStage.whatsappId = { $regex: escapeRegex(search), $options: "i" };
    }

    const pipeline: Record<string, unknown>[] = [
      { $match: matchStage },
      { $sort: { messageTime: -1 } },
      {
        $group: {
          _id: "$whatsappId",
          lastMessageAt: { $first: "$messageTime" },
          lastMessageText: { $first: "$messageText" },
          lastSource: { $first: "$source" },
        },
      },
      { $sort: { lastMessageAt: -1, _id: 1 } },
    ];

    const decodedCursor = cursor ? decodeCursor(cursor) : null;
    if (decodedCursor) {
      pipeline.push({
        $match: {
          $or: [
            { lastMessageAt: { $lt: decodedCursor.lastMessageAt } },
            {
              lastMessageAt: decodedCursor.lastMessageAt,
              _id: { $gt: decodedCursor.whatsappId },
            },
          ],
        },
      });
    }

    pipeline.push({ $limit: limit + 1 });

    const agg = await messages
      .aggregate<{
        _id: string;
        lastMessageAt: number;
        lastMessageText: string;
        lastSource: "user" | "bot";
      }>(pipeline)
      .toArray();

    const hasMore = agg.length > limit;
    const itemsSlice = hasMore ? agg.slice(0, limit) : agg;
    const whatsappIds = itemsSlice.map((r) => r._id);

    const errorCountMap = new Map<string, number>();
    const turnsLast24hMap = new Map<string, number>();
    if (whatsappIds.length > 0) {
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const [turns24h, failedTurns] = await Promise.all([
        turns
          .aggregate<{ _id: string; count: number }>([
            {
              $match: {
                whatsappId: { $in: whatsappIds },
                createdAt: { $gte: now - oneDayMs },
              },
            },
            { $group: { _id: "$whatsappId", count: { $sum: 1 } } },
          ])
          .toArray(),
        turns
          .aggregate<{ _id: string; count: number }>([
            {
              $match: {
                whatsappId: { $in: whatsappIds },
                status: "failed",
              },
            },
            { $group: { _id: "$whatsappId", count: { $sum: 1 } } },
          ])
          .toArray(),
      ]);
      turns24h.forEach((t) => turnsLast24hMap.set(t._id, t.count));
      failedTurns.forEach((t) => errorCountMap.set(t._id, t.count));
    }

    const items: MonitorConversationItem[] = itemsSlice.map((r) => ({
      whatsappId: r._id,
      lastMessageAt: r.lastMessageAt,
      lastSnippet: r.lastMessageText?.slice(0, 200) ?? "",
      lastSource: r.lastSource,
      turnsLast24h: turnsLast24hMap.get(r._id),
      errorCount: errorCountMap.get(r._id),
    }));

    let nextCursor: string | undefined;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      nextCursor = encodeCursor(last.lastMessageAt, last.whatsappId);
    }

    const response: MonitorConversationsResponse = { items, nextCursor };
    return NextResponse.json(response);
  } catch (err) {
    console.error("[monitor conversations GET]", err);
    return NextResponse.json(
      { error: "Failed to list conversations" },
      { status: 500 }
    );
  }
}
