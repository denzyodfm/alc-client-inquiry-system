import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ALC Client Inquiry System",
  description: "Centralized client inquiry and branch loan verification system"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
