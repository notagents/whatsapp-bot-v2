"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MonitorConversationDetail } from "@/lib/types/monitor";

type Props = {
  turns: MonitorConversationDetail["turns"];
  selectedTurnId: string | null;
};

function formatRelative(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "ahora";
  if (diff < 3600_000) return `hace ${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `hace ${Math.floor(diff / 3600_000)}h`;
  return new Date(ts).toLocaleString();
}

export function TurnsTab({ turns, selectedTurnId }: Props) {
  if (turns.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Sin turns para esta conversación.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Hora</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Router</TableHead>
            <TableHead className="text-xs">Respuesta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {turns.map((t) => (
            <TableRow
              key={t._id ?? t.createdAt}
              className={selectedTurnId === t._id ? "bg-muted" : ""}
            >
              <TableCell className="text-[10px]">
                {formatRelative(t.createdAt)}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    t.status === "failed"
                      ? "destructive"
                      : t.status === "done"
                      ? "success"
                      : "secondary"
                  }
                  className="text-[10px]"
                >
                  {t.status}
                </Badge>
              </TableCell>
              <TableCell className="max-w-[120px] truncate text-[10px]">
                {t.router?.agentId ?? "—"}
              </TableCell>
              <TableCell className="max-w-[180px] truncate text-[10px]">
                {t.response?.text ?? t.response?.blockedReason ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
