import ProtocolWorkspace from "@/components/protocol-workspace";

export default function ProtocolsPage({
  searchParams,
}: {
  searchParams: { athleteId?: string };
}) {
  return <ProtocolWorkspace athleteId={searchParams.athleteId} />;
}
