import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/components/AppProvider";
import { Footer, TopBar } from "@/components/Chrome";
import { getConfig, toAppConfig } from "@/lib/config";
import type { AppConfig } from "@/lib/types";

/** C2: the mode pill renders from server-side config, so it never flashes "Connecting". */
function initialConfig(): AppConfig | null {
  try {
    return toAppConfig(getConfig());
  } catch {
    return null;
  }
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Keel · version-bound control evidence",
  description: "Know what changed, and who reviewed that exact evidence. Files have versions. Compliance evidence should too.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <AppProvider initialConfig={initialConfig()}>
          <TopBar />
          <main className="flex-1">{children}</main>
          <Footer />
        </AppProvider>
      </body>
    </html>
  );
}
