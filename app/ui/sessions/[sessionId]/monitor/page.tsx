"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MonitorConversationsList } from "@/components/monitor/conversations-list";
import { MessageTimeline } from "@/components/monitor/message-timeline";
import { DebugPanel } from "@/components/monitor/debug-panel";
import type { MonitorConversationDetail } from "@/lib/types/monitor";

export default function MonitorPage() {
  const params = useParams();
  const sessionId =
    typeof params.sessionId === "string" ? params.sessionId : "";
  const [selectedWhatsappId, setSelectedWhatsappId] = useState<string | null>(
    null
  );
  const [conversationDetail, setConversationDetail] =
    useState<MonitorConversationDetail | null>(null);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!selectedWhatsappId || !sessionId) {
      queueMicrotask(() => {
        setConversationDetail(null);
        setSelectedTurnId(null);
      });
      return;
    }
    queueMicrotask(() => setLoadingDetail(true));
    const url = `/api/monitor/sessions/${encodeURIComponent(
      sessionId
    )}/conversations/${encodeURIComponent(
      selectedWhatsappId
    )}?limitMessages=200&limitTurns=50`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json() as Promise<MonitorConversationDetail>;
      })
      .then(setConversationDetail)
      .catch(() => setConversationDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [sessionId, selectedWhatsappId]);

  const handleMessageClick = useCallback((messageId: string) => {
    setConversationDetail((prev) => {
      if (!prev) return prev;
      const turn = prev.turns.find((t) =>
        (t.messageIds ?? []).includes(messageId)
      );
      if (turn?._id) setSelectedTurnId(turn._id);
      return prev;
    });
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/ui/sessions/${sessionId}`}>← Sesión</Link>
          </Button>
          <h1 className="font-semibold">Monitor · {sessionId}</h1>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1.2fr)]">
        <div className="min-w-0 border-r">
          <MonitorConversationsList
            sessionId={sessionId}
            selectedWhatsappId={selectedWhatsappId}
            onSelect={setSelectedWhatsappId}
          />
        </div>
        <div className="min-h-0 min-w-0">
          {loadingDetail ? (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              Cargando…
            </div>
          ) : (
            <MessageTimeline
              messages={conversationDetail?.messages ?? []}
              onMessageClick={handleMessageClick}
            />
          )}
        </div>
        <div className="min-h-0 w-[min(400px,100%)]">
          <DebugPanel
            conversationDetail={conversationDetail}
            selectedTurnId={selectedTurnId}
          />
        </div>
      </div>
    </div>
  );
}
