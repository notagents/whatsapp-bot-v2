import { SendMessageForm } from "@/components/send-message-form";
import { ConversationsList } from "@/components/conversations-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">WhatsApp Engine</h1>
      </header>
      <main className="mx-auto max-w-4xl space-y-8 px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Enviar mensaje</CardTitle>
          </CardHeader>
          <CardContent>
            <SendMessageForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Conversaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <ConversationsList />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
