"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { MonitorConversationDetail } from "@/lib/types/monitor";

type AgentRun = MonitorConversationDetail["agentRuns"][number];

type Props = {
  agentRuns: MonitorConversationDetail["agentRuns"];
};

function formatRelative(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "ahora";
  if (diff < 3600_000) return `hace ${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `hace ${Math.floor(diff / 3600_000)}h`;
  return new Date(ts).toLocaleString();
}

function RunCard({ run }: { run: AgentRun }) {
  const input = run.input as
    | {
        systemPromptVersion?: string;
        messages?: Array<{ role: string; content: string }>;
        context?: { memory?: { facts?: unknown[]; recap?: { text?: string } } };
      }
    | undefined;
  const output = run.output as
    | {
        assistantText?: string;
        toolCalls?: Array<{ name: string; args: unknown; result: unknown }>;
        kbUsage?: { mdChunks?: unknown[]; tableRows?: unknown[] };
        aiClassification?: {
          selectedRoute: string;
          confidence: number;
          reasoning: string;
        };
      }
    | undefined;
  const latencia =
    run.endedAt != null && run.startedAt != null
      ? `${((run.endedAt - run.startedAt) / 1000).toFixed(2)}s`
      : "—";

  return (
    <Card className="text-xs">
      <CardHeader className="py-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-sm">{run.agentId}</CardTitle>
          <Badge
            variant={
              run.status === "error"
                ? "destructive"
                : run.status === "success"
                ? "success"
                : "secondary"
            }
          >
            {run.status}
          </Badge>
          <span className="text-muted-foreground text-[10px]">
            {formatRelative(run.startedAt)} · {latencia}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 py-0">
        {input && (
          <Collapsible>
            <CollapsibleTrigger className="rounded border px-2 py-1 text-[10px] hover:bg-muted">
              Input
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="mt-1 text-[10px]">
                systemPromptVersion: {input.systemPromptVersion ?? "—"}
              </p>
              {input.messages?.length != null && (
                <p className="text-[10px]">messages: {input.messages.length}</p>
              )}
              {input.context?.memory && (
                <p className="text-[10px]">
                  facts:{" "}
                  {(input.context.memory as { facts?: unknown[] }).facts
                    ?.length ?? 0}
                  , recap:{" "}
                  {(input.context.memory as { recap?: { text?: string } }).recap
                    ?.text?.length ?? 0}{" "}
                  chars
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
        {output && (
          <Collapsible>
            <CollapsibleTrigger className="rounded border px-2 py-1 text-[10px] hover:bg-muted">
              Output
            </CollapsibleTrigger>
            <CollapsibleContent>
              {output.assistantText != null && (
                <p className="mt-1 max-h-24 overflow-auto truncate text-[10px]">
                  {output.assistantText.slice(0, 300)}
                  {output.assistantText.length > 300 ? "…" : ""}
                </p>
              )}
              {output.toolCalls?.length != null &&
                output.toolCalls.length > 0 && (
                  <p className="text-[10px]">
                    toolCalls:{" "}
                    {output.toolCalls.map((tc) => tc.name).join(", ")}
                  </p>
                )}
              {output.kbUsage && (
                <p className="text-[10px]">
                  kb: mdChunks={output.kbUsage.mdChunks?.length ?? 0},
                  tableRows=
                  {output.kbUsage.tableRows?.length ?? 0}
                </p>
              )}
              {output.aiClassification && (
                <p className="text-[10px]">
                  route={output.aiClassification.selectedRoute} conf=
                  {output.aiClassification.confidence}
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
        {run.error && (
          <Collapsible>
            <CollapsibleTrigger className="rounded border border-destructive px-2 py-1 text-[10px] hover:bg-destructive/10">
              Error
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-destructive/10 p-2 font-mono text-[10px]">
                {run.error.message}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

export function RunsTab({ agentRuns }: Props) {
  if (agentRuns.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Sin agent runs para esta conversación.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {agentRuns.map((run) => (
        <RunCard key={run._id ?? run.startedAt} run={run} />
      ))}
    </div>
  );
}
