import Link from "next/link";
import { ConversationDetail } from "@/components/conversation-detail";
import { Button } from "@/components/ui/button";

type Props = { params: Promise<{ whatsappId: string }> };

export default async function ConversationPage({ params }: Props) {
  const { whatsappId } = await params;
  const decoded = decodeURIComponent(whatsappId);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">← Inicio</Link>
        </Button>
        <h1 className="font-mono text-sm font-medium truncate flex-1">{decoded}</h1>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-6">
        <ConversationDetail whatsappId={decoded} />
      </main>
    </div>
  );
}
