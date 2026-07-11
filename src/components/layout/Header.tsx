/**
 * Site header — server component (no interactivity).
 */
export function Header() {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div className="brand-text">
          <h1>Deboss Studio</h1>
          <p>Press any text into premium textured paper.</p>
        </div>
      </div>
    </header>
  );
}
