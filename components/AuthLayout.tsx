export function AuthLayout({
  eyebrow,
  title,
  sub,
  children,
  foot,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  children: React.ReactNode;
  foot?: React.ReactNode;
}) {
  return (
    <main className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-brand">
          <span className="brand-mark">L</span>
          <div>
            <b>Ledger</b>
          </div>
        </div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{sub}</p>
        {children}
        {foot && <p className="muted auth-foot">{foot}</p>}
      </div>
    </main>
  );
}
