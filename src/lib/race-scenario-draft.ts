/** Pure form serialization and saved-scenario roundtrips. No network or storage side effects. */
import type { RaceScenarioInput, ScenarioBaseline, ScenarioLeg, ScenarioSport, ScenarioWeather } from "./race-scenario";
import type { RaceScenarioAnchor } from "./race-scenario-evidence";
import type { RaceScenarioMetadata } from "./race-scenario-metadata";
import { courseToScenarioSegments, type RaceCourseResult } from "./race-course";
import type { RaceHistoryResult, RaceWeatherResult } from "./race-weather";
const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value);
const str = (value: number | null | undefined) => value == null ? "" : String(value);
function safeUrl(value: string) { try { const url = new URL(value); return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : null; } catch { return null; } }
export type ProfilePoint = { distanceM: number; elevationM: number | null; segmentIndex?: number };
export type LegDraft = {
  id: string; sport: ScenarioSport; distanceKm: string; anchorId: string; baselineValue: string; observedAt: string; protocol: string; context: string;
  target: string; targetConfirmed: boolean; timeChangePct: string; courseMode: "unknown" | "flat" | "manual" | "gpx" | "saved"; manualProfile: string; course: RaceCourseResult | null; savedSegments: ScenarioLeg["segments"]; savedProfile: ProfilePoint[]; savedCourseSource: "gpx" | "manual" | "flat"; courseImportedAt: string | null; courseWarnings: string[];
  headwindMps: string; speedCapMps: string; totalMassKg: string; cdaM2: string; crr: string; airDensityKgM3: string; drivetrainEfficiency: string; grossEfficiency: string;
  hrLow: string; hrHigh: string; hrObservedAt: string; hrContext: string; intensityConfirmed: boolean; runPowerTargetW: string; runPowerDevice: string;
};
export type Draft = {
  name: string; raceId: string; eventType: RaceScenarioInput["eventType"]; date: string; startTime: string; offset: string; timeZone: string; location: string; officialUrl: string;
  latitude: string; longitude: string; coordinatesReviewed: boolean; altitudeM: string;
  weatherKind: ScenarioWeather["kind"]; temperatureC: string; humidityPct: string; windMps: string; weatherSource: string; weather: RaceWeatherResult | null; history: RaceHistoryResult | null; weatherRequest: { latitude: number; longitude: number; at: string; timeZone: string } | null; savedWeatherEvidence: RaceScenarioMetadata["weatherEvidence"];
  legs: LegDraft[]; transitionMinutes: string; practicedCarbsGph: string; fuelObservedAt: string; fuelContext: string; fuelTolerated: boolean; sensitivityPercent: string;
};
export function freshLeg(sport: ScenarioSport): LegDraft { return { id: sport, sport, distanceKm: "", anchorId: "manual", baselineValue: "", observedAt: "", protocol: "", context: "", target: "", targetConfirmed: false, timeChangePct: "0", courseMode: "unknown", manualProfile: "", course: null, savedSegments: [], savedProfile: [], savedCourseSource: "manual", courseImportedAt: null, courseWarnings: [], headwindMps: "0", speedCapMps: "", totalMassKg: "", cdaM2: "", crr: "", airDensityKgM3: "", drivetrainEfficiency: "", grossEfficiency: "", hrLow: "", hrHigh: "", hrObservedAt: "", hrContext: "", intensityConfirmed: false, runPowerTargetW: "", runPowerDevice: "" }; }
export function freshDraft(): Draft { return { name: "", raceId: "", eventType: "run_road", date: "", startTime: "", offset: "", timeZone: "", location: "", officialUrl: "", latitude: "", longitude: "", coordinatesReviewed: false, altitudeM: "", weatherKind: "unknown", temperatureC: "", humidityPct: "", windMps: "", weatherSource: "", weather: null, history: null, weatherRequest: null, savedWeatherEvidence: null, legs: [freshLeg("run")], transitionMinutes: "0", practicedCarbsGph: "", fuelObservedAt: "", fuelContext: "", fuelTolerated: false, sensitivityPercent: "0" }; }
export function parseProfile(text: string): { points: ProfilePoint[]; error: string | null } {
  if (!text.trim()) return { points: [], error: null };
  const lines = text.trim().split(/\n/);
  if (lines.length < 2 || lines.length > 2000) return { points: [], error: "Enter between 2 and 2,000 points." };
  const points: ProfilePoint[] = [];
  for (const [index, line] of lines.entries()) {
    const cells = line.trim().split(/[;,\t]/).map(cell => cell.trim());
    if (cells.length !== 2 || cells.some(cell => cell === "" || !Number.isFinite(Number(cell)))) return { points: [], error: `Line ${index + 1}: enter distance in km, elevation in m.` };
    const distanceM = Number(cells[0]) * 1000, elevationM = Number(cells[1]);
    if (distanceM < 0 || (index === 0 && distanceM !== 0) || (index > 0 && distanceM <= points[index - 1].distanceM) || elevationM < -500 || elevationM > 9000) return { points: [], error: `Line ${index + 1}: start at 0 km, increase distance, and check elevation.` };
    points.push({ distanceM, elevationM, segmentIndex: 0 });
  }
  return { points, error: null };
}
export function pointsFor(leg: LegDraft) { return leg.courseMode === "saved" ? leg.savedProfile : leg.courseMode === "gpx" ? leg.course?.profile ?? [] : leg.courseMode === "manual" ? parseProfile(leg.manualProfile).points : []; }
export function buildInput(draft: Draft, anchors: RaceScenarioAnchor[]): RaceScenarioInput {
  const startAt = draft.date && draft.startTime && draft.offset ? `${draft.date}T${draft.startTime}:00${draft.offset}` : null;
  if (!draft.date) throw Error("Enter the event date.");
  if ((draft.startTime || draft.offset) && !startAt) throw Error("Enter both local start time and its UTC offset.");
  if (draft.officialUrl && !safeUrl(draft.officialUrl)) throw Error("Use an ordinary HTTP or HTTPS event link.");
  const legs = draft.legs.map((leg): ScenarioLeg => {
    const anchor = anchors.find(item => item.id === leg.anchorId);
    if (leg.anchorId !== "manual" && (!anchor || !anchor.usable)) throw Error("The saved athlete reference is no longer available or needs review. Select a current reference, or explicitly choose a dated manual observation.");
    const baseline: ScenarioBaseline | null = leg.baselineValue === "" ? null : {
      sourceId: anchor?.usable ? anchor.id : null, source: anchor?.usable ? "benchmark" : "manual", observedAt: anchor?.usable ? anchor.observedAt! : leg.observedAt,
      context: leg.context, protocol: leg.protocol, sport: leg.sport, metric: leg.sport === "run" ? "pace_sec_km" : leg.sport === "bike" ? "power_w" : "pace_sec_100m", value: Number(leg.baselineValue),
    };
    let distanceM = Number(leg.distanceKm) * 1000;
    let segments: ScenarioLeg["segments"] = [];
    if (leg.sport !== "swim") {
      if (leg.courseMode === "unknown") throw Error(`${leg.sport}: choose a course profile or explicitly select a flat-course assumption.`);
      const headwindMps = Number(leg.headwindMps), speedCapMps = numberOrNull(leg.speedCapMps);
      if (leg.courseMode === "gpx") {
        if (!leg.course) throw Error("Import a GPX before calculating.");
        segments = courseToScenarioSegments(leg.course, { headwindMps, speedCapMps, maxAbsGrade: leg.sport === "run" ? 0.15 : 0.45 });
      } else if (leg.courseMode === "saved") {
        segments = leg.savedSegments.map(segment => ({ ...segment }));
      } else if (leg.courseMode === "manual") {
        const parsed = parseProfile(leg.manualProfile);
        if (parsed.error || parsed.points.length < 2) throw Error(parsed.error ?? "Enter at least two profile points.");
        segments = parsed.points.slice(1).map((point, index) => {
          const previous = parsed.points[index], horizontalM = point.distanceM - previous.distanceM, grade = (point.elevationM! - previous.elevationM!) / horizontalM;
          return { distanceM: horizontalM * Math.sqrt(1 + grade * grade), grade, headwindMps, speedCapMps };
        });
      } else if (headwindMps !== 0 || speedCapMps !== null) segments = [{ distanceM, grade: 0, headwindMps, speedCapMps }];
      if (segments.length) distanceM = segments.reduce((sum, segment) => sum + segment.distanceM, 0);
      if (segments.length > 1000) throw Error("This course has more than 1,000 calculation segments. Use a reviewed simplified profile.");
    }
    const bikeFields = [leg.totalMassKg, leg.cdaM2, leg.crr, leg.airDensityKgM3, leg.drivetrainEfficiency];
    return {
      id: leg.id, sport: leg.sport, distanceM, baseline, target: numberOrNull(leg.target), targetConfirmed: leg.targetConfirmed, segments, flatCourseConfirmed: leg.courseMode === "flat",
      timeMultiplier: leg.sport === "bike" ? 1 : 1 + Number(leg.timeChangePct) / 100,
      bike: leg.sport === "bike" && bikeFields.every(value => value !== "") ? { totalMassKg: Number(leg.totalMassKg), cdaM2: Number(leg.cdaM2), crr: Number(leg.crr), airDensityKgM3: Number(leg.airDensityKgM3), drivetrainEfficiency: Number(leg.drivetrainEfficiency), grossEfficiency: numberOrNull(leg.grossEfficiency) } : null,
      hrTargetBpm: leg.hrLow !== "" && leg.hrHigh !== "" ? [Number(leg.hrLow), Number(leg.hrHigh)] : null,
      intensityEvidence: leg.hrObservedAt || leg.hrContext ? { observedAt: leg.hrObservedAt, context: leg.hrContext, source: "Manual sport-specific observation", confirmed: leg.intensityConfirmed } : null,
      runPowerTargetW: leg.sport === "run" ? numberOrNull(leg.runPowerTargetW) : null, runPowerDevice: leg.sport === "run" ? leg.runPowerDevice || null : null,
    };
  });
  return { name: draft.name, eventType: draft.eventType, startAt,
    weather: { kind: draft.weatherKind, source: draft.weatherSource, issuedAt: draft.weatherKind === "forecast" ? draft.weather?.sourceUpdatedAt ?? draft.weather?.fetchedAt ?? null : null, validFrom: draft.weatherKind === "forecast" ? draft.weather?.coverageStart ?? null : null, validTo: draft.weatherKind === "forecast" ? draft.weather?.coverageEnd ?? null : null, temperatureC: numberOrNull(draft.temperatureC), humidityPct: numberOrNull(draft.humidityPct), windMps: numberOrNull(draft.windMps) },
    legs, transitionSeconds: draft.eventType === "triathlon" ? Number(draft.transitionMinutes) * 60 : 0, practicedCarbsGph: numberOrNull(draft.practicedCarbsGph), fuelEvidence: draft.practicedCarbsGph !== "" ? { observedAt: draft.fuelObservedAt, context: draft.fuelContext, source: "Athlete-reported fueling practice", confirmed: draft.fuelTolerated } : null, sensitivityPercent: Number(draft.sensitivityPercent),
  };
}
export function buildMetadata(draft: Draft): RaceScenarioMetadata {
  const credit = draft.weather?.attribution[0];
  return { eventDate: draft.date || null, raceId: draft.raceId || null, location: draft.location || null, officialUrl: draft.officialUrl || null, timeZone: draft.timeZone || null, latitude: numberOrNull(draft.latitude), longitude: numberOrNull(draft.longitude),
    course: null,
    courses: draft.legs.filter(leg => leg.sport !== "swim" && leg.courseMode !== "unknown").map(leg => ({ legId: leg.id, source: leg.courseMode === "saved" ? leg.savedCourseSource : leg.courseMode === "gpx" ? "gpx" : leg.courseMode === "flat" ? "flat" : "manual", sourceUrl: draft.officialUrl || null, label: `${leg.sport}: ${leg.courseMode === "saved" ? "Saved course profile" : leg.courseMode === "gpx" ? "User-uploaded GPX; official status unverified" : leg.courseMode === "flat" ? "Explicit flat-course assumption" : "Manually entered profile"}`, importedAt: leg.courseImportedAt, profile: pointsFor(leg).map(point => ({distanceM: point.distanceM, elevationM: point.elevationM, segmentIndex: point.segmentIndex ?? 0})), warnings: leg.course?.warnings ?? leg.courseWarnings })),
    weatherEvidence: draft.weather ? { requestLatitude: draft.weatherRequest?.latitude, requestLongitude: draft.weatherRequest?.longitude, requestedAt: draft.weatherRequest?.at, timeZone: draft.weatherRequest?.timeZone, provider: "MET Norway", sourceUrl: credit?.sourceUrl ?? null, licenseUrl: credit?.licenseUrl ?? null, retrievedAt: draft.weather.fetchedAt, validAt: draft.weather.point?.at ?? null, kind: draft.weather.kind, attribution: draft.weather.attribution.map(item => `${item.text}. ${item.modifications}`).join(" ") } : draft.history ? { provider: "NASA POWER", sourceUrl: draft.history.attribution[0]?.sourceUrl ?? null, licenseUrl: draft.history.attribution[0]?.licenseUrl ?? null, retrievedAt: draft.history.fetchedAt, validAt: null, kind: "historical_summary", attribution: draft.history.attribution.map(item => `${item.text}. ${item.modifications}`).join(" ") } : draft.savedWeatherEvidence,
  };
}
export function draftFromSnapshot(snapshot: { input: RaceScenarioInput; metadata: RaceScenarioMetadata | null }): Draft {
  const saved = snapshot.input, metadata = snapshot.metadata, initial = freshDraft(), time = saved.startAt;
  return { ...initial, name: saved.name, raceId: metadata?.raceId ?? "", eventType: saved.eventType, date: metadata?.eventDate ?? time?.slice(0, 10) ?? "", startTime: time?.includes("T") ? time.slice(11, 16) : "", offset: time?.endsWith("Z") ? "Z" : time?.match(/[+-]\d{2}:\d{2}$/)?.[0] ?? "", timeZone: metadata?.timeZone ?? "", location: metadata?.location ?? "", officialUrl: metadata?.officialUrl ?? "", latitude: str(metadata?.latitude), longitude: str(metadata?.longitude), coordinatesReviewed: false, savedWeatherEvidence: metadata?.weatherEvidence ?? null,
    weatherKind: saved.weather.kind === "unknown" ? "unknown" : "manual", temperatureC: str(saved.weather.temperatureC), humidityPct: str(saved.weather.humidityPct), windMps: str(saved.weather.windMps), weatherSource: saved.weather.kind !== "unknown" ? `Saved scenario assumptions: ${saved.weather.source}` : saved.weather.source,
    transitionMinutes: String(saved.transitionSeconds / 60), practicedCarbsGph: str(saved.practicedCarbsGph), fuelObservedAt: saved.fuelEvidence?.observedAt?.slice(0, 10) ?? "", fuelContext: saved.fuelEvidence?.context ?? "", fuelTolerated: saved.fuelEvidence?.confirmed ?? false, sensitivityPercent: String(saved.sensitivityPercent),
    legs: saved.legs.map(leg => ({ ...freshLeg(leg.sport), id: leg.id, distanceKm: String(leg.distanceM / 1000), anchorId: leg.baseline?.sourceId ?? "manual", baselineValue: str(leg.baseline?.value), observedAt: leg.baseline?.observedAt.slice(0, 10) ?? "", protocol: leg.baseline?.protocol ?? "", context: leg.baseline?.context ?? "", target: str(leg.target), targetConfirmed: false, timeChangePct: String((leg.timeMultiplier - 1) * 100), courseMode: leg.segments.length > 0 ? "saved" : leg.flatCourseConfirmed ? "flat" : "unknown", savedSegments: leg.segments, savedProfile: metadata?.courses?.find(course => course.legId === leg.id)?.profile ?? [], savedCourseSource: metadata?.courses?.find(course => course.legId === leg.id)?.source ?? "manual", courseImportedAt: metadata?.courses?.find(course => course.legId === leg.id)?.importedAt ?? null, courseWarnings: metadata?.courses?.find(course => course.legId === leg.id)?.warnings ?? [], headwindMps: str(leg.segments[0]?.headwindMps ?? 0), speedCapMps: str(leg.segments[0]?.speedCapMps), totalMassKg: str(leg.bike?.totalMassKg), cdaM2: str(leg.bike?.cdaM2), crr: str(leg.bike?.crr), airDensityKgM3: str(leg.bike?.airDensityKgM3), drivetrainEfficiency: str(leg.bike?.drivetrainEfficiency), grossEfficiency: str(leg.bike?.grossEfficiency), hrLow: str(leg.hrTargetBpm?.[0]), hrHigh: str(leg.hrTargetBpm?.[1]), hrObservedAt: leg.intensityEvidence?.observedAt.slice(0, 10) ?? "", hrContext: leg.intensityEvidence?.context ?? "", intensityConfirmed: false, runPowerTargetW: str(leg.runPowerTargetW), runPowerDevice: leg.runPowerDevice ?? "" })),
  };
}
