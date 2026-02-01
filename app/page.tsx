import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { DashboardOverview } from "@/components/dashboard-overview";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">WhatsApp Engine</h1>
        <nav className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/sim">Chat Simulator</Link>
          </Button>
          <LogoutButton />
        </nav>
      </header>
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <DashboardOverview />
      </main>
    </div>
  );
}
