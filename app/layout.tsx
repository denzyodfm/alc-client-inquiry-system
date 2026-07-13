import type { Metadata } from "next";
import { startMidnightSyncScheduler } from "@/lib/midnight-sync-scheduler";
import "./globals.css";

export const metadata: Metadata = {
  title: "ALC Client Inquiry System",
  description: "Centralized client inquiry and branch loan verification system"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  startMidnightSyncScheduler();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
