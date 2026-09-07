import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My calendar",
};

export default function CalendarLayout({
  children,
}: LayoutProps<"/staff/calendar">) {
  return children;
}
