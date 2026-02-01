"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  DashboardOverview,
  DashboardSessionItem,
} from "@/lib/dashboard-overview";

function formatTs(ts: number | null): string {
  if (ts == null) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? "inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400"
          : "inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400"
      }
    >
      {label}
    </span>
  );
}

function SessionStatusBadge({
  status,
}: {
  status: DashboardSessionItem["status"];
}) {
  const styles: Record<string, string> = {
    connected:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    disconnected:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    unknown: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
        styles[status] ?? styles.unknown
      }`}
    >
      {status}
    </span>
  );
}

export function DashboardOverview() {
  const router = useRouter();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/overview", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          router.replace("/login?next=/");
          throw new Error("Unauthorized");
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((overview: DashboardOverview) => {
        if (!cancelled) setData(overview);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive">
        {error ?? "Failed to load dashboard"}
      </div>
    );
  }

  const { baileys, mongodb, sessions } = data;

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Baileys API</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-muted-foreground">{baileys.baseUrl || "—"}</p>
            <div className="flex items-center gap-2">
              <StatusBadge
                ok={baileys.ok}
                label={baileys.ok ? "OK" : "ERROR"}
              />
              {baileys.latencyMs != null && (
                <span className="text-muted-foreground">
                  {baileys.latencyMs} ms
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Checked at {formatTs(baileys.lastCheckedAt)}
            </p>
            {baileys.error && (
              <p className="text-destructive text-xs">{baileys.error}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">MongoDB</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              {mongodb.host} / {mongodb.dbName}
            </p>
            <div className="flex items-center gap-2">
              <StatusBadge
                ok={mongodb.ok}
                label={mongodb.ok ? "OK" : "ERROR"}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Checked at {formatTs(mongodb.lastCheckedAt)}
            </p>
            {mongodb.error && (
              <p className="text-destructive text-xs">{mongodb.error}</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">WhatsApp Sessions</CardTitle>
              {sessions.warning && (
                <span className="text-amber-600 text-xs dark:text-amber-400">
                  {sessions.warning}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {sessions.items.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No sessions found.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Conversations</TableHead>
                    <TableHead>Last activity</TableHead>
                    <TableHead>Linked</TableHead>
                    <TableHead className="w-[200px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.items.map((row) => (
                    <TableRow key={row.sessionId}>
                      <TableCell className="font-mono text-sm">
                        {row.sessionId}
                      </TableCell>
                      <TableCell>
                        <SessionStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {row.conversationsCount}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatTs(row.lastActivityAt)}
                      </TableCell>
                      <TableCell>
                        {row.linkedToMongoDB ? (
                          <span className="text-green-600 text-xs dark:text-green-400">
                            Yes
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            No
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              href={`/sim/${encodeURIComponent(row.sessionId)}`}
                            >
                              Open Simulator
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              href={`/ui/sessions/${encodeURIComponent(
                                row.sessionId
                              )}`}
                            >
                              Edit Flow
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
