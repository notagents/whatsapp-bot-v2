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

type MessageRow = {
  messageText: string;
  messageTime: number;
  source: "user" | "bot";
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
  const [sendStatus, setSendStatus] = useState<"idle" | "success" | "error">("idle");

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
    fetch(`/api/conversations/${encodeURIComponent(whatsappId)}/responses-enabled`)
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
    await fetch(`/api/conversations/${encodeURIComponent(whatsappId)}/responses-enabled`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
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
      const list = await fetch(`/api/conversations/${encodeURIComponent(whatsappId)}/messages`).then((r) => r.json());
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
              <Switch
                checked={responsesEnabled}
                onCheckedChange={onToggle}
              />
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
                  key={`${m.messageTime}-${i}`}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    m.source === "bot"
                      ? "ml-8 border-primary/20 bg-muted/50"
                      : "mr-8 border-border"
                  }`}
                >
                  <span className="text-muted-foreground text-xs">
                    {new Date(m.messageTime * 1000).toLocaleString()} · {m.source}
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
            <p className="text-muted-foreground mt-2 text-sm">Mensaje enviado.</p>
          )}
          {sendStatus === "error" && (
            <p className="text-destructive mt-2 text-sm">Error al enviar.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
