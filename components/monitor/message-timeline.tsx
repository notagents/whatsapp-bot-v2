"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

type MessageRow = {
  _id?: string;
  messageText: string;
  messageTime: number;
  source: "user" | "bot";
  processed: boolean;
};

type Props = {
  messages: MessageRow[];
  onMessageClick?: (messageId: string) => void;
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageTimeline({ messages, onMessageClick }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Selecciona una conversación
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-3">
        {messages.map((m) => (
          <div
            key={m._id ?? `${m.messageTime}-${m.source}`}
            className={`flex ${
              m.source === "user" ? "justify-start" : "justify-end"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 ${
                m.source === "user"
                  ? "bg-muted"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              <p className="whitespace-pre-wrap wrap-break-word text-sm">
                {m.messageText}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="text-[10px] opacity-80">
                  {formatTime(m.messageTime)}
                </span>
                <Badge
                  variant="outline"
                  className="border-0 bg-transparent px-1 text-[10px] opacity-80"
                >
                  {m.source}
                </Badge>
                <Badge
                  variant={m.processed ? "success" : "warning"}
                  className="px-1 text-[10px]"
                >
                  {m.processed ? "✓" : "⏳"}
                </Badge>
                {onMessageClick && m._id && (
                  <button
                    type="button"
                    onClick={() => onMessageClick(m._id!)}
                    className="text-[10px] underline opacity-80"
                  >
                    Ver turn
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
