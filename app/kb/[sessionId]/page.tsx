import { KbManager } from "@/components/kb-manager";

type Props = {
  params: Promise<{ sessionId: string }>;
};

export default async function KbPage({ params }: Props) {
  const { sessionId } = await params;
  const decoded = decodeURIComponent(sessionId);
  return (
    <div className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold mb-4">
        Knowledge Base — {decoded}
      </h1>
      <KbManager sessionId={decoded} />
    </div>
  );
}
