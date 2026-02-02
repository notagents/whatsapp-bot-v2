"use client";

import { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MonitorConversationItem } from "@/lib/types/monitor";

function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "ahora";
  if (diff < 3600_000) return `hace ${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `hace ${Math.floor(diff / 3600_000)}h`;
  if (diff < 604800_000) return `hace ${Math.floor(diff / 86400_000)}d`;
  return new Date(ts).toLocaleDateString();
}

function displayName(whatsappId: string): string {
  const at = whatsappId.indexOf("@");
  const jid = at >= 0 ? whatsappId.slice(at + 1) : whatsappId;
  const numMatch = jid.match(/\d{6,}/);
  return numMatch ? numMatch[0].slice(-8) : jid.slice(0, 12);
}

type SinceFilter = "all" | "24h" | "7d";

type Props = {
  sessionId: string;
  selectedWhatsappId: string | null;
  onSelect: (whatsappId: string) => void;
};

export function MonitorConversationsList({
  sessionId,
  selectedWhatsappId,
  onSelect,
}: Props) {
  const [items, setItems] = useState<MonitorConversationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [since, setSince] = useState<SinceFilter>("all");
  const [onlyErrors, setOnlyErrors] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchConversations = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams();
      if (searchDebounced) params.set("search", searchDebounced);
      params.set("limit", "50");
      if (cursor) params.set("cursor", cursor);
      if (since === "24h") params.set("since", String(Date.now() - 86400_000));
      if (since === "7d") params.set("since", String(Date.now() - 604800_000));
      if (onlyErrors) params.set("onlyErrors", "true");
      const res = await fetch(
        `/api/monitor/sessions/${encodeURIComponent(
          sessionId
        )}/conversations?${params}`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json() as Promise<{
        items: MonitorConversationItem[];
        nextCursor?: string;
      }>;
    },
    [sessionId, searchDebounced, since, onlyErrors]
  );

  useEffect(() => {
    queueMicrotask(() => setLoading(true));
    fetchConversations()
      .then((data) => {
        setItems(data.items);
        setNextCursor(data.nextCursor);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [fetchConversations]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    fetchConversations(nextCursor)
      .then((data) => {
        setItems((prev) => [...prev, ...data.items]);
        setNextCursor(data.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  }, [nextCursor, loadingMore, fetchConversations]);

  return (
    <div className="flex h-full flex-col border-r">
      <div className="space-y-2 border-b p-2">
        <Input
          placeholder="Buscar por whatsappId..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={since}
            onValueChange={(v) => setSince(v as SinceFilter)}
          >
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="24h">Últimas 24h</SelectItem>
              <SelectItem value="7d">Últimos 7d</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={onlyErrors}
              onChange={(e) => setOnlyErrors(e.target.checked)}
              className="rounded"
            />
            Solo con errores
          </label>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {loading ? (
            <p className="p-3 text-muted-foreground text-sm">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="p-3 text-muted-foreground text-sm">
              Sin conversaciones.
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.whatsappId}
                type="button"
                onClick={() => onSelect(item.whatsappId)}
                className={`flex flex-col gap-0.5 border-b px-3 py-2 text-left transition-colors hover:bg-muted/50 ${
                  selectedWhatsappId === item.whatsappId ? "bg-muted" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate font-mono text-xs font-medium">
                    {displayName(item.whatsappId)}
                  </span>
                  {(item.errorCount ?? 0) > 0 && (
                    <Badge
                      variant="destructive"
                      className="shrink-0 text-[10px]"
                    >
                      {item.errorCount}
                    </Badge>
                  )}
                </div>
                <p className="truncate text-muted-foreground text-xs">
                  {item.lastSnippet || "—"}
                </p>
                <p className="text-muted-foreground text-[10px]">
                  {formatRelativeTime(item.lastMessageAt)}
                </p>
              </button>
            ))
          )}
          {nextCursor && (
            <Button
              variant="ghost"
              size="sm"
              className="m-2"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Cargando…" : "Cargar más"}
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
