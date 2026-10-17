import { Footer, TopBar } from "@/components/Chrome";

/** The deep-link routes (/ledger, /rules, /architecture, /finding/[id], /dev) keep Keel's TopBar and Footer. */
export default function KeelLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
