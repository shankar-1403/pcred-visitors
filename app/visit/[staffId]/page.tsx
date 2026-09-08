import CheckInFlow from "@/components/kiosk/CheckInFlow";

export default async function StaffVisitLinkPage({
  params,
}: {
  params: Promise<{ staffId: string }>;
}) {
  const { staffId } = await params;

  return <CheckInFlow presetStaffId={staffId} />;
}
