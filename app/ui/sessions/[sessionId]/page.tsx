"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FlowEditor } from "@/components/flow-editor";
import { AgentPromptEditor } from "@/components/agent-prompt-editor";
import { DiffViewer } from "@/components/diff-viewer";

type FlowData = {
  text: string;
  version: number;
  updatedAt: number;
  updatedBy: string;
  lastValidAt?: number;
  lastError?: { message: string; at: number };
  existsInDB: boolean;
};

type RuntimeConfigData = {
  configMode: "auto" | "force_draft" | "force_published";
};

type ContextFieldData = {
  key: string;
  type: string;
  description: string;
  enumValues?: string[];
};

type ContextSchemaData = {
  sessionId: string;
  domainDescription: string;
  fields: ContextFieldData[];
  derivedFrom: string;
  version: number;
  updatedAt: number;
};

type ContextSchemaState = {
  schema: ContextSchemaData | null;
  source: "override" | "derived" | null;
  enabled: boolean;
};

type DeleteCounts = {
  jobs: number;
  locks: number;
  messages: number;
  turns: number;
  agent_runs: number;
  memory: number;
  conversation_state: number;
  responsesEnabled: number;
};

const AGENT_IDS = [
  "default_assistant",
  "cami_default",
  "cami_recommender",
] as const;

