/** Return all valid instants; never invent an offset in a DST gap or fold. */
export function localRaceOffsets(date: string, time: string, zone: string): string[] {
    if (!/^\d{4}-\d\d-\d\d$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        return [];
    try {
        const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
        const wall = Date.parse(`${date}T${time}:00Z`), result: string[] = [];
        for (let n = -14 * 60; n <= 14 * 60; n += 15) {
            const instant = new Date(wall - n * 60000);
            if (fmt.format(instant).replace(' ', 'T') === `${date}T${time}`)
                result.push(`${n < 0 ? '-' : '+'}${String(Math.floor(Math.abs(n) / 60)).padStart(2, '0')}:${String(Math.abs(n) % 60).padStart(2, '0')}`);
        }
        return result;
    }
    catch {
        return [];
    }
}
