"use client";

export default function ErrorPage({ reset }: { readonly reset: () => void }) {
  return (
    <main className="shell center">
      <h1 className="title">Algo ha fallado</h1>
      <p className="muted">No hemos podido cargar la página.</p>
      <button type="button" className="btn primary" onClick={reset}>
        Reintentar
      </button>
    </main>
  );
}
