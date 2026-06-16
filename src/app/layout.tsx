import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

export const metadata: Metadata = {
  title: "OrbiPulse — Industrial IoT Dashboard",
  description: "OrbiPulse / OrbiDrive device monitoring and control platform by E-Actuell Labs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased bg-[#0a0e1a] text-slate-200">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
