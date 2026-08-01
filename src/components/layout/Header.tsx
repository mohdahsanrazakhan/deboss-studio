import Link from "next/link";
import { Menu, X } from "lucide-react";
import { CreateLauncher } from "./CreateLauncher";

type HeaderProps = {
  /**
   * Whether the brand name is the page's <h1>. Pages with their own more
   * specific h1 (e.g. a gallery example's title) pass false, so there's
   * exactly one h1 per page; the brand name then renders as an <h2>
   * instead, styled identically via the shared `.navbar-brand-title` class
   * either way.
   */
  brandIsH1?: boolean;
};

/**
 * Primary site nav: floating pill navbar (logo, Home/Gallery/Blog links,
 * a CreateLauncher CTA), collapsing to a <details>-based dropdown below
 * globals.css's shared 880px mobile breakpoint.
 *
 * Server component, no client JS: the mobile toggle is a native
 * <details>/<summary> disclosure (same pattern FAQ.tsx already uses for
 * the same reason, see CLAUDE.md), not React state, so this needs no
 * "use client" boundary despite being interactive. CreateLauncher is the
 * one client island (opens the gallery-submission set picker/modal), same
 * isolation pattern as RichTextEditor being a separate client child of a
 * server-component parent.
 */
const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/gallery", label: "Gallery" },
  { href: "/blog", label: "Blog" },
];

export function Header({ brandIsH1 = true }: HeaderProps) {
  const BrandTitle = brandIsH1 ? "h1" : "h2";
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="navbar-brand">
          <span className="navbar-mark" aria-hidden="true" />
          <BrandTitle className="navbar-brand-title">Deboss Studio</BrandTitle>
        </Link>

        <nav className="navbar-links" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <CreateLauncher />

        <details className="navbar-mobile">
          <summary className="navbar-mobile-toggle" aria-label="Menu">
            <Menu size={20} aria-hidden="true" className="navbar-icon-open" />
            <X size={20} aria-hidden="true" className="navbar-icon-close" />
          </summary>
          <div className="navbar-mobile-panel">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
            <CreateLauncher mobile />
          </div>
        </details>
      </div>
    </header>
  );
}
