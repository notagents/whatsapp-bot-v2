import { SimulatorSession } from "@/components/simulator-session";

type Props = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ config?: string }>;
};

export default async function SessionSimulatorPage({
  params,
  searchParams,
}: Props) {
  const { sessionId } = await params;
  const { config } = await searchParams;
  const decoded = decodeURIComponent(sessionId);
  const configOverride =
    config === "draft" || config === "published" ? config : undefined;
  return (
    <SimulatorSession sessionId={decoded} configOverride={configOverride} />
  );
}
