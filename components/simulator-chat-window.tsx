"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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

type Props = {
  sessionId: string;
  conversationId: string | null;
  onResetDone?: () => void;
  configOverride?: "draft" | "published";
};

export function SimulatorChatWindow({
  sessionId,
  conversationId,
  onResetDone,
  configOverride,
}: Props) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "success" | "error">(
    "idle"
  );
  const [resetLoading, setResetLoading] = useState(false);

  const form = useForm<SendFormValues>({
    resolver: zodResolver(sendSchema),
    defaultValues: { text: "" },
  });

  const loadMessages = useCallback(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    fetch(
      `/api/sim/conversations/${encodeURIComponent(conversationId)}/messages`
    )
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar");
        return res.json();
      })
      .then((data: { messages: MessageRow[] }) =>
        setMessages(data.messages ?? [])
      )
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [conversationId]);

  useEffect(() => {
    loadMessages();
    if (!conversationId) return;
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [conversationId, loadMessages]);

  async function onSubmit(values: SendFormValues) {
    if (!conversationId) return;
    setSendStatus("idle");
    const res = await fetch(
      `/api/sim/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: values.text,
          ...(configOverride && { config: configOverride }),
        }),
      }
    );
    if (res.ok) {
      setSendStatus("success");
      form.reset({ text: "" });
      loadMessages();
    } else {
      setSendStatus("error");
    }
  }

  async function handleClearCooldown() {
    if (!conversationId) return;
    await fetch(
      `/api/conversations/${encodeURIComponent(
        conversationId
      )}/responses-enabled`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, disabledUntilUTC: null }),
      }
    );
    onResetDone?.();
  }

  async function handleResetConversation() {
    if (!conversationId) return;
    setResetLoading(true);
    try {
      const res = await fetch(
        `/api/sim/conversations/${encodeURIComponent(conversationId)}/reset`,
        { method: "POST" }
      );
      if (res.ok) {
        loadMessages();
        onResetDone?.();
      }
    } finally {
      setResetLoading(false);
    }
  }

  function handleExportJson() {
    const blob = new Blob(
      [JSON.stringify({ conversationId, messages }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sim-${conversationId?.replace(/:/g, "-") ?? "export"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Selecciona o crea una conversación.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <Card className="flex-1 flex flex-col min-h-0 m-4">
        <CardHeader className="shrink-0">
          <CardTitle className="text-base font-mono truncate">
            {conversationId}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-auto space-y-3 mb-4">
            {loading && messages.length === 0 ? (
              <p className="text-muted-foreground text-sm">Cargando…</p>
            ) : messages.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin mensajes.</p>
            ) : (
              messages.map((m, i) => (
                <div
                  key={`${m.messageTime}-${i}`}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    m.source === "bot"
                      ? "ml-8 border-primary/20 bg-muted/50"
                      : "mr-8 border-border"
                  }`}
                >
                  <span className="text-muted-foreground text-xs">
                    {new Date(m.messageTime * 1000).toLocaleString()} ·{" "}
                    {m.source}
                  </span>
                  <p className="mt-1">{m.messageText}</p>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearCooldown}
            >
              Clear cooldown
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetConversation}
              disabled={resetLoading}
            >
              {resetLoading ? "Reseteando…" : "Reset conversation"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportJson}
            >
              Export JSON
            </Button>
          </div>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex gap-2 mt-3"
            >
              <FormField
                control={form.control}
                name="text"
                render={({ field }) => (
                  <FormItem className="flex-1 min-w-0">
                    <FormControl>
                      <Input
                        placeholder="Escribe un mensaje… (Enter para enviar)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="shrink-0"
              >
                {form.formState.isSubmitting ? "…" : "Enviar"}
              </Button>
            </form>
          </Form>
          {sendStatus === "success" && (
            <p className="text-muted-foreground mt-2 text-sm">Enviado.</p>
          )}
          {sendStatus === "error" && (
            <p className="text-destructive mt-2 text-sm">Error al enviar.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
