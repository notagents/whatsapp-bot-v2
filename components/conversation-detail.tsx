"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type MessageRow = {
  _id?: string;
  messageText: string;
  messageTime: number;
  source: "user" | "bot";
  meta?: {
    turnId?: string;
    partIndex?: number;
  };
};

type ResponsePlanPart = {
  index: number;
  text: string;
  scheduledFor: number;
  sentAt?: number;
  messageId?: string;
};

type ResponsePlan = {
  mode: string;
  parts: ResponsePlanPart[];
  splitter: { type: string; version: string };
  status: string;
  createdAt: number;
  updatedAt: number;
};

const sendSchema = z.object({
  text: z.string().min(1, "Requerido"),
});

type SendFormValues = z.infer<typeof sendSchema>;

type Props = { whatsappId: string };

export function ConversationDetail({ whatsappId }: Props) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [responsesEnabled, setResponsesEnabled] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [loadingState, setLoadingState] = useState(true);
  const [sendStatus, setSendStatus] = useState<"idle" | "success" | "error">(
    "idle"
  );
  const [selectedTurnPlan, setSelectedTurnPlan] = useState<ResponsePlan | null>(
    null
  );

  const form = useForm<SendFormValues>({
    resolver: zodResolver(sendSchema),
    defaultValues: { text: "" },
  });

  useEffect(() => {
    const url = `/api/conversations/${encodeURIComponent(whatsappId)}/messages`;
    const load = () => {
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error("Error al cargar mensajes");
          return res.json();
        })
        .then(setMessages)
        .catch(() => setMessages([]))
        .finally(() => setLoadingMessages(false));
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [whatsappId]);

  useEffect(() => {
    fetch(
      `/api/conversations/${encodeURIComponent(whatsappId)}/responses-enabled`
    )
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar estado");
        return res.json();
      })
      .then((data: { enabled: boolean }) => setResponsesEnabled(data.enabled))
      .catch(() => {})
      .finally(() => setLoadingState(false));
  }, [whatsappId]);

  async function onToggle(enabled: boolean) {
    setResponsesEnabled(enabled);
    await fetch(
      `/api/conversations/${encodeURIComponent(whatsappId)}/responses-enabled`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      }
    );
  }

  async function loadTurnPlan(turnId: string) {
    const res = await fetch(`/api/turns/${turnId}`);
    if (res.ok) {
      const data = await res.json();
      const turn = data.turn ?? data;
      setSelectedTurnPlan(turn.responsePlan ?? null);
    }
  }

  async function onSubmit(values: SendFormValues) {
    setSendStatus("idle");
    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "default",
        jid: whatsappId,
        text: values.text,
      }),
    });
    if (res.ok) {
      setSendStatus("success");
      form.reset({ text: "" });
      const list = await fetch(
        `/api/conversations/${encodeURIComponent(whatsappId)}/messages`
      ).then((r) => r.json());
      setMessages(list);
    } else {
      setSendStatus("error");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Respuestas habilitadas</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingState ? (
            <p className="text-muted-foreground text-sm">Cargando…</p>
          ) : (
            <div className="flex items-center gap-2">
              <Switch checked={responsesEnabled} onCheckedChange={onToggle} />
              <Label>{responsesEnabled ? "Sí" : "No"}</Label>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensajes</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMessages ? (
            <p className="text-muted-foreground text-sm">Cargando…</p>
          ) : messages.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin mensajes.</p>
          ) : (
            <ul className="space-y-3">
              {messages.map((m, i) => (
                <li
                  key={m._id ?? `${m.messageTime}-${i}`}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    m.source === "bot"
                      ? "ml-8 border-primary/20 bg-muted/50"
                      : "mr-8 border-border"
                  } ${
                    m.meta?.turnId ? "cursor-pointer hover:bg-muted/30" : ""
                  }`}
                  onClick={() => {
                    if (m.meta?.turnId) loadTurnPlan(m.meta.turnId!);
                  }}
                  onKeyDown={(e) => {
                    if (
                      m.meta?.turnId &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      loadTurnPlan(m.meta.turnId!);
                    }
                  }}
                  role={m.meta?.turnId ? "button" : undefined}
                  tabIndex={m.meta?.turnId ? 0 : undefined}
                >
                  <span className="text-muted-foreground text-xs">
                    {new Date(m.messageTime * 1000).toLocaleString()} ·{" "}
                    {m.source}
                    {m.meta?.partIndex !== undefined && (
                      <span className="ml-2 text-primary">
                        [Parte {m.meta.partIndex + 1}]
                      </span>
                    )}
                  </span>
                  <p className="mt-1">{m.messageText}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enviar mensaje</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-2">
              <FormField
                control={form.control}
                name="text"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel className="sr-only">Mensaje</FormLabel>
                    <FormControl>
                      <Input placeholder="Escribe un mensaje…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="pt-8">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Enviando…" : "Enviar"}
                </Button>
              </div>
            </form>
          </Form>
          {sendStatus === "success" && (
            <p className="text-muted-foreground mt-2 text-sm">
              Mensaje enviado.
            </p>
          )}
          {sendStatus === "error" && (
            <p className="text-destructive mt-2 text-sm">Error al enviar.</p>
          )}
        </CardContent>
      </Card>

      {selectedTurnPlan && (
        <Dialog
          open={!!selectedTurnPlan}
          onOpenChange={(open) => !open && setSelectedTurnPlan(null)}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Plan de envío multi-mensaje</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="font-medium">Modo:</span>{" "}
                  {selectedTurnPlan.mode}
                </div>
                <div>
                  <span className="font-medium">Estado:</span>{" "}
                  {selectedTurnPlan.status}
                </div>
                <div>
                  <span className="font-medium">Splitter:</span>{" "}
                  {selectedTurnPlan.splitter.type}
                </div>
                <div>
                  <span className="font-medium">Partes:</span>{" "}
                  {selectedTurnPlan.parts.length}
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Partes</h4>
                {selectedTurnPlan.parts.map((part) => (
                  <div key={part.index} className="border rounded p-2 text-sm">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Parte {part.index + 1}</span>
                      <span>
                        {part.sentAt
                          ? `Enviado: ${new Date(
                              part.sentAt
                            ).toLocaleTimeString()}`
                          : `Programado: ${new Date(
                              part.scheduledFor
                            ).toLocaleTimeString()}`}
                      </span>
                    </div>
                    <p className="text-xs bg-muted p-2 rounded whitespace-pre-wrap">
                      {part.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
