export default function Loading() {
  return (
    <main className="route-feedback" aria-busy="true">
      <p role="status">စာရင်းများ ရယူနေသည်…</p>
      <div className="loading-placeholder" aria-hidden="true" />
      <div className="loading-placeholder" aria-hidden="true" />
    </main>
  );
}
