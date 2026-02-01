"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type SimConversationItem = {
  conversationId: string;
  lastMessage: {
    messageText: string;
    messageTime: number;
    source: string;
  };
};

type Props = {
  sessionId: string;
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: (conversationId: string) => void;
};

export function SimulatorConversationsSidebar({
  sessionId,
  selectedConversationId,
  onSelectConversation,
  onNewConversation,
}: Props) {
  const [conversations, setConversations] = useState<SimConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserId, setNewUserId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const url = `/api/sim/sessions/${encodeURIComponent(sessionId)}/conversations`;
    const load = () => {
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error("Error al cargar");
          return res.json();
        })
        .then((data: { conversations: SimConversationItem[] }) =>
          setConversations(data.conversations ?? [])
        )
        .catch(() => setConversations([]))
        .finally(() => setLoading(false));
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  async function handleCreate() {
    const testUserId = newUserId.trim() || `user_${Date.now()}`;
    const res = await fetch(
      `/api/sim/sessions/${encodeURIComponent(sessionId)}/conversations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testUserId }),
      }
    );
    if (!res.ok) return;
    const data = (await res.json()) as { conversationId: string };
    onNewConversation(data.conversationId);
    setNewUserId("");
    setDialogOpen(false);
  }

  return (
    <aside className="w-64 shrink-0 border-r bg-muted/30 flex flex-col">
      <div className="p-3 border-b">
        <Link href="/sim">
          <Button variant="ghost" size="sm" className="w-full justify-start">
            ← Sesiones
          </Button>
        </Link>
      </div>
      <div className="p-3 border-b">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              Nueva conversación
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva conversación</DialogTitle>
            </DialogHeader>
            <div className="flex gap-2 pt-2">
              <Input
                placeholder="user_1, lead_juan…"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <Button onClick={handleCreate}>Crear</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {loading ? (
          <p className="text-muted-foreground text-sm">Cargando…</p>
        ) : conversations.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin conversaciones.</p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => {
              const short =
                c.conversationId.split(":").pop() ?? c.conversationId;
              const isSelected =
                selectedConversationId === c.conversationId;
              return (
                <li key={c.conversationId}>
                  <button
                    type="button"
                    onClick={() => onSelectConversation(c.conversationId)}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm truncate ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    {short}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
