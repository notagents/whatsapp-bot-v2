"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Turn = {
  _id: string;
  whatsappId: string;
  status: string;
  router?: { agentId: string; reason: string; confidence: number };
  meta?: { flow?: { state?: string; flowPath?: string } };
  response?: { blockedReason?: string; text?: string };
};

type TurnsResponse = { turns: Turn[] };
type ResponsesEnabledResponse = { enabled: boolean; disabledUntilUTC: string | null };

type Props = {
  conversationId: string | null;
  onResponsesUpdated?: () => void;
};

export function SimulatorDebugPanel({
  conversationId,
  onResponsesUpdated,
}: Props) {
  const [lastTurn, setLastTurn] = useState<Turn | null>(null);
  const [responsesEnabled, setResponsesEnabled] = useState(true);
  const [disabledUntilUTC, setDisabledUntilUTC] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conversationId) {
      setLastTurn(null);
      return;
    }
    const loadTurns = () => {
      fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/turns?limit=1`
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((data: TurnsResponse | null) => {
          const turns = data?.turns ?? [];
          setLastTurn(turns[0] ?? null);
        })
        .catch(() => setLastTurn(null));
    };
    loadTurns();
    const interval = setInterval(loadTurns, 5000);
    return () => clearInterval(interval);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    fetch(
      `/api/conversations/${encodeURIComponent(conversationId)}/responses-enabled`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ResponsesEnabledResponse | null) => {
        if (data) {
          setResponsesEnabled(data.enabled);
          setDisabledUntilUTC(data.disabledUntilUTC ?? null);
        }
      })
      .catch(() => {});
  }, [conversationId, onResponsesUpdated]);

  async function handleEnableResponses() {
    if (!conversationId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/responses-enabled`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true, disabledUntilUTC: null }),
        }
      );
      if (res.ok) {
        setResponsesEnabled(true);
        setDisabledUntilUTC(null);
        onResponsesUpdated?.();
      }
    } finally {
      setLoading(false);
    }
  }

  const inCooldown =
    disabledUntilUTC && new Date(disabledUntilUTC) > new Date();

  if (!conversationId) {
    return (
      <aside className="w-72 shrink-0 border-l bg-muted/20 flex items-center justify-center text-muted-foreground text-sm">
        Debug
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 border-l bg-muted/20 overflow-auto">
      <div className="p-3 space-y-3">
        <Card>
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Último turn</CardTitle>
          </CardHeader>
          <CardContent className="py-2 text-sm space-y-1">
            {lastTurn ? (
              <>
                <p className="font-mono text-xs truncate">
                  {String(lastTurn._id)}
                </p>
                <Link
                  href={`/api/turns/${lastTurn._id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline text-xs"
                >
                  GET /api/turns/{String(lastTurn._id)}
                </Link>
                <p className="text-muted-foreground">Estado: {lastTurn.status}</p>
                {lastTurn.router && (
                  <p className="text-muted-foreground">
                    Agent: {lastTurn.router.agentId}
                  </p>
                )}
                {lastTurn.meta?.flow?.state && (
                  <p className="text-muted-foreground truncate">
                    Flow state: {lastTurn.meta.flow.state}
                  </p>
                )}
                {lastTurn.response?.blockedReason && (
                  <p className="text-destructive text-xs">
                    Bloqueado: {lastTurn.response.blockedReason}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Respuestas</CardTitle>
          </CardHeader>
          <CardContent className="py-2 text-sm space-y-2">
            <p className="text-muted-foreground">
              Habilitadas: {responsesEnabled ? "Sí" : "No"}
            </p>
            {inCooldown && (
              <p className="text-muted-foreground text-xs">
                Cooldown hasta: {disabledUntilUTC}
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleEnableResponses}
              disabled={loading || (responsesEnabled && !inCooldown)}
            >
              {loading ? "…" : "Enable / Clear cooldown"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </aside>
  );
}
