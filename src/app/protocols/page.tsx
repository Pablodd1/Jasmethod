import ProtocolWorkspace from "@/components/protocol-workspace";

export default async function ProtocolsPage({
  searchParams,
}: {
  searchParams: Promise<{ athleteId?: string }>;
}) {
  return <ProtocolWorkspace athleteId={(await searchParams).athleteId} />;
}
