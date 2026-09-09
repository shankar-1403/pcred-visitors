import type { Metadata } from "next";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Reception",
};

export default function ReceptionLayout({
  children,
}: LayoutProps<"/reception">) {
  return <AppShell>{children}</AppShell>;
}
