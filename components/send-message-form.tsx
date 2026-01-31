"use client";

import { useState } from "react";
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

const schema = z.object({
  sessionId: z.string().min(1, "Requerido"),
  jid: z.string().min(1, "Requerido"),
  text: z.string().min(1, "Requerido"),
});

type FormValues = z.infer<typeof schema>;

export function SendMessageForm() {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { sessionId: "default", jid: "", text: "" },
  });

  async function onSubmit(values: FormValues) {
    setStatus("idle");
    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (res.ok) {
      setStatus("success");
      form.reset({ sessionId: "default", jid: "", text: "" });
    } else {
      setStatus("error");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-[auto_1fr_1fr_auto]">
        <FormField
          control={form.control}
          name="sessionId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Session</FormLabel>
              <FormControl>
                <Input placeholder="default" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="jid"
          render={({ field }) => (
            <FormItem>
              <FormLabel>JID</FormLabel>
              <FormControl>
                <Input placeholder="54911xxx@s.whatsapp.net" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="text"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mensaje</FormLabel>
              <FormControl>
                <Input placeholder="Texto" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-end pb-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </form>
      {status === "success" && (
        <p className="text-muted-foreground text-sm">Mensaje enviado.</p>
      )}
      {status === "error" && (
        <p className="text-destructive text-sm">Error al enviar.</p>
      )}
    </Form>
  );
}
