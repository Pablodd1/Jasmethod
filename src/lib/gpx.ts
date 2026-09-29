// GPX course ingestion — measured distance + elevation gain from a course file.
// Athlete uploads the race GPX (exported from any watch/platform); we extract
// the real course numbers the forecast should be using.

export interface GpxCourse {
  km: number;
  elevM: number;
  points: number;
  /** Elevation profile sampled ~every 1% of course (max 400 pts) — feeds the
   *  per-segment pacing table. Entries without elevation are excluded. */
  profile: { km: number; elevM: number }[];
}

function haversineM(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Parse a GPX string into measured course distance (km) and total ascent (m).
 * Tolerant of namespaced tags (<gpxtpx:...>) and missing elevations.
 */
export function parseGpxCourse(xml: string): GpxCourse | null {
  try {
    const pointRe = /<trkpt[^>]*lat="(-?\d+(?:\.\d+)?)"[^>]*lon="(-?\d+(?:\.\d+)?)"[^>]*>([\s\S]*?)<\/trkpt>|<trkpt[^>]*lat="(-?\d+(?:\.\d+)?)"[^>]*lon="(-?\d+(?:\.\d+)?)"[^>]*\/>/g;
    const pts: { lat: number; lon: number; ele: number | null }[] = [];
    let m: RegExpExecArray | null;
    while ((m = pointRe.exec(xml)) !== null) {
      const lat = parseFloat(m[1] ?? m[4]);
      const lon = parseFloat(m[2] ?? m[5]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      let ele: number | null = null;
      const eleMatch = m[3]?.match(/<ele>\s*(-?\d+(?:\.\d+)?)\s*<\/ele>/);
      if (eleMatch) ele = parseFloat(eleMatch[1]);
      pts.push({ lat, lon, ele });
    }
    if (pts.length < 2) return null;
    let meters = 0;
    let elevM = 0;
    let prevEle = pts[0].ele;
    for (let i = 1; i < pts.length; i++) {
      meters += haversineM(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
      const e = pts[i].ele;
      if (e != null && prevEle != null && e > prevEle) elevM += e - prevEle;
      if (e != null) prevEle = e;
    }
    if (meters < 100) return null;
    // Downsample the cumulative-distance/elevation trace for the pacing table.
    const cum: { km: number; ele: number | null }[] = [];
    let dist = 0;
    cum.push({ km: 0, ele: pts[0].ele });
    for (let i = 1; i < pts.length; i++) {
      dist += haversineM(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
      cum.push({ km: dist / 1000, ele: pts[i].ele });
    }
    const totalKm = dist / 1000;
    const maxPts = 400;
    const stepKm = Math.max(0.1, totalKm / maxPts);
    const profile: { km: number; elevM: number }[] = [];
    let lastEle: number | null = null;
    for (const c of cum) {
      if (c.ele == null) continue;
      if (!profile.length || c.km - profile[profile.length - 1].km >= stepKm) {
        profile.push({ km: +c.km.toFixed(2), elevM: Math.round(c.ele) });
        lastEle = c.ele;
      } else lastEle = c.ele;
    }
    if (lastEle != null && profile.length && cum.length) {
      const last = cum[cum.length - 1];
      if (last.ele != null && last.km - profile[profile.length - 1].km > stepKm / 2)
        profile.push({ km: +last.km.toFixed(2), elevM: Math.round(last.ele) });
    }
    return {
      km: Math.round(totalKm * 100) / 100,
      elevM: Math.round(elevM),
      points: pts.length,
      profile,
    };
  } catch {
    return null;
  }
}
