"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MonitorConversationDetail } from "@/lib/types/monitor";

type Props = {
  memory: MonitorConversationDetail["memory"];
};

export function MemoryTab({ memory }: Props) {
  if (!memory) {
    return (
      <p className="text-muted-foreground text-sm">
        Sin memoria para esta conversación.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      <Card>
        <CardHeader className="py-2">
          <CardTitle className="text-sm">Facts</CardTitle>
        </CardHeader>
        <CardContent className="py-0">
          {memory.facts.length === 0 ? (
            <p className="text-muted-foreground">Ninguno</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Key</TableHead>
                  <TableHead className="text-xs">Value</TableHead>
                  <TableHead className="text-xs">Conf</TableHead>
                  <TableHead className="text-xs">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memory.facts.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{f.key}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">
                      {f.value}
                    </TableCell>
                    <TableCell className="text-xs">{f.confidence}</TableCell>
                    <TableCell className="text-[10px]">
                      {new Date(f.updatedAt).toISOString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="py-2">
          <CardTitle className="text-sm">Recap</CardTitle>
        </CardHeader>
        <CardContent className="py-0">
          <p className="whitespace-pre-wrap text-xs">
            {memory.recap?.text || "—"}
          </p>
          {memory.recap?.updatedAt != null && (
            <p className="mt-1 text-muted-foreground text-[10px]">
              {new Date(memory.recap.updatedAt).toISOString()}
            </p>
          )}
        </CardContent>
      </Card>
      {memory.structuredContext &&
        Object.keys(memory.structuredContext).length > 0 && (
          <Collapsible>
            <CollapsibleTrigger className="rounded border px-2 py-1 text-xs hover:bg-muted">
              Structured context (JSON)
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-[10px]">
                {JSON.stringify(memory.structuredContext, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}
    </div>
  );
}
