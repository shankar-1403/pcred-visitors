import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/src/context/AuthContext";
import ServiceWorker from "@/components/ServiceWorker";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT", "WONK"],
});

export const metadata: Metadata = {
  title: {
    default: "PCRED",
    template: "%s | PCRED",
  },
  description:
    "Front-desk visitor check-in for the PCRED office, with instant approvals from the person being visited.",
  // Internal office tool — never meant to be found through search.
  robots: { index: false, follow: false, nocache: true },
  icons: {
    icon: "/favicon.jpg",
    apple: "/apple-icon.png",
  },
  // iOS ignores the web app manifest for these, so they have to be said twice.
  appleWebApp: {
    capable: true,
    title: "PCRED",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#022436",
  // The kiosk lives on a fixed tablet; pinch-zoom there is an accident, not a
  // feature. maximumScale stays at 5 so the staff pages remain zoomable.
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <AuthProvider>{children}</AuthProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
