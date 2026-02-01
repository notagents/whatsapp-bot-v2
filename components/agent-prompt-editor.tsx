"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidationStatus } from "@/components/validation-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-5-mini", "gpt-5-nano"] as const;

type PromptData = {
  systemPromptTemplate: string;
  model: string;
  temperature: number;
  maxToolRounds: number;
  version: number;
  updatedAt: number;
  updatedBy: string;
  lastValidAt?: number;
  lastError?: { message: string; at: number };
  existsInDB: boolean;
};

type Props = {
  sessionId: string;
  agentId: string;
  className?: string;
};

export function AgentPromptEditor({ sessionId, agentId, className }: Props) {
  const [systemPromptTemplate, setSystemPromptTemplate] = useState("");
  const [model, setModel] = useState<string>(MODELS[0]);
  const [temperature, setTemperature] = useState(0.7);
  const [maxToolRounds, setMaxToolRounds] = useState(5);
  const [version, setVersion] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastValidAt, setLastValidAt] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loading, setLoading] = useState(true);

  const base = `/api/ui/sessions/${encodeURIComponent(
    sessionId
  )}/agents/${encodeURIComponent(agentId)}/prompt`;

  const fetchDraft = useCallback(async () => {
    const res = await fetch(`${base}?status=draft`, {
      credentials: "include",
    });
    const json = await res.json();
    if (json.ok && json.data) {
      const d = json.data as PromptData;
      setSystemPromptTemplate(d.systemPromptTemplate);
      setModel(d.model);
      setTemperature(d.temperature);
      setMaxToolRounds(d.maxToolRounds);
      setVersion(d.version);
      setLastError(d.lastError?.message ?? null);
      setLastValidAt(d.lastValidAt);
    }
    setLoading(false);
  }, [base]);

  useEffect(() => {
    fetchDraft();
  }, [fetchDraft]);

  const saveDraft = useCallback(async () => {
    setSaving(true);
    setLastError(null);
    try {
      const res = await fetch(`${base}?status=draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPromptTemplate,
          model,
          temperature,
          maxToolRounds,
          version,
        }),
        credentials: "include",
      });
      const json = await res.json();
      if (json.ok) {
        setVersion((v) => v + 1);
        setLastValidAt(Date.now());
        setLastError(null);
        await fetchDraft();
      } else {
        setLastError(json.error ?? "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }, [
    base,
    systemPromptTemplate,
    model,
    temperature,
    maxToolRounds,
    version,
    fetchDraft,
  ]);

  const publish = useCallback(async () => {
    setPublishing(true);
    setLastError(null);
    try {
      const res = await fetch(`${base}/publish`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (json.ok) {
        await fetchDraft();
      } else {
        setLastError(json.error ?? "Publish failed");
      }
    } finally {
      setPublishing(false);
    }
  }, [base, fetchDraft]);

  const valid = !lastError;

  if (loading) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle className="text-base">{agentId}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-base">{agentId}</CardTitle>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <ValidationStatus
            valid={valid}
            message={lastError ?? undefined}
            timestamp={lastValidAt}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={saveDraft}
              disabled={saving || publishing}
            >
              {saving ? "Saving…" : "Save Draft"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={publish}
              disabled={saving || publishing || !valid}
            >
              {publishing ? "Publishing…" : "Publish"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-sm font-medium block mb-1">
            System prompt template
          </label>
          <textarea
            value={systemPromptTemplate}
            onChange={(e) => setSystemPromptTemplate(e.target.value)}
            className="min-h-[160px] w-full rounded-md border bg-muted/30 font-mono text-sm"
            spellCheck={false}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">
              Temperature (0–1)
            </label>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">
              Max tool rounds
            </label>
            <Input
              type="number"
              min={1}
              max={20}
              value={maxToolRounds}
              onChange={(e) => setMaxToolRounds(Number(e.target.value))}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
