"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ValidationStatus } from "@/components/validation-status";
import { cn } from "@/lib/utils";

type FlowData = {
  text: string;
  version: number;
  updatedAt: number;
  updatedBy: string;
  lastValidAt?: number;
  lastError?: { message: string; at: number };
  existsInDB: boolean;
};

type Props = {
  sessionId: string;
  initialDraft: FlowData;
  onRefresh: () => Promise<void>;
  className?: string;
};

export function FlowEditor({
  sessionId,
  initialDraft,
  onRefresh,
  className,
}: Props) {
  const [text, setText] = useState(initialDraft.text);
  const [version, setVersion] = useState(initialDraft.version);
  const [lastError, setLastError] = useState<string | null>(
    initialDraft.lastError?.message ?? null
  );
  const [lastValidAt, setLastValidAt] = useState<number | undefined>(
    initialDraft.lastValidAt
  );
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [validateOnlyError, setValidateOnlyError] = useState<string | null>(
    null
  );

  const base = `/api/ui/sessions/${encodeURIComponent(sessionId)}/flow`;

  const validateOnly = useCallback(async () => {
    setValidateOnlyError(null);
    const res = await fetch(`${base}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      credentials: "include",
    });
    const json = await res.json();
    if (json.ok) {
      setValidateOnlyError(null);
      setLastError(null);
      setLastValidAt(Date.now());
    } else {
      setValidateOnlyError(json.error ?? "Validation failed");
    }
  }, [base, text]);

  const saveDraft = useCallback(async () => {
    setSaving(true);
    setLastError(null);
    setValidateOnlyError(null);
    try {
      const res = await fetch(`${base}?status=draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, version }),
        credentials: "include",
      });
      const json = await res.json();
      if (json.ok) {
        setVersion((v) => v + 1);
        setLastValidAt(Date.now());
        setLastError(null);
        await onRefresh();
      } else {
        setLastError(json.error ?? "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }, [base, text, version, onRefresh]);

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
        await onRefresh();
      } else {
        setLastError(json.error ?? "Publish failed");
      }
    } finally {
      setPublishing(false);
    }
  }, [base, onRefresh]);

  const valid = !lastError && !validateOnlyError;
  const displayError = lastError ?? validateOnlyError;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <ValidationStatus
          valid={valid}
          message={displayError ?? undefined}
          timestamp={lastValidAt}
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={validateOnly}
            disabled={saving || publishing}
          >
            Validate
          </Button>
          <Button size="sm" onClick={saveDraft} disabled={saving || publishing}>
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
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[320px] w-full rounded-md border bg-muted/30 font-mono text-sm"
        spellCheck={false}
      />
    </div>
  );
}
