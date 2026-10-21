"use client";

import { useEffect, useState } from "react";
import {
  DIMENSION_LABEL, SECTION_COPY, buildSetupPaths, formatCount, mapEmailPreferences, mapIntervalsPreferences, mapStoredCounts,
  mapTelegramPreferences, rowCopy, statusLabel, type Lang, type ProviderInput, type SetupInputs, type SetupRow,
} from "@/lib/athlete-setup-paths";

/**
 * One setup flow, two independent sections: "Import my training" and "Receive my plan".
 * Each row shows four separate statuses (authorization / import / publication / device delivery) from the
 * pure model in athlete-setup-paths.ts. This component only fetches and renders; it decides nothing.
 * Every extra request is best-effort: a failure leaves that status "unknown" and never blocks the page.
 */
type Extras = Pick<SetupInputs, "stored" | "intervalsPublish" | "email" | "telegram">;

async function readJson(url: string, signal: AbortSignal): Promise<unknown | null> {
  try {
    const response = await fetch(url, { cache: "no-store", signal });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

const TONE: Record<string, string> = {
  authorized: "ok", ready: "ok", records_stored: "ok", manual_file: "neutral", not_required: "neutral", not_applicable: "muted",
  unavailable: "muted", off: "neutral", no_records: "neutral", not_authorized: "neutral", unverified: "neutral",
  needs_attention: "warn", stale: "warn", failed: "bad", unknown: "warn",
};
const TONE_CLASS: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-800 border-emerald-200", neutral: "bg-slate-50 text-slate-700 border-slate-200", muted: "bg-white text-slate-500 border-slate-200",
  warn: "bg-amber-50 text-amber-900 border-amber-200", bad: "bg-coral-50 text-coral-700 border-coral-200",
};

function Status({ dimension, row, lang }: { dimension: "authorization" | "import" | "publication" | "deviceDelivery"; row: SetupRow; lang: Lang }) {
  const status = row[dimension];
  const label = statusLabel(dimension, status, lang);
  // Colour is never the only signal: the text label always carries the state.
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{DIMENSION_LABEL[dimension][lang]}</dt>
      <dd className={`inline-block mt-0.5 rounded-md border px-2 py-0.5 text-xs ${TONE_CLASS[TONE[status] ?? "warn"]}`}>
        {label}
        {dimension === "import" && (status === "records_stored" || status === "stale") && row.storedCount !== null ? ` · ${formatCount(row.storedCount)}` : ""}
      </dd>
    </div>
  );
}

function actionFor(row: SetupRow, lang: Lang) {
  const es = lang === "es";
  const a = row.action;
  if (a.kind === "connect") {
    return <a className="btn-secondary inline-flex min-h-11 items-center" href={a.href}>{a.reconnect ? (es ? "Reconectar mi cuenta" : "Reconnect my account") : (es ? `Autorizar mi cuenta de ${row.name}` : `Authorize my ${row.name} account`)}</a>;
  }
  if (a.kind === "file") {
    const target = a.provider === "coros" ? "garmin" : a.provider;
    return <a className="underline inline-flex min-h-11 items-center" href={`#provider-${target}`}>{es ? `Importar un archivo (${a.accepts.join(" ")})` : `Import a file (${a.accepts.join(" ")})`}</a>;
  }
  if (a.kind === "link") return <a className="underline inline-flex min-h-11 items-center" href={a.href}>{es ? "Abrir" : "Open"}</a>;
  return null;
}

function Section({ id, rows, lang }: { id: "import" | "receive"; rows: SetupRow[]; lang: Lang }) {
  const copy = SECTION_COPY[id];
  return (
    <section className="card space-y-3" aria-labelledby={`setup-${id}-heading`}>
      <h2 id={`setup-${id}-heading`} className="font-display text-lg font-bold">{copy.title[lang]}</h2>
      <p className="text-sm text-slate-700">{copy.intro[lang]}</p>
      <ul className="space-y-3">
        {rows.map(row => {
          const text = rowCopy(row, lang);
          return (
            <li key={row.id} className="rounded-lg border border-slate-200 p-3 space-y-2" data-setup-row={row.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{row.name}{row.conditional ? <span className="ml-2 text-xs font-normal text-slate-500">{lang === "es" ? "(opcional, si está habilitada)" : "(optional, when enabled)"}</span> : null}</h3>
                {actionFor(row, lang)}
              </div>
              <p className="text-sm text-slate-700">{text.what}</p>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Status dimension="authorization" row={row} lang={lang} />
                <Status dimension="import" row={row} lang={lang} />
                <Status dimension="publication" row={row} lang={lang} />
                <Status dimension="deviceDelivery" row={row} lang={lang} />
              </dl>
              {row.lastSuccessfulSyncAt && <p className="text-xs text-slate-500">{lang === "es" ? "Última sincronización correcta: " : "Last successful sync: "}{new Date(row.lastSuccessfulSyncAt).toLocaleString()}</p>}
              {row.latestRecordAt && <p className="text-xs text-slate-500">{lang === "es" ? "Registro más reciente guardado: " : "Most recent stored record: "}{new Date(row.latestRecordAt).toLocaleDateString()}</p>}
              {row.lastError && <p role="status" className="text-xs text-amber-800">{row.lastError}</p>}
              <p className="text-xs text-slate-600">{text.limit}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SetupPaths({ lang, providers, intervalsConnector, loading, refreshKey = 0 }: {
  lang: Lang; providers: ProviderInput[]; intervalsConnector: boolean; loading: boolean; refreshKey?: number;
}) {
  const [extras, setExtras] = useState<Extras>({ stored: null, intervalsPublish: null, email: null, telegram: null });
  const intervalsConnected = providers.some(p => p.id === "intervals" && p.status === "connected");
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    void Promise.all([
      readJson("/api/onboard/import-review", signal),
      intervalsConnector && intervalsConnected ? readJson("/api/connectors/intervals/preferences", signal) : Promise.resolve(null),
      readJson("/api/workout-email/preferences", signal),
      readJson("/api/coaching/preferences", signal),
    ]).then(([review, intervals, email, telegram]) => {
      if (signal.aborted) return;
      setExtras({ stored: mapStoredCounts(review), intervalsPublish: mapIntervalsPreferences(intervals), email: mapEmailPreferences(email), telegram: mapTelegramPreferences(telegram) });
    });
    return () => controller.abort();
  }, [intervalsConnector, intervalsConnected, refreshKey]);

  const paths = buildSetupPaths({ now: Date.now(), providers: loading ? null : providers, capabilities: { intervalsConnector }, ...extras });
  return (
    <div className="space-y-4" data-testid="setup-paths">
      <p className="text-sm text-slate-700">{lang === "es"
        ? "Todo es opcional: puedes seguir usando JMM sin conectar nada. Cada estado de abajo es independiente: autorizar no significa que se haya importado algo, y publicar no significa que tu reloj lo haya recibido."
        : "Everything is optional: you can use JMM without connecting anything. Each status below is separate: authorizing does not mean anything was imported, and publishing does not mean your watch received it."}</p>
      <Section id="import" rows={paths.import} lang={lang} />
      <Section id="receive" rows={paths.receive} lang={lang} />
    </div>
  );
}
