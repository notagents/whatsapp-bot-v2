import { SimulatorSession } from "@/components/simulator-session";

type Props = {
  params: Promise<{ sessionId: string }>;
};

export default async function SessionSimulatorPage({ params }: Props) {
  const { sessionId } = await params;
  const decoded = decodeURIComponent(sessionId);
  return <SimulatorSession sessionId={decoded} />;
}
