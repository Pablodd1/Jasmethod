/** Public registration information only. No athlete record or arbitrary URL fetch. */
export interface EventCandidate {
    id: string;
    name: string;
    discipline: 'run_road' | 'bike_road' | 'swim' | 'triathlon' | null;
    date: string | null;
    localTime: string | null;
    timeZone: string | null;
    offset: string | null;
    location: string;
    address: string;
    distanceM: number | null;
    sourceUrl: string;
    source: 'RunSignup';
    retrievedAt: string;
    missing: string[];
}
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown, max = 300) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max).trim() : '';
export function eventLookupInput(v: unknown): {
    query: string;
    mode: 'name' | 'city';
} {
    const o = obj(v);
    if (Object.keys(o).some(k => !['query', 'mode'].includes(k)) || !['name', 'city'].includes(String(o.mode ?? 'name')) || typeof o.query !== 'string' || o.query.trim().length < 2 || o.query.length > 200 || /[\u0000-\u001f]/.test(o.query))
        throw Error('Enter a race name or city (2–200 characters).');
    return { query: o.query.trim(), mode: (o.mode ?? 'name') as 'name' | 'city' };
}
import { localRaceOffsets } from "./race-local-time";
export { localRaceOffsets } from "./race-local-time";
function dateParts(value: unknown): {
    date: string | null;
    time: string | null;
} {
    const s = text(value), m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: ([01]?\d|2[0-3]):([0-5]\d))?$/);
    if (!m)
        return { date: null, time: null };
    const date = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
        return { date: null, time: null };
    return { date, time: m[4] === undefined ? null : `${m[4].padStart(2, '0')}:${m[5]}` };
}
export function eventDistanceM(value: unknown): number | null {
    const m = text(value).match(/^(\d+(?:\.\d+)?)\s*(km|k|mi|miles?|m|meters?|yards?|yd)$/i);
    if (!m)
        return null;
    const n = Number(m[1]) * ({ k: 1000, km: 1000, mi: 1609.344, mile: 1609.344, miles: 1609.344, m: 1, meter: 1, meters: 1, yd: .9144, yard: .9144, yards: .9144 }[m[2].toLowerCase()] ?? 0);
    return n > 0 && n <= 1e6 ? n : null;
}
export function parseEventCandidates(raw: unknown, retrievedAt: string): EventCandidate[] {
    const r = obj(raw);
    if (!Array.isArray(r.races) || r.races.length > 20)
        throw Error('Event provider response unavailable.');
    return r.races.flatMap(row => {
        const race = obj(obj(row).race);
        if (race.is_private_race !== 'F' || race.is_draft_race !== 'F')
            return [];
        let url: URL;
        try {
            url = new URL(String(race.url));
            if (url.protocol !== 'https:' || url.hostname !== 'runsignup.com' || url.username || url.password)
                return [];
        }
        catch {
            return [];
        }
        const address = obj(race.address), location = ['city', 'state', 'country_code'].map(k => text(address[k])).filter(Boolean).join(', '), fullAddress = ['street', 'city', 'state', 'zipcode'].map(k => text(address[k])).filter(Boolean).join(', ');
        let zone = text(race.timezone) || null;
        try {
            if (zone)
                new Intl.DateTimeFormat('en', { timeZone: zone });
        }
        catch {
            zone = null;
        }
        const events = Array.isArray(race.events) ? race.events.slice(0, 30) : [{}];
        return events.flatMap(item => {
            const e = obj(item);
            if (e.volunteer === 'T')
                return [];
            const parsed = dateParts(e.start_time), date = parsed.date ?? dateParts(race.next_date).date, time = parsed.time, offsets = date && time && zone ? localRaceOffsets(date, time, zone) : [];
            const discipline: EventCandidate['discipline'] = ({ running_race: 'run_road', bike_race: 'bike_road', swimming_race: 'swim', triathlon: 'triathlon' } as const)[String(e.event_type) as 'running_race'] ?? null;
            const distanceM = eventDistanceM(e.distance);
            return [{ id: `${text(String(race.race_id), 30)}:${text(String(e.event_id ?? 'race'), 30)}`, name: [text(race.name), text(e.name)].filter(Boolean).join(' · '), discipline, date, localTime: time, timeZone: zone, offset: offsets.length === 1 ? offsets[0] : null, location, address: fullAddress, distanceM, sourceUrl: url.href, source: 'RunSignup' as const, retrievedAt, missing: [...(!date ? ['date'] : []), ...(!time ? ['start time'] : []), ...(!zone ? ['timezone'] : []), ...(time && offsets.length !== 1 ? ['unambiguous UTC offset'] : []), ...(!distanceM ? ['distance / division'] : []), ...(!discipline ? ['discipline'] : [])] }];
        });
    }).slice(0, 30);
}
export async function publicJson(response: Response, cap = 1024 * 1024): Promise<unknown> {
    if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('application/json'))
        throw Error('Public source unavailable.');
    const reader = response.body?.getReader();
    if (!reader)
        throw Error('Empty public source.');
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > cap)
                throw Error('Public response too large.');
            chunks.push(value);
        }
    }
    finally {
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const cache = new Map<string, {
    expires: number;
    items: EventCandidate[];
}>();
let nextAt = 0;
export async function lookupRaceEvents(input: ReturnType<typeof eventLookupInput>, options: {
    fetcher?: typeof fetch;
    now?: () => number;
    registration?: string;
    secret?: string;
} = {}) {
    if (process.env.RACE_PUBLIC_LOOKUP_ENABLED === 'false')
        throw Error('Public event lookup disabled by operator.');
    const now = options.now ?? Date.now, key = JSON.stringify(input), cached = cache.get(key);
    if (cached && cached.expires > now())
        return cached.items;
    const registration = options.registration ?? process.env.RUNSIGNUP_CALLER_TOKEN, secret = options.secret ?? process.env.RUNSIGNUP_CALLER_SECRET;
    if (now() >= Date.UTC(2027, 0, 1) && (!registration || !secret))
        throw Error('Event provider requires operator API caller registration. Enter details manually.');
    if (now() < nextAt)
        throw Error('Event search is temporarily rate limited.');
    nextAt = now() + 1000;
    const url = new URL('https://api.runsignup.com/rest/races');
    // A supplied URL is never fetched. Search by name/city; external websites remain references.
    if (/^https?:\/\//i.test(input.query))
        throw Error('Search by event name or city. Event website links remain references; arbitrary pages are not fetched.');
    for (const [k, v] of Object.entries({ format: 'json', results_per_page: '8', events: 'T', [input.mode === 'city' ? 'city' : 'name']: input.query }))
        url.searchParams.set(k, v);
    if (registration && secret)
        url.searchParams.set('rsu_api_reg', registration);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (registration && secret)
        headers['X-RSU-API-REG-SECRET'] = secret;
    const response = await (options.fetcher ?? fetch)(url, { headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (response.status === 429) {
        const retry = response.headers.get('retry-after') ?? '', seconds = Number(retry), at = Number.isFinite(seconds) && seconds > 0 ? now() + seconds * 1000 : Date.parse(retry);
        nextAt = Number.isFinite(at) ? Math.max(now() + 60000, at) : now() + 60000;
        throw Error('Event provider throttled');
    }
    const raw = await publicJson(response);
    const items = parseEventCandidates(raw, new Date(now()).toISOString());
    if (cache.size >= 100)
        cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: now() + 3600000, items });
    return items;
}
/** US registry address matching, not proof of the start line. No city centroid is silently selected. */
export async function lookupRaceVenue(address: string, fetcher: typeof fetch = fetch) {
    if (typeof address !== 'string' || address.length < 5 || address.length > 300 || /[\u0000-\u001f]/.test(address))
        throw Error('A public US event street address is required.');
    const u = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
    for (const [k, v] of Object.entries({ address, benchmark: 'Public_AR_Current', format: 'json' }))
        u.searchParams.set(k, v);
    const raw = obj(await publicJson(await fetcher(u, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) }))), matches = obj(raw.result).addressMatches;
    return (Array.isArray(matches) ? matches : []).slice(0, 5).flatMap(v => { const m = obj(v), c = obj(m.coordinates); return typeof c.x === 'number' && typeof c.y === 'number' && Math.abs(c.x) <= 180 && Math.abs(c.y) <= 90 ? [{ latitude: c.y, longitude: c.x, label: text(m.matchedAddress), source: 'US Census Geocoder', sourceUrl: 'https://geocoding.geo.census.gov/' }] : []; });
}
