import type { Metadata } from "next";
import { startMidnightSyncScheduler } from "@/lib/midnight-sync-scheduler";
import { startLocationLinkScheduler } from "@/lib/location-link-scheduler";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ALC Client Inquiry System", template: "%s | ALC" },
  description: "Centralized client inquiry and branch loan verification system"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  startMidnightSyncScheduler();
  startLocationLinkScheduler();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
