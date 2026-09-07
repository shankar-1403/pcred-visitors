import type { Metadata } from "next";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Staff",
};

export default function StaffLayout({ children }: LayoutProps<"/staff">) {
  return <AppShell>{children}</AppShell>;
}
