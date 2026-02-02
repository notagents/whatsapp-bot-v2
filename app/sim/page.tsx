import Link from "next/link";
import { getAvailableSessions } from "@/lib/sim-sessions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SimulatorPage() {
  const sessions = await getAvailableSessions();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">← Inicio</Link>
        </Button>
        <h1 className="text-lg font-semibold">Chat Simulator</h1>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Elegir sesión</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {sessions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No hay sesiones activas en Baileys. Comprueba que
                BAILEYS_API_URL esté configurado y que el servicio Baileys tenga
                al menos una sesión conectada.
              </p>
            ) : (
              sessions.map((sessionId) => (
                <Button key={sessionId} variant="outline" asChild>
                  <Link href={`/sim/${encodeURIComponent(sessionId)}`}>
                    {sessionId}
                  </Link>
                </Button>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