export default function SessionConfigPage() {
  const params = useParams();
  const sessionId =
    typeof params.sessionId === "string" ? params.sessionId : "";
  const [flowDraft, setFlowDraft] = useState<FlowData | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfigData | null>(
    null
  );
  const [contextSchema, setContextSchema] = useState<ContextSchemaState | null>(
    null
  );
  const [showDiff, setShowDiff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hardResetConfirm, setHardResetConfirm] = useState("");
  const [dryRunResult, setDryRunResult] = useState<DeleteCounts | null>(null);
  const [executeResult, setExecuteResult] = useState<{
    deleted: DeleteCounts;
    resetRunId: string;
    completedAt: number;
  } | null>(null);
  const [hardResetError, setHardResetError] = useState<string | null>(null);
  const [hardResetLoading, setHardResetLoading] = useState<
    "idle" | "dry_run" | "execute"
  >("idle");

  const fetchFlowDraft = useCallback(async () => {
    if (!sessionId) return;
    const res = await fetch(
      `/api/ui/sessions/${encodeURIComponent(sessionId)}/flow?status=draft`,
      { credentials: "include" }
    );
    const json = await res.json();
    if (json.ok && json.data) setFlowDraft(json.data);
  }, [sessionId]);

  const fetchRuntimeConfig = useCallback(async () => {
    if (!sessionId) return;
    const res = await fetch(
      `/api/ui/sessions/${encodeURIComponent(sessionId)}/runtime-config`,
      { credentials: "include" }
    );
    const json = await res.json();
    if (json.ok && json.data) setRuntimeConfig(json.data);
  }, [sessionId]);

  const fetchContextSchema = useCallback(async () => {
    if (!sessionId) return;
    const res = await fetch(
      `/api/ui/sessions/${encodeURIComponent(sessionId)}/context-schema`,
      { credentials: "include" }
    );
    const json = await res.json();
    if (json.ok) {
      setContextSchema({
        schema: json.schema ?? null,
        source: json.source ?? null,
        enabled: json.enabled ?? true,
      });
    }
  }, [sessionId]);

  const refresh = useCallback(async () => {
    await Promise.all([
      fetchFlowDraft(),
      fetchRuntimeConfig(),
      fetchContextSchema(),
    ]);
  }, [fetchFlowDraft, fetchRuntimeConfig, fetchContextSchema]);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, refresh]);

  const setConfigMode = useCallback(
    async (configMode: RuntimeConfigData["configMode"]) => {
      if (!sessionId) return;
      await fetch(
        `/api/ui/sessions/${encodeURIComponent(sessionId)}/runtime-config`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ configMode }),
          credentials: "include",
        }
      );
      await fetchRuntimeConfig();
    },
    [sessionId, fetchRuntimeConfig]
  );

  const revertContextSchemaToAuto = useCallback(async () => {
    if (!sessionId) return;
    await fetch(
      `/api/ui/sessions/${encodeURIComponent(sessionId)}/context-schema`,
      { method: "DELETE", credentials: "include" }
    );
    await fetchContextSchema();
  }, [sessionId, fetchContextSchema]);

  const saveContextSchemaAsOverride = useCallback(async () => {
    if (!sessionId || !contextSchema?.schema) return;
    await fetch(
      `/api/ui/sessions/${encodeURIComponent(sessionId)}/context-schema`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: contextSchema.schema,
          enabled: true,
        }),
        credentials: "include",
      }
    );
    await fetchContextSchema();
  }, [sessionId, contextSchema?.schema, fetchContextSchema]);

  const runHardResetDryRun = useCallback(async () => {
    if (!sessionId) return;
    setHardResetError(null);
    setDryRunResult(null);
    setHardResetLoading("dry_run");
    try {
      const res = await fetch(
        `/api/ui/sessions/${encodeURIComponent(sessionId)}/hard-reset`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmSessionId: sessionId,
            mode: "dry_run",
          }),
          credentials: "include",
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setHardResetError(json.error ?? "Error");
        return;
      }
      if (json.wouldDelete) setDryRunResult(json.wouldDelete);
    } finally {
      setHardResetLoading("idle");
    }
  }, [sessionId]);

  const runHardResetExecute = useCallback(async () => {
    if (!sessionId || hardResetConfirm !== sessionId) return;
    setHardResetError(null);
    setExecuteResult(null);
    setHardResetLoading("execute");
    try {
      const res = await fetch(
        `/api/ui/sessions/${encodeURIComponent(sessionId)}/hard-reset`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmSessionId: sessionId,
            mode: "execute",
          }),
          credentials: "include",
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setHardResetError(json.error ?? "Error");
        return;
      }
      if (json.deleted && json.resetRunId != null) {
        setExecuteResult({
          deleted: json.deleted,
          resetRunId: json.resetRunId,
          completedAt: json.completedAt ?? Date.now(),
        });
        setDryRunResult(null);
        setHardResetConfirm("");
      }
    } finally {
      setHardResetLoading("idle");
    }
  }, [sessionId, hardResetConfirm]);

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-background p-6">
        <p>Missing session</p>
        <Button variant="link" asChild>
          <Link href="/">Inicio</Link>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">← Inicio</Link>
        </Button>
        <h1 className="text-lg font-semibold">Session config: {sessionId}</h1>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Flow (JSON)</CardTitle>
            <CardDescription>
              Edit flow JSON. Save as draft to test in simulator; publish for
              production.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {flowDraft ? (
              <FlowEditor
                sessionId={sessionId}
                initialDraft={flowDraft}
                onRefresh={fetchFlowDraft}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Could not load flow.
              </p>
            )}
          </CardContent>
        </Card>

        {flowDraft && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Draft vs Published</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDiff((s) => !s)}
              >
                {showDiff ? "Hide diff" : "Show diff"}
              </Button>
            </CardHeader>
            {showDiff && (
              <CardContent>
                <DiffViewer sessionId={sessionId} />
              </CardContent>
            )}
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Context Schema</CardTitle>
            <CardDescription>
              Define what information is extracted from conversations.
              Auto-derived from FSM or override manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {contextSchema?.schema ? (
              <>
                <div>
                  <Label className="text-muted-foreground">Source</Label>
                  <p className="text-sm mt-1">
                    {contextSchema.source === "override"
                      ? "Manual override"
                      : "Auto (from FSM)"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">
                    Domain description
                  </Label>
                  <p className="text-sm mt-1 whitespace-pre-wrap">
                    {contextSchema.schema.domainDescription}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Fields</Label>
                  <ul className="text-sm mt-1 list-disc list-inside space-y-1">
                    {contextSchema.schema.fields.map((f) => (
                      <li key={f.key}>
                        <span className="font-mono">{f.key}</span> ({f.type}
                        ): {f.description}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex gap-2">
                  {contextSchema.source === "override" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={revertContextSchemaToAuto}
                    >
                      Revert to auto (from FSM)
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={saveContextSchemaAsOverride}
                    >
                      Save as override
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                No context schema. Use an FSM flow to auto-derive, or save as
                override.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agent prompts</CardTitle>
            <CardDescription>
              Edit system prompt and model settings per agent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {AGENT_IDS.map((agentId) => (
                <AgentPromptEditor
                  key={agentId}
                  sessionId={sessionId}
                  agentId={agentId}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Runtime config and test links.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Runtime config</p>
              <div className="flex gap-2 flex-wrap">
                {(
                  [
                    "auto",
                    "force_draft",
                    "force_published",
                  ] as RuntimeConfigData["configMode"][]
                ).map((mode) => (
                  <Button
                    key={mode}
                    variant={
                      runtimeConfig?.configMode === mode ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setConfigMode(mode)}
                  >
                    {mode}
                  </Button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs mt-1">
                auto: simulator uses draft, WhatsApp uses published.
              </p>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Test links</p>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/sim/${encodeURIComponent(sessionId)}?config=draft`}
                  >
                    Simulator (draft)
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/sim/${encodeURIComponent(
                      sessionId
                    )}?config=published`}
                  >
                    Simulator (published)
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/conversations?sessionId=${encodeURIComponent(
                      sessionId
                    )}`}
                  >
                    Conversations
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/ui/sessions/${encodeURIComponent(
                      sessionId
                    )}/monitor`}
                  >
                    Monitor
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Hard reset borra mensajes, memoria, estado y turns de esta sesión.
              No borra flows, prompts ni KB.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label
                htmlFor="hard-reset-confirm"
                className="text-muted-foreground"
              >
                Escribí el sessionId para confirmar:{" "}
                <span className="font-mono font-medium">{sessionId}</span>
              </Label>
              <Input
                id="hard-reset-confirm"
                type="text"
                value={hardResetConfirm}
                onChange={(e) => setHardResetConfirm(e.target.value)}
                placeholder={sessionId}
                className="mt-2 max-w-xs font-mono"
              />
            </div>
            {hardResetError && (
              <p className="text-sm text-destructive">{hardResetError}</p>
            )}
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={runHardResetDryRun}
                disabled={hardResetLoading !== "idle"}
              >
                {hardResetLoading === "dry_run" ? "Cargando…" : "Vista previa"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={runHardResetExecute}
                disabled={
                  hardResetLoading !== "idle" || hardResetConfirm !== sessionId
                }
              >
                {hardResetLoading === "execute" ? "Ejecutando…" : "Hard reset"}
              </Button>
            </div>
            {dryRunResult && (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium mb-2">Vista previa (se borraría):</p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  <li>messages: {dryRunResult.messages}</li>
                  <li>turns: {dryRunResult.turns}</li>
                  <li>agent_runs: {dryRunResult.agent_runs}</li>
                  <li>memory: {dryRunResult.memory}</li>
                  <li>conversation_state: {dryRunResult.conversation_state}</li>
                  <li>jobs: {dryRunResult.jobs}</li>
                  <li>locks: {dryRunResult.locks}</li>
                  <li>responsesEnabled: {dryRunResult.responsesEnabled}</li>
                </ul>
              </div>
            )}
            {executeResult && (
              <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm">
                <p className="font-medium mb-2">Reset completado</p>
                <p className="text-muted-foreground text-xs mb-2">
                  resetRunId: {executeResult.resetRunId} ·{" "}
                  {new Date(executeResult.completedAt).toLocaleString()}
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  <li>messages: {executeResult.deleted.messages}</li>
                  <li>turns: {executeResult.deleted.turns}</li>
                  <li>agent_runs: {executeResult.deleted.agent_runs}</li>
                  <li>memory: {executeResult.deleted.memory}</li>
                  <li>
                    conversation_state:{" "}
                    {executeResult.deleted.conversation_state}
                  </li>
                  <li>jobs: {executeResult.deleted.jobs}</li>
                  <li>locks: {executeResult.deleted.locks}</li>
                  <li>
                    responsesEnabled: {executeResult.deleted.responsesEnabled}
                  </li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
