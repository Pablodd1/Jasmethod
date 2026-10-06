"use client";
import Link from "next/link";
export default function CoachError({ reset }: { reset: () => void }) {
  return <main className="max-w-lg mx-auto p-6 space-y-4">
    <h1 className="text-2xl font-bold">J Koach</h1>
    <p role="alert">The conversation could not open. Please retry. / No se pudo abrir la conversación. Inténtalo de nuevo.</p>
    <button className="btn-primary" onClick={reset}>Retry / Reintentar</button>
    <Link className="btn-secondary inline-flex ml-3" href="/today">Today / Hoy</Link>
  </main>;
}
