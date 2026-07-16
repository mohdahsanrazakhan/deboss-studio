type HeaderProps = {
  /**
   * Whether the brand name is the page's <h1>. Pages with their own more
   * specific h1 (e.g. a gallery example's title) pass false, so there's
   * exactly one h1 per page; the brand name then renders as a <p> instead,
   * styled identically via the shared `.brand-title` class either way.
   */
  brandIsH1?: boolean;
};

/**
 * Site header: server component (no interactivity).
 */
export function Header({ brandIsH1 = true }: HeaderProps) {
  const BrandTitle = brandIsH1 ? "h1" : "h2";
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div className="brand-text">
          <BrandTitle className="brand-title">Deboss Studio</BrandTitle>
          <p>Press any text into premium textured paper.</p>
        </div>
      </div>
    </header>
  );
}
