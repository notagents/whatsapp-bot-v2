"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type KbMdDoc = {
  _id: string;
  sessionId: string;
  slug: string;
  title: string;
  markdown: string;
  status: string;
  updatedAt: number;
  version: number;
};

type Tab = "md" | "tables";

type TableInfo = { tableKey: string; rowCount: number };

type TableRow = {
  pk: string;
  data: Record<string, unknown>;
  updatedAt?: number;
};

export function KbManager({ sessionId }: { sessionId: string }) {
  const [tab, setTab] = useState<Tab>("md");
  const [docs, setDocs] = useState<KbMdDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<KbMdDoc | null>(null);
  const [editMarkdown, setEditMarkdown] = useState("");
  const [editVersion, setEditVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newMarkdown, setNewMarkdown] = useState("");
  const [creating, setCreating] = useState(false);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [tableRows, setTableRows] = useState<TableRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/kb/md?sessionId=${encodeURIComponent(sessionId)}`
      );
      const data = await res.json();
      if (res.ok) setDocs(data.docs ?? []);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const fetchTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const res = await fetch(
        `/api/kb/tables?sessionId=${encodeURIComponent(sessionId)}`
      );
      const data = await res.json();
      if (res.ok) setTables(data.tables ?? []);
    } finally {
      setTablesLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (tab === "tables") fetchTables();
  }, [tab, fetchTables]);

  const openTable = useCallback(
    async (tableKey: string) => {
      setSelectedTableKey(tableKey);
      setRowsLoading(true);
      try {
        const res = await fetch(
          `/api/kb/tables/${encodeURIComponent(sessionId)}/${encodeURIComponent(
            tableKey
          )}/rows?limit=50`
        );
        const data = await res.json();
        if (res.ok) setTableRows(data.rows ?? []);
        else setTableRows([]);
      } finally {
        setRowsLoading(false);
      }
    },
    [sessionId]
  );

  const openEditor = (doc: KbMdDoc) => {
    setSelectedDoc(doc);
    setEditMarkdown(doc.markdown);
    setEditVersion(doc.version);
  };

  const closeEditor = () => {
    setSelectedDoc(null);
    setEditMarkdown("");
    setEditVersion(0);
  };

  const handleSave = async () => {
    if (!selectedDoc) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/kb/md/${selectedDoc._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: editMarkdown, version: editVersion }),
      });
      if (res.ok) {
        setEditVersion(editVersion + 1);
        await fetchDocs();
      } else {
        const data = await res.json();
        if (res.status === 409)
          alert("Version conflict. Refresh and try again.");
        else alert(data?.error ?? "Save failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newSlug.trim() || !newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/kb/md", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          slug: newSlug.trim(),
          title: newTitle.trim(),
          markdown: newMarkdown.trim(),
        }),
      });
      if (res.ok) {
        setNewOpen(false);
        setNewSlug("");
        setNewTitle("");
        setNewMarkdown("");
        await fetchDocs();
      } else {
        const data = await res.json();
        alert(data?.error ?? "Create failed");
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b">
        <button
          type="button"
          onClick={() => setTab("md")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "md"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Markdown KB
        </button>
        <button
          type="button"
          onClick={() => setTab("tables")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "tables"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Tables KB
        </button>
      </div>

      {tab === "md" && (
        <>
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Docs editables por sesion. El bot usa chunks para buscar.
            </p>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button size="sm">New KB</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nuevo documento KB</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="new-slug">
                      Slug (ej: faq, info-general)
                    </Label>
                    <Input
                      id="new-slug"
                      value={newSlug}
                      onChange={(e) => setNewSlug(e.target.value)}
                      placeholder="faq"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="new-title">Titulo</Label>
                    <Input
                      id="new-title"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="FAQ"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="new-markdown">Markdown</Label>
                    <textarea
                      id="new-markdown"
                      className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={newMarkdown}
                      onChange={(e) => setNewMarkdown(e.target.value)}
                      placeholder="# Titulo\n\nContenido..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? "Creando..." : "Crear"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : selectedDoc ? (
            <Card className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">
                  {selectedDoc.title} ({selectedDoc.slug})
                </h2>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={closeEditor}>
                    Cerrar
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? "Guardando..." : "Guardar"}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Editor (v{editVersion})
                  </Label>
                  <textarea
                    className="mt-1 w-full min-h-[300px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={editMarkdown}
                    onChange={(e) => setEditMarkdown(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Vista previa
                  </Label>
                  <div className="mt-1 min-h-[300px] rounded-md border border-input bg-muted/30 p-4 text-sm prose prose-sm dark:prose-invert max-w-none overflow-auto">
                    {editMarkdown ? (
                      <div className="whitespace-pre-wrap">{editMarkdown}</div>
                    ) : (
                      <span className="text-muted-foreground">
                        Sin contenido
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {docs.length === 0 ? (
                <Card className="p-8 border-dashed text-center">
                  <p className="text-muted-foreground mb-4">
                    Aun no hay documentos en la KB. Crea el primero para que el
                    bot pueda usarlo (FAQ, politicas, info general).
                  </p>
                  <Button onClick={() => setNewOpen(true)}>
                    Crear primera KB
                  </Button>
                </Card>
              ) : (
                docs.map((doc) => (
                  <Card
                    key={doc._id}
                    className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => openEditor(doc)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium">{doc.title}</span>
                        <span className="text-muted-foreground text-sm ml-2">
                          ({doc.slug})
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        v{doc.version} ·{" "}
                        {new Date(doc.updatedAt).toLocaleString()}
                      </span>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </>
      )}

      {tab === "tables" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tablas KB (productos, precios) se actualizan via sync externo (n8n).
            POST /api/kb/tables/[sessionId]/[tableKey]/sync
          </p>
          {tablesLoading ? (
            <p className="text-sm text-muted-foreground">Cargando tablas...</p>
          ) : selectedTableKey ? (
            <Card className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">{selectedTableKey}</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTableKey(null)}
                >
                  Volver
                </Button>
              </div>
              {rowsLoading ? (
                <p className="text-sm text-muted-foreground">
                  Cargando rows...
                </p>
              ) : (
                <div className="overflow-x-auto">
                  {tableRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Sin filas. Sync desde n8n.
                    </p>
                  ) : (
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium">
                            pk
                          </th>
                          <th className="text-left py-2 pr-4 font-medium">
                            data
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map((row, i) => (
                          <tr key={i} className="border-b">
                            <td className="py-2 pr-4 font-mono text-xs">
                              {row.pk}
                            </td>
                            <td
                              className="py-2 font-mono text-xs max-w-md truncate"
                              title={JSON.stringify(row.data)}
                            >
                              {JSON.stringify(row.data)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </Card>
          ) : (
            <div className="space-y-2">
              {tables.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay tablas. Sync desde n8n para crear products, etc.
                </p>
              ) : (
                tables.map((t) => (
                  <Card
                    key={t.tableKey}
                    className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => openTable(t.tableKey)}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{t.tableKey}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.rowCount} filas
                      </span>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div className="pt-4">
        <Link
          href="/sim"
          className="text-sm text-muted-foreground hover:underline"
        >
          Volver al Simulador
        </Link>
      </div>
    </div>
  );
}
