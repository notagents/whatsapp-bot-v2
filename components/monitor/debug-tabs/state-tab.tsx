"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { MonitorConversationDetail } from "@/lib/types/monitor";

type Props = {
  state: MonitorConversationDetail["state"];
};

export function StateTab({ state }: Props) {
  if (!state) {
    return (
      <p className="text-muted-foreground text-sm">
        Sin estado FSM para esta conversación.
      </p>
    );
  }

  const fsmState = state.state?.fsmState as string | undefined;
  const stateData = state.state;

  return (
    <div className="space-y-3 text-xs">
      <Card>
        <CardHeader className="py-2">
          <CardTitle className="text-sm">FSM State</CardTitle>
        </CardHeader>
        <CardContent className="py-0">
          <p className="font-mono font-medium">{fsmState ?? "—"}</p>
          <p className="mt-1 text-muted-foreground text-[10px]">
            Actualizado: {new Date(state.updatedAt).toISOString()}
          </p>
        </CardContent>
      </Card>
      <Collapsible>
        <CollapsibleTrigger className="rounded border px-2 py-1 text-xs hover:bg-muted">
          State completo (JSON)
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-[10px]">
            {JSON.stringify(stateData, null, 2)}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
