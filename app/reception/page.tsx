"use client";

import RoleGate from "@/components/RoleGate";
import ScheduledMeetings from "@/components/reception/ScheduledMeetings";

export default function ReceptionPage() {
  return (
    <RoleGate
      allow="reception"
      title="This dashboard is for reception"
      body="It lists upcoming meetings across the office. Staff use their own calendar; admins manage the directory."
      backHref="/staff"
      backLabel="Go back"
    >
      <ScheduledMeetings />
    </RoleGate>
  );
}
