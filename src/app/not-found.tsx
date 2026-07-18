import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";

export const metadata: Metadata = {
  title: "Page Not Found",
  description: "The page you're looking for doesn't exist or may have moved.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="app">
      <Header brandIsH1={false} />
      <main className="not-found">
        <div className="not-found-code" aria-hidden="true">404</div>
        <h1>Page not found</h1>
        <p>The page you&apos;re looking for doesn&apos;t exist, or it may have moved.</p>
        <div className="actions">
          <Link href="/" className="btn primary">Back to the studio</Link>
          <Link href="/gallery" className="btn ghost">Browse gallery</Link>
          <Link href="/blog" className="btn ghost">Read the blog</Link>
        </div>
      </main>
    </div>
  );
}
