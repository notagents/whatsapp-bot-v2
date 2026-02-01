"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

type Props = {
  sessionId: string;
  className?: string;
};

type DiffData = {
  draft: string;
  published: string;
  diff: string;
};

function DiffLines({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="overflow-x-auto rounded border bg-muted/30 p-3 text-xs font-mono">
      {lines.map((line, i) => {
        const type = line.startsWith("+")
          ? "add"
          : line.startsWith("-")
          ? "remove"
          : "context";
        return (
          <div
            key={i}
            className={cn(
              type === "add" &&
                "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200",
              type === "remove" &&
                "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200"
            )}
          >
            {line}
          </div>
        );
      })}
    </pre>
  );
}

export function DiffViewer({ sessionId, className }: Props) {
  const [data, setData] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDiff = useCallback(async () => {
    const res = await fetch(
      `/api/ui/sessions/${encodeURIComponent(sessionId)}/flow/diff`,
      { credentials: "include" }
    );
    const json = await res.json();
    if (json.ok && json.data) setData(json.data);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    fetchDiff();
  }, [fetchDiff]);

  if (loading) {
    return (
      <div className={cn("text-muted-foreground text-sm", className)}>
        Loading diff…
      </div>
    );
  }
  if (!data) {
    return (
      <div className={cn("text-muted-foreground text-sm", className)}>
        Could not load diff.
      </div>
    );
  }
  return (
    <div className={cn("space-y-2", className)}>
      <DiffLines diff={data.diff} />
    </div>
  );
}
