"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ConversationSummary = {
  whatsappId: string;
  lastMessageText: string | null;
  lastMessageTime: number | null;
  responsesEnabled: boolean;
};

type ApiResponse = {
  sessions: string[];
  conversations: ConversationSummary[];
};

const ALL_SESSIONS = "all";

export function ConversationsList() {
  const [sessions, setSessions] = useState<string[]>([]);
  const [list, setList] = useState<ConversationSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(ALL_SESSIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url =
      selectedSessionId === ALL_SESSIONS
        ? "/api/conversations"
        : `/api/conversations?sessionId=${encodeURIComponent(selectedSessionId)}`;
    setLoading(true);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar");
        return res.json() as Promise<ApiResponse>;
      })
      .then((data) => {
        setSessions(data.sessions);
        setList(data.conversations);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedSessionId]);

  if (loading && list.length === 0)
    return <p className="text-muted-foreground text-sm">Cargando…</p>;
  if (error) return <p className="text-destructive text-sm">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">Sesión</span>
        <Select
          value={selectedSessionId}
          onValueChange={(v) => setSelectedSessionId(v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sesión" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SESSIONS}>Todas</SelectItem>
            {sessions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">Cargando…</p>
      ) : list.length === 0 ? (
        <p className="text-muted-foreground text-sm">Sin conversaciones.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Conversación</TableHead>
              <TableHead>Último mensaje</TableHead>
              <TableHead>Respuestas</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((c) => (
              <TableRow key={c.whatsappId}>
                <TableCell className="font-mono text-sm">{c.whatsappId}</TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground">
                  {c.lastMessageText ?? "—"}
                </TableCell>
                <TableCell>{c.responsesEnabled ? "Sí" : "No"}</TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/conversations/${encodeURIComponent(c.whatsappId)}`}>
                      Ver
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
