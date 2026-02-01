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
  const [showDiff, setShowDiff] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const refresh = useCallback(async () => {
    await Promise.all([fetchFlowDraft(), fetchRuntimeConfig()]);
  }, [fetchFlowDraft, fetchRuntimeConfig]);

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
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
