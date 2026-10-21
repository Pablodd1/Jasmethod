"use client";
import { useEffect, useRef, useState } from 'react';
import type { EventCandidate } from '@/lib/race-event-lookup';
import { localRaceOffsets } from '@/lib/race-local-time';
import type { RaceEnvironment, WeatherSnapshot } from '@/lib/race-environment';
import { overrideRaceEnvironment } from '@/lib/race-thermal';
import { fmtTemp, type UnitSystem } from '@/lib/units';
import type { Draft } from '@/lib/race-scenario-draft';
import type { EnvironmentEvidence } from '@/lib/race-environment-evidence';
type Venue = {
    latitude: number;
    longitude: number;
    label: string;
    source: string;
    sourceUrl: string;
};
const control = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocean-800';
const button = 'min-h-11 rounded-xl bg-ocean-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-800';
export function RaceIntelligenceCard({ draft, onEvent, onVenue, onContext, es, units }: {
    draft: Draft;
    onEvent: (event: EventCandidate) => void;
    onVenue: (venue: Venue) => void;
    onContext: (evidence: EnvironmentEvidence) => void;
    es: boolean;
    units: UnitSystem;
}) {
    const say = (en: string, spanish: string) => es ? spanish : en;
    const [query, setQuery] = useState(''), [mode, setMode] = useState('name'), [candidates, setCandidates] = useState<EventCandidate[]>([]), [selected, setSelected] = useState<EventCandidate | null>(null), [venues, setVenues] = useState<Venue[]>([]);
    const [weather, setWeather] = useState<RaceEnvironment | null>(null), [manual, setManual] = useState<WeatherSnapshot | null>(null), [temp, setTemp] = useState(''), [dew, setDew] = useState(''), [wind, setWind] = useState('');
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const active = useRef<AbortController | null>(null), generation = useRef(0);
    const basis = JSON.stringify([draft.date, draft.startTime, draft.offset, draft.timeZone, draft.latitude, draft.longitude, draft.coordinatesReviewed]);
    useEffect(() => { generation.current++; active.current?.abort(); setBusy(false); setWeather(null); setManual(null); setError(''); }, [basis]);
    useEffect(() => { if (draft.environment) {
        setWeather(draft.environment.original);
        setManual(draft.environment.manual);
    } }, [draft.environment]);
    useEffect(() => { setTemp(''); setDew(''); setWind(''); }, [units]);
    useEffect(() => { setSelected(null); setCandidates([]); setVenues([]); }, [draft.raceId]);
    useEffect(() => () => { active.current?.abort(); }, []);
    async function request(path: string, body: unknown) { active.current?.abort(); const c = new AbortController(); active.current = c; setBusy(true); setError(''); setNotice(''); const id = ++generation.current; try {
        const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: c.signal, cache: 'no-store' });
        const v = await r.json();
        if (!r.ok)
            throw Error(v.error || say('Lookup unavailable', 'Consulta no disponible'));
        if (id !== generation.current || c.signal.aborted)
            return null;
        return v;
    }
    catch (e) {
        if (!c.signal.aborted)
            setError((e as Error).message);
        return null;
    }
    finally {
        if (id === generation.current)
            setBusy(false);
    } }
    async function search() { setCandidates([]); setVenues([]); setSelected(null); const r = await request('/api/race-scenarios/lookup', { query, mode }); if (r) {
        setCandidates(r.candidates);
        setNotice(r.candidates.length ? say('Confirm the matching event below.', 'Confirma el evento que coincide abajo.') : say('No matching public events. Enter only the missing details below.', 'Sin eventos públicos coincidentes. Introduce abajo solo los datos que faltan.'));
    } }
    async function confirm(event: EventCandidate) { onEvent(event); setSelected(event); setCandidates([]); setVenues([]); setNotice(say('Event details copied for your review. Existing corrections were retained.', 'Datos copiados para revisión. Se conservaron tus correcciones.')); }
    async function venue() { if (!selected)
        return; const r = await request('/api/race-scenarios/lookup', { mode: 'venue', query: selected.address }); if (r) {
        setVenues(r.venues);
        setNotice(r.venues.length ? say('Confirm the registry address matches the race venue; it may be an organizer address.', 'Confirma que la dirección del registro coincide con el lugar; puede ser del organizador.') : say('No reliable address match. Venue coordinates remain unresolved.', 'Sin coincidencia fiable. Las coordenadas siguen sin resolver.'));
    } }
    async function conditions() {
        if (manual) {
            setError(say('Your manual corrections are retained. Restore source conditions before refreshing.', 'Se conservan tus correcciones. Restaura la fuente antes de actualizar.'));
            return;
        }
        const offsets = localRaceOffsets(draft.date, draft.startTime, draft.timeZone), offset = draft.offset || (offsets.length === 1 ? offsets[0] : '');
        if (!draft.coordinatesReviewed || !draft.date || !draft.startTime || !offset || !draft.timeZone || draft.latitude === '' || draft.longitude === '') {
            setError(say('Confirm the venue, date, local start time and timezone first. A daylight-saving ambiguity needs an explicit offset.', 'Confirma lugar, fecha, salida y zona horaria. Una ambigüedad de horario de verano necesita desfase explícito.'));
            return;
        }
        const r = await request('/api/race-scenarios/environment', { latitude: Number(draft.latitude), longitude: Number(draft.longitude), at: `${draft.date}T${draft.startTime}:00${offset}`, timeZone: draft.timeZone });
        if (r) {
            setWeather(r);
            setManual(null);
        }
    }
    function edit() { if (!weather?.snapshot)
        return; try {
        const c = (s: string) => { if (!s.trim())
            return undefined; const n = Number(s); if (!Number.isFinite(n))
            throw Error(say('Enter a valid number', 'Introduce un número válido')); return n; }, t = c(temp), d = c(dew), w = c(wind);
        const result = overrideRaceEnvironment(weather.snapshot, { ...(t === undefined ? {} : { airTempC: units === 'imperial' ? (t - 32) * 5 / 9 : t }), ...(d === undefined ? {} : { dewPointC: units === 'imperial' ? (d - 32) * 5 / 9 : d }), ...(w === undefined ? {} : { windSpeedMps: units === 'imperial' ? w / 2.2369362921 : w }) });
        setManual(result.snapshot);
        setError('');
    }
    catch (e) {
        setError((e as Error).message);
    } }
    const point = manual ?? weather?.snapshot;
    const missing = selected?.missing.filter(field => field === 'date' ? !draft.date : field === 'start time' ? !draft.startTime : field === 'timezone' ? !draft.timeZone : field === 'unambiguous UTC offset' ? !draft.offset && localRaceOffsets(draft.date,draft.startTime,draft.timeZone).length !== 1 : field === 'distance / division' ? draft.legs.some(leg=>!leg.distanceKm) : true) ?? [];
    const labels = { live_forecast: say('Live forecast', 'Pronóstico disponible'), historical_race_day: say('Historical race-day conditions', 'Condiciones históricas del día'), historical_seasonal_estimate: say('Historical seasonal estimate', 'Estimación histórica estacional'), insufficient_weather_data: say('Insufficient weather data', 'Datos meteorológicos insuficientes') };
    const weatherLine = (s: WeatherSnapshot) => <>{fmtTemp(s.airTempC, units)} · {say('Dew point', 'Punto de rocío')} {fmtTemp(s.dewPointC, units)} · {say('Wind', 'Viento')} {s.windSpeedMps === null ? '—' : `${(s.windSpeedMps * (units === 'imperial' ? 2.2369362921 : 1)).toFixed(1)} ${units === 'imperial' ? 'mph' : 'm/s'}`}</>;
    return <section aria-labelledby="race-intelligence-title" className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
    <h2 id="race-intelligence-title" className="text-xl font-bold">{say('Find your race and conditions', 'Encuentra tu carrera y sus condiciones')}</h2>
    <p className="text-sm text-slate-600">{say('Search public RunSignup events by name or city. Review the event before using its details. Other official websites remain references.', 'Busca eventos públicos de RunSignup por nombre o ciudad. Revisa el evento antes de usar sus datos. Otras webs oficiales siguen como referencias.')}</p>
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"><label className="text-sm">{say('Race or city', 'Carrera o ciudad')}<input className={control} value={query} onChange={e => { active.current?.abort(); generation.current++; setBusy(false); setCandidates([]); setQuery(e.target.value); }} maxLength={200}/></label><label className="text-sm">{say('Search by', 'Buscar por')}<select className={control} value={mode} onChange={e => setMode(e.target.value)}><option value="name">{say('Race name', 'Nombre')}</option><option value="city">{say('City', 'Ciudad')}</option></select></label><button type="button" disabled={busy || query.trim().length < 2} className={button} onClick={() => void search()}>{say('Find race', 'Buscar carrera')}</button></div>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}{notice && <p role="status" className="text-sm text-slate-700">{notice}</p>}
    {candidates.length > 0 && <ul className="space-y-3">{candidates.map(e => <li key={e.id} className="rounded-xl border p-3"><p className="font-semibold">{e.name}</p><p className="text-sm">{e.location} · {e.date ?? '—'} · {e.localTime ?? say('Start time unknown', 'Salida desconocida')} · {e.timeZone ?? '—'}</p><a className="text-sm underline" href={e.sourceUrl} target="_blank" rel="noopener noreferrer">RunSignup</a><button className={button + ' ml-3'} type="button" onClick={() => void confirm(e)}>{say('Confirm this event', 'Confirmar evento')}</button></li>)}</ul>}
    {selected && <div className="space-y-2 text-sm"><p>{draft.name || selected.name} · {draft.date || '—'} · {draft.startTime || say('Start time unknown', 'Salida desconocida')} · {draft.timeZone || '—'}</p>{missing.length > 0 && <p>{say('Still needed', 'Falta')}: {missing.map(field=>es?({'date':'fecha','start time':'hora de salida','timezone':'zona horaria','unambiguous UTC offset':'desfase UTC sin ambigüedad','distance / division':'distancia / división','discipline':'disciplina'}[field]??field):field).join(', ')}</p>}<button className={button} disabled={busy || !selected.address} type="button" onClick={() => void venue()}>{say('Find venue address', 'Buscar dirección del lugar')}</button></div>}
    {venues.map(v => <div key={v.label} className="rounded-xl border p-3 text-sm"><p>{v.label} · {v.latitude.toFixed(4)}, {v.longitude.toFixed(4)}</p><p>{v.source} · {say('Registry address; confirm the actual race venue.', 'Dirección del registro; confirma el lugar real.')}</p><button type="button" className={button} onClick={() => { onVenue(v); setVenues([]); }}>{say('Confirm venue coordinates', 'Confirmar coordenadas')}</button></div>)}
    <button className={button} type="button" disabled={busy} onClick={() => void conditions()}>{busy ? say('Checking…', 'Consultando…') : say('Get race conditions', 'Consultar condiciones')}</button>
    {weather && <div className="space-y-3 rounded-xl bg-slate-50 p-4"><h3 className="font-bold">{labels[weather.label]}{manual ? ` · ${say('Manual override', 'Corrección manual')}` : ''}</h3>{point && <p className="text-sm">{weatherLine(point)}</p>}{weather.label === 'historical_seasonal_estimate' && <><p className="text-sm">{weather.baselineYears.join(', ')} · {weather.samples.length} {say('matched race-hour samples', 'muestras de la hora de salida')}</p><dl className="grid gap-3 sm:grid-cols-3">{(['airTempC','dewPointC','windSpeedMps'] as const).map(key=>{const range=weather.ranges[key],format=(v:number|undefined)=>key==='windSpeedMps'?(v===undefined?'—':`${(v*(units==='imperial'?2.2369362921:1)).toFixed(1)} ${units==='imperial'?'mph':'m/s'}`):fmtTemp(v,units);return <div key={key}><dt className="text-xs">{key==='airTempC'?say('Temperature median','Mediana de temperatura'):key==='dewPointC'?say('Dew point median','Mediana de punto de rocío'):say('Wind median','Mediana de viento')}</dt><dd className="text-sm">{format(range?.median)} ({format(range?.p10)}–{format(range?.p90)})</dd></div>;})}</dl></>}
    <p className="text-sm">{say('Personalized finish-time prediction remains unavailable. Weather has not changed your pace, power, hydration or saved plan. Indoor HYROX conditions and marine currents remain unknown.', 'La predicción personal de llegada sigue sin estar disponible. El tiempo no ha cambiado tu ritmo, potencia, hidratación ni plan guardado. El clima interior de HYROX y las corrientes marinas siguen desconocidos.')}</p>
    {weather.status === 'available' && <button type="button" className={button} onClick={() => { onContext({ original: weather, manual }); setNotice(say('Weather context attached. Save the scenario below to retain it; this does not approve a workout.', 'Contexto adjunto. Guarda el escenario abajo para conservarlo; esto no aprueba un entrenamiento.')); }}>{say('Attach context to this scenario', 'Adjuntar contexto al escenario')}</button>}
    <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">{say('Weather details and corrections', 'Detalles y correcciones')}</summary>{point && <p className="text-sm">{point.timestampUTC} · {point.timezone}<br />{say('Retrieved', 'Consultado')}: {point.retrievedAtUTC}<br />{say('Relative humidity', 'Humedad relativa')}: {point.relativeHumidityPct?.toFixed(1) ?? '—'}% · WBGT: —</p>}<ul className="list-disc pl-5 text-xs">{weather.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>{weather.attribution && <p className="mt-2 text-xs">{weather.attribution} <a className="underline" href={weather.sourceUrl}>{say('Source', 'Fuente')}</a> · <a className="underline" href={weather.licenseUrl}>{say('License', 'Licencia')}</a></p>}{weather.snapshot && <><div className="my-3 grid gap-2 sm:grid-cols-3">{[[say('Temperature', 'Temperatura'), temp, setTemp, units === 'imperial' ? '°F' : '°C'], [say('Dew point', 'Punto de rocío'), dew, setDew, units === 'imperial' ? '°F' : '°C'], [say('Wind', 'Viento'), wind, setWind, units === 'imperial' ? 'mph' : 'm/s']].map(([label, value, setter, unit]) => <label key={String(label)} className="text-sm">{String(label)} ({String(unit)})<input type="number" step="any" className={control} value={value as string} onChange={e => (setter as (v: string) => void)(e.target.value)}/></label>)}</div><button type="button" className={button} onClick={edit}>{say('Recalculate displayed conditions', 'Recalcular condiciones mostradas')}</button>{manual && <><button type="button" className={button + ' ml-2'} onClick={() => { setManual(null); setTemp(''); setDew(''); setWind(''); }}>{say('Restore source', 'Restaurar fuente')}</button><p className="mt-2 text-xs">{say('Original source retained:', 'Fuente original conservada:')} {weatherLine(weather.snapshot)}</p></>}</>}</details></div>}
  </section>;
}
