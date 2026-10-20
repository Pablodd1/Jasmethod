import { FIT_STEP_LIMIT } from "./canonical-session";

/**
 * Chat-driven interval edits, as a pure layer over the EXISTING explicit-step workout record.
 *
 * What this module does NOT do: it never writes. Applying an edit goes through the already-shipped,
 * revision-bound `/api/workout/card` PATCH (athlete-scoped, serializable transaction, approval cleared,
 * AuditLog before/after), so there is still exactly one canonical workout record and one writer. This module
 * only (1) parses a sentence into a typed patch, (2) turns the patch into a new explicit-step list plus a
 * human-readable before/after preview, and (3) refuses edits that would exceed a limit.
 *
 * Direction rule (safety): changes that reduce load apply as soon as the athlete confirms the preview; changes
 * that RAISE load (higher zone, > +20% hard time) are flagged `requiresConfirmation` and the UI must send an
 * explicit second confirmation. A chat edit can never raise the work zone above the check-in's intensity cap,
 * never above Z5 unless the session already contains that zone, never past the reviewed time budget and never
 * past the 50-step device limit. Safety holds are enforced by the PATCH route (non-"ready" sessions are
 * read-only there), not weakened here.
 *
 * Parser: deterministic EN/ES patterns, no model. Anything it cannot map to a concrete number is returned as a
 * clarification question; it never guesses "make it easier" into a number.
 */

export type EditLang = "en" | "es";
export interface EditableStep {
  name: string; phase: "warmup" | "active" | "recovery" | "cooldown"; zone: string; seconds: number;
  endpoint?: { type: "time"; seconds: number } | { type: string; [key: string]: unknown };
  group?: string; note?: string; target?: { type: string; low?: number; high?: number };
  [key: string]: unknown;
}
export interface IntervalPatch { repeats?: number; repeatsDelta?: number; workSeconds?: number; restSeconds?: number; workZone?: number }

export const LIMITS = { minRepeats: 1, maxRepeats: 30, minWorkSeconds: 10, maxWorkSeconds: 3600, minRestSeconds: 5, maxRestSeconds: 1800, maxChatZone: 5, hardTimeIncreasePct: 20 } as const;

// ───────────────────────────── parsing ─────────────────────────────
const fold = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const WORDS: Record<string, number> = { one: 1, a: 1, an: 1, un: 1, uno: 1, una: 1, two: 2, dos: 2, three: 3, tres: 3, four: 4, cuatro: 4, five: 5, cinco: 5 };
const DUR = String.raw`(\d{1,2}:\d{2}|\d+(?:[.,]\d+)?\s*(?:minutes?|minutos?|mins?|min|'|seconds?|segundos?|secs?|seg|s)(?![a-z]))`;

/** "4 min", "90 s", "1:30", "4,5 minutos" → seconds; null when it is not a duration. */
export function durationSeconds(raw: string): number | null {
  const text = fold(raw);
  const clock = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (clock) { const s = +clock[1] * 60 + +clock[2]; return +clock[2] < 60 ? s : null; }
  const m = /^(\d+(?:[.,]\d+)?)\s*(minutes?|minutos?|mins?|min|'|seconds?|segundos?|secs?|seg|s)$/.exec(text);
  if (!m) return null;
  const value = Number(m[1].replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return Math.round(/^(m|')/.test(m[2]) ? value * 60 : value);
}

export type ParseResult =
  | { ok: true; patch: IntervalPatch }
  | { ok: false; code: "empty" | "too_vague" | "distance_not_supported" | "conflicting" | "unrecognized"; en: string; es: string };

const REST_WORD = String.raw`(?:rest|recovery|recover|easy|descanso|recuperacion|recuperar|pausa)`;
const WORK_WORD = String.raw`(?:intervals?|work|hard|efforts?|repeats?|reps?|intervalos?|esfuerzos?|repeticiones?)`;

export function parseIntervalRequest(input: string): ParseResult {
  const text = fold(String(input ?? "")).slice(0, 400);
  if (!text) return { ok: false, code: "empty", en: "Tell me what to change, for example “make it 5 × 4 min with 2 min rest”.", es: "Dime qué cambiar, por ejemplo “hazlo 5 × 4 min con 2 min de descanso”." };
  if (/\b\d+(?:[.,]\d+)?\s*(?:km|kilometers?|kilometros?|metres?|meters?|metros?|mi|miles?)\b|\b\d{3,4}\s*m\b/.test(text))
    return { ok: false, code: "distance_not_supported", en: "Distance-based intervals can't be edited from chat yet. Give the work and rest as times, e.g. “4 min work, 2 min rest”.", es: "Todavía no puedo editar intervalos por distancia desde el chat. Indica trabajo y descanso en tiempo, p. ej. “4 min de trabajo, 2 min de descanso”." };

  const patch: IntervalPatch = {};
  const seen: Record<string, Set<number>> = { repeats: new Set(), work: new Set(), rest: new Set(), zone: new Set(), delta: new Set() };
  const rest = (s: number | null) => { if (s !== null) seen.rest.add(s); };
  const work = (s: number | null) => { if (s !== null) seen.work.add(s); };
  let consumed = text;
  const take = (source: RegExp, fn: (m: RegExpExecArray) => void) => { const re = new RegExp(source.source, source.flags.includes("g") ? source.flags : `${source.flags}g`); consumed = consumed.replace(re, (...args) => { const m = args.slice(0, -2) as unknown as RegExpExecArray; fn(m); return " "; }); };

  // "5 x 4 min" (optionally "… rest/descanso 2 min")
  take(new RegExp(String.raw`\b(\d{1,2})\s*[x×]\s*${DUR}(?:\s*(?:,|with|con|and|y)?\s*(?:${REST_WORD})(?:\s+(?:of|de|for|=|:))?\s*${DUR})?`), m => {
    seen.repeats.add(+m[1]); work(durationSeconds(m[2])); if (m[3]) rest(durationSeconds(m[3]));
  });
  // "with 2 min rest", "2 min de descanso"
  take(new RegExp(String.raw`(?:with|con)?\s*${DUR}\s*(?:of|de)?\s*(?:${REST_WORD})\b`), m => rest(durationSeconds(m[1])));
  take(new RegExp(String.raw`\b${REST_WORD}\s*(?:of|to|at|de|a|for|=|:)?\s*${DUR}`), m => rest(durationSeconds(m[1])));
  // "intervals of 4 min", "make the intervals 4 minutes", "4 min intervals"
  take(new RegExp(String.raw`\b${WORK_WORD}\s*(?:of|to|at|de|a|=|:)?\s*${DUR}`), m => work(durationSeconds(m[1])));
  take(new RegExp(String.raw`\b${DUR}\s*${WORK_WORD}\b`), m => work(durationSeconds(m[1])));
  // delta: "add one more interval", "remove 2 intervals", "one less rep"
  take(/\b(?:add|extra|agrega|agregar|anade|anadir|suma|sumar)\s+(\d+|one|an?|un|uno|una|two|dos|three|tres|four|cuatro|five|cinco)?\s*(?:more|extra|mas)?\s*(?:intervals?|repeats?|reps?|intervalos?|repeticiones?)\b/, m => { seen.delta.add(+(m[1] ? (WORDS[m[1]] ?? m[1]) : 1)); });
  take(/\b(?:remove|drop|delete|quita|quitar|elimina|eliminar|saca|sacar|menos)\s+(\d+|one|an?|un|uno|una|two|dos|three|tres|four|cuatro|five|cinco)?\s*(?:intervals?|repeats?|reps?|intervalos?|repeticiones?)\b/, m => { seen.delta.add(-(+(m[1] ? (WORDS[m[1]] ?? m[1]) : 1))); });
  take(/\b(\d+|one|two|three|un|uno|una|dos|tres)\s+(?:fewer|less|menos)\s+(?:intervals?|repeats?|reps?|intervalos?|repeticiones?)\b/, m => { seen.delta.add(-(+(WORDS[m[1]] ?? m[1]))); });
  take(/\b(\d+|one|two|three|un|uno|una|dos|tres)\s+(?:more|extra|mas)\s+(?:intervals?|repeats?|reps?|intervalos?|repeticiones?)\b/, m => { seen.delta.add(+(WORDS[m[1]] ?? m[1])); });
  take(/\b(\d+|un|uno|una|dos|tres)\s+(?:intervalos?|repeticiones?)\s+menos\b/, m => { seen.delta.add(-(+(WORDS[m[1]] ?? m[1]))); });
  take(/\b(\d+|un|uno|una|dos|tres)\s+(?:intervalos?|repeticiones?)\s+mas\b/, m => { seen.delta.add(+(WORDS[m[1]] ?? m[1])); });
  // absolute count: "5 intervals", "hazlo con 5 repeticiones"
  take(/\b(\d{1,2})\s*(?:intervals?|repeats?|repetitions?|reps?|intervalos?|repeticiones?|series)\b/, m => seen.repeats.add(+m[1]));
  // zone for the work steps: "zone 3", "z3", "zona 3" (not when it labels the rest)
  take(new RegExp(String.raw`(?<!${REST_WORD}\s{0,12})\b(?:zone|zona|z)\s*([1-7])\b`), m => seen.zone.add(+m[1]));

  if (seen.repeats.size > 1 || seen.work.size > 1 || seen.rest.size > 1 || seen.zone.size > 1 || seen.delta.size > 1 || (seen.repeats.size && seen.delta.size))
    return { ok: false, code: "conflicting", en: "That asks for two different values for the same thing. Say it once, e.g. “5 × 4 min, 2 min rest”.", es: "Eso pide dos valores distintos para lo mismo. Dilo una sola vez, p. ej. “5 × 4 min, 2 min de descanso”." };
  if (seen.repeats.size) patch.repeats = [...seen.repeats][0];
  if (seen.delta.size) patch.repeatsDelta = [...seen.delta][0];
  if (seen.work.size) patch.workSeconds = [...seen.work][0];
  if (seen.rest.size) patch.restSeconds = [...seen.rest][0];
  if (seen.zone.size) patch.workZone = [...seen.zone][0];
  if (Object.keys(patch).length) return { ok: true, patch };

  if (/\b(easier|harder|lighter|softer|tougher|more intense|less intense|mas facil|mas suave|mas duro|mas dificil|mas intenso|menos intenso|facil|dificil)\b/.test(text))
    return { ok: false, code: "too_vague", en: "I won't guess a number for that. Pick one: fewer intervals (“one less interval”), shorter work (“intervals of 3 min”), longer rest (“rest 2 min”) or a lower zone (“zone 3”).", es: "No voy a adivinar un número para eso. Elige: menos intervalos (“un intervalo menos”), trabajo más corto (“intervalos de 3 min”), más descanso (“descanso 2 min”) o una zona menor (“zona 3”)." };
  return { ok: false, code: "unrecognized", en: "I couldn't find a repeat count, work time, rest time or zone in that. Example: “make it 5 × 4 min with 2 min rest”.", es: "No encontré número de repeticiones, tiempo de trabajo, descanso ni zona. Ejemplo: “hazlo 5 × 4 min con 2 min de descanso”." };
}

// ───────────────────────────── applying ─────────────────────────────
export interface EditLimits {
  /** Reviewed time budget in seconds (the PATCH route rejects anything longer). */
  budgetSeconds: number;
  /** Check-in intensity cap as a zone number 1..7; null/undefined = unknown. */
  intensityCapZone?: number | null;
}
export interface SetSummary { repeats: number; workSeconds: number | null; restSeconds: number | null; workZone: number | null; hardSeconds: number; totalSeconds: number }
export type EditRefusal =
  | "no_interval_set" | "ambiguous_set" | "non_uniform_set" | "no_rest_to_copy" | "repeats_out_of_range" | "work_out_of_range" | "rest_out_of_range"
  | "zone_above_cap" | "zone_above_chat_limit" | "exceeds_time_budget" | "exceeds_step_limit" | "no_change" | "unsupported_step";
export type ApplyResult =
  | { ok: true; steps: EditableStep[]; setLabel: string | null; before: SetSummary; after: SetSummary; changes: { en: string[]; es: string[] }; requiresConfirmation: boolean; confirmationReasons: { en: string[]; es: string[] } }
  | { ok: false; code: EditRefusal; en: string; es: string; maxRepeatsThatFit?: number };

const zoneNum = (zone: string) => Number(zone.slice(1));
const fmt = (s: number, lang: EditLang) => s < 60 ? `${s} s` : `${Math.floor(s / 60)}${lang === "es" ? " min" : " min"}${s % 60 ? ` ${s % 60} s` : ""}`;
const total = (steps: readonly EditableStep[]) => steps.reduce((sum, s) => sum + s.seconds, 0);
const isMain = (s: EditableStep) => s.phase === "active" || s.phase === "recovery";

function refuse(code: EditRefusal, en: string, es: string, extra: Partial<Extract<ApplyResult, { ok: false }>> = {}): ApplyResult { return { ok: false, code, en, es, ...extra }; }

interface Located { head: EditableStep[]; main: EditableStep[]; tail: EditableStep[]; label: string | null }
/**
 * Real sessions often contain several sets (strides, then the main set). A set is a run of consecutive work/rest steps
 * with the same `group` label; the one edited is the set with the most work time. A tie is ambiguous and refused.
 */
function locateMainSet(steps: readonly EditableStep[]): Located | "ambiguous" | null {
  const segments: { start: number; end: number; activeSeconds: number }[] = [];
  for (let i = 0; i < steps.length; ) {
    if (!isMain(steps[i])) { i++; continue; }
    let j = i;
    while (j + 1 < steps.length && isMain(steps[j + 1]) && steps[j + 1].group === steps[i].group) j++;
    const activeSeconds = steps.slice(i, j + 1).filter(s => s.phase === "active").reduce((sum, s) => sum + s.seconds, 0);
    if (activeSeconds > 0) segments.push({ start: i, end: j, activeSeconds });
    i = j + 1;
  }
  if (!segments.length) return null;
  const top = Math.max(...segments.map(s => s.activeSeconds));
  const best = segments.filter(s => s.activeSeconds === top);
  if (best.length > 1) return "ambiguous";
  const { start, end } = best[0];
  return { head: steps.slice(0, start), main: steps.slice(start, end + 1), tail: steps.slice(end + 1), label: steps[start].group ?? null };
}

export function summarizeSet(steps: readonly EditableStep[]): SetSummary | null {
  const located = locateMainSet(steps);
  if (!located || located === "ambiguous") return null;
  const work = located.main.filter(s => s.phase === "active"), rest = located.main.filter(s => s.phase === "recovery");
  if (!work.length) return null;
  const uniform = (rows: EditableStep[]) => rows.every(r => r.seconds === rows[0].seconds && r.zone === rows[0].zone);
  return {
    repeats: work.length, workSeconds: uniform(work) ? work[0].seconds : null, restSeconds: rest.length && uniform(rest) ? rest[0].seconds : null,
    workZone: uniform(work) ? zoneNum(work[0].zone) : null,
    // Hard time is measured over the whole workout (every active Z4+ step), because that is the load the athlete feels.
    hardSeconds: steps.filter(s => s.phase === "active" && zoneNum(s.zone) >= 4).reduce((sum, s) => sum + s.seconds, 0), totalSeconds: total(steps),
  };
}

const exactTime = (s: EditableStep) => !s.endpoint || (s.endpoint as { type?: string }).type === "time";

export function applyIntervalPatch(stepsIn: readonly EditableStep[], patch: IntervalPatch, limits: EditLimits): ApplyResult {
  if (stepsIn.some(s => !exactTime(s) || s.reps != null)) return refuse("unsupported_step", "This workout has distance, rep or lap steps; chat can only edit exact timed intervals.", "Este entrenamiento tiene pasos por distancia, repeticiones o vuelta; el chat solo edita intervalos con tiempo exacto.");
  const located = locateMainSet(stepsIn);
  if (located === "ambiguous") return refuse("ambiguous_set", "This workout has more than one interval set of equal size, so I can't tell which one you mean. Edit the set directly in the step editor.", "Este entrenamiento tiene más de una serie de intervalos del mismo tamaño y no sé a cuál te refieres. Edita la serie directamente en el editor de pasos.");
  const before = summarizeSet(stepsIn);
  if (!located || !before) return refuse("no_interval_set", "I couldn't find an interval set in this workout.", "No encontré una serie de intervalos en este entrenamiento.");
  if (located.main[0].phase !== "active") return refuse("non_uniform_set", "The set starts with a rest step, so a single instruction would be ambiguous. Edit it in the step editor.", "La serie empieza con un descanso, así que una sola instrucción sería ambigua. Edítala en el editor de pasos.");
  const work = located.main.filter(s => s.phase === "active"), rest = located.main.filter(s => s.phase === "recovery");
  if (before.workSeconds === null || (rest.length && before.restSeconds === null))
    return refuse("non_uniform_set", "The intervals in this workout are not all the same length or zone, so a single instruction would be ambiguous. Edit them one at a time in the step editor.", "Los intervalos de este entrenamiento no son iguales en duración o zona; una sola instrucción sería ambigua. Edítalos uno a uno en el editor de pasos.");

  const repeats = patch.repeats ?? before.repeats + (patch.repeatsDelta ?? 0);
  const workSeconds = patch.workSeconds ?? before.workSeconds;
  const workZone = patch.workZone ?? before.workZone!;
  let restSeconds = patch.restSeconds ?? before.restSeconds;
  if (!Number.isInteger(repeats) || repeats < LIMITS.minRepeats || repeats > LIMITS.maxRepeats) return refuse("repeats_out_of_range", `Repeats must be between ${LIMITS.minRepeats} and ${LIMITS.maxRepeats}.`, `Las repeticiones deben estar entre ${LIMITS.minRepeats} y ${LIMITS.maxRepeats}.`);
  if (workSeconds < LIMITS.minWorkSeconds || workSeconds > LIMITS.maxWorkSeconds) return refuse("work_out_of_range", `Work intervals must be ${LIMITS.minWorkSeconds} s to ${LIMITS.maxWorkSeconds / 60} min.`, `Los intervalos de trabajo deben durar de ${LIMITS.minWorkSeconds} s a ${LIMITS.maxWorkSeconds / 60} min.`);
  if (repeats > 1 && restSeconds === null) return refuse("no_rest_to_copy", "This set has no rest step to copy. Include the rest, e.g. “5 × 4 min with 2 min rest”.", "Esta serie no tiene un paso de descanso que copiar. Incluye el descanso, p. ej. “5 × 4 min con 2 min de descanso”.");
  if (repeats > 1 && restSeconds !== null && (restSeconds < LIMITS.minRestSeconds || restSeconds > LIMITS.maxRestSeconds)) return refuse("rest_out_of_range", `Rest must be ${LIMITS.minRestSeconds} s to ${LIMITS.maxRestSeconds / 60} min.`, `El descanso debe durar de ${LIMITS.minRestSeconds} s a ${LIMITS.maxRestSeconds / 60} min.`);

  // Zone direction rules. Lowering is always allowed.
  const existingMax = Math.max(...work.map(s => zoneNum(s.zone)));
  if (patch.workZone !== undefined && workZone > existingMax) {
    const cap = limits.intensityCapZone ?? null;
    if (cap === null || cap === undefined) return refuse("zone_above_cap", `I can't raise the work zone above Z${existingMax} because today's intensity limit is unknown. Complete the check-in first.`, `No puedo subir la zona de trabajo por encima de Z${existingMax} porque el límite de intensidad de hoy es desconocido. Completa primero el check-in.`);
    if (workZone > cap) return refuse("zone_above_cap", `Z${workZone} is above today's intensity limit (Z${cap}).`, `Z${workZone} supera el límite de intensidad de hoy (Z${cap}).`);
    if (workZone > LIMITS.maxChatZone) return refuse("zone_above_chat_limit", `Chat edits can't raise work above Z${LIMITS.maxChatZone}. Use the step editor and review it.`, `El chat no puede subir el trabajo por encima de Z${LIMITS.maxChatZone}. Usa el editor de pasos y revísalo.`);
  }

  // Rebuild the main set from the first work step / first rest step as templates.
  const workTpl = work[0], restTpl = rest[0] ?? { name: "Easy recovery", phase: "recovery" as const, zone: "z1", seconds: restSeconds ?? 0 };
  const slashStyle = /\s\d+\/\d+$/.test(workTpl.name);
  const baseName = (workTpl.name.match(/^(.*?)\s+\d+(?:\/\d+)?$/)?.[1] ?? workTpl.name).trim();
  const numbered = repeats > 1 || /\s\d+(?:\/\d+)?$/.test(workTpl.name);
  const numberLabel = (i: number) => (slashStyle ? `${i + 1}/${repeats}` : `${i + 1}`);
  const workLabel = (s: number) => fmt(s, "en");
  const regroup = (group: string | undefined) => group && /^Repeat \d+ × /.test(group) ? group.replace(/^Repeat \d+ × .*?(?= — |$)/, `Repeat ${repeats} × ${workLabel(workSeconds)}`) : group;
  const endsWithRest = located.main[located.main.length - 1].phase === "recovery";
  const zoneChanged = patch.workZone !== undefined && patch.workZone !== before.workZone;
  const main: EditableStep[] = [];
  for (let i = 0; i < repeats; i++) {
    const step: EditableStep = { ...workTpl, name: numbered ? `${baseName} ${numberLabel(i)}` : baseName, seconds: workSeconds, zone: `z${workZone}`, endpoint: { type: "time", seconds: workSeconds }, group: regroup(workTpl.group) };
    if (zoneChanged) delete step.target; // an explicit target no longer matches the new zone
    if (step.group === undefined) delete step.group;
    main.push(step);
    if ((i < repeats - 1 || endsWithRest) && restSeconds !== null) {
      const r: EditableStep = { ...restTpl, seconds: restSeconds, endpoint: { type: "time", seconds: restSeconds }, group: regroup(restTpl.group) };
      if (r.group === undefined) delete r.group;
      main.push(r);
    }
  }
  const steps = [...located.head, ...main, ...located.tail];
  const after = summarizeSet(steps)!;

  if (steps.length > FIT_STEP_LIMIT) return refuse("exceeds_step_limit", `That would make ${steps.length} steps; the device limit is ${FIT_STEP_LIMIT}.`, `Eso daría ${steps.length} pasos; el límite del dispositivo es ${FIT_STEP_LIMIT}.`);
  const sameAsBefore = repeats === before.repeats && workSeconds === before.workSeconds && workZone === before.workZone && (repeats === 1 || restSeconds === before.restSeconds);
  if (sameAsBefore) return refuse("no_change", "That is already how the workout is set up.", "El entrenamiento ya está así.");
  if (after.totalSeconds > limits.budgetSeconds + 1e-6) {
    const rest = restSeconds ?? 0, unit = workSeconds + rest;
    const mainSeconds = main.reduce((sum, st) => sum + st.seconds, 0);
    const fixed = after.totalSeconds - mainSeconds;
    // main(r) = r × (work + rest) − rest + (trailing rest ? rest : 0)
    const fit = unit > 0 ? Math.floor((limits.budgetSeconds - fixed + rest - (endsWithRest ? rest : 0)) / unit) : 0;
    const maxRepeatsThatFit = fit >= 1 ? fit : undefined;
    return refuse("exceeds_time_budget", `That makes the workout ${Math.round(after.totalSeconds / 60)} min, over the ${Math.round(limits.budgetSeconds / 60)} min budget.${maxRepeatsThatFit ? ` ${maxRepeatsThatFit} repeats would fit.` : ""}`, `Eso deja el entrenamiento en ${Math.round(after.totalSeconds / 60)} min, por encima del presupuesto de ${Math.round(limits.budgetSeconds / 60)} min.${maxRepeatsThatFit ? ` Cabrían ${maxRepeatsThatFit} repeticiones.` : ""}`, { maxRepeatsThatFit });
  }

  const changes = { en: [] as string[], es: [] as string[] };
  const note = (en: string, es: string) => { changes.en.push(en); changes.es.push(es); };
  if (located.label) note(`Set: ${located.label.replace(/ — .*$/, "")}`, `Serie: ${located.label.replace(/ — .*$/, "")}`);
  if (repeats !== before.repeats) note(`Repeats ${before.repeats} → ${repeats}`, `Repeticiones ${before.repeats} → ${repeats}`);
  if (workSeconds !== before.workSeconds) note(`Work ${fmt(before.workSeconds, "en")} → ${fmt(workSeconds, "en")}`, `Trabajo ${fmt(before.workSeconds, "es")} → ${fmt(workSeconds, "es")}`);
  if (restSeconds !== before.restSeconds && repeats > 1) note(`Rest ${before.restSeconds === null ? "—" : fmt(before.restSeconds, "en")} → ${fmt(restSeconds!, "en")}`, `Descanso ${before.restSeconds === null ? "—" : fmt(before.restSeconds, "es")} → ${fmt(restSeconds!, "es")}`);
  if (workZone !== before.workZone) note(`Work zone Z${before.workZone} → Z${workZone}`, `Zona de trabajo Z${before.workZone} → Z${workZone}`);
  note(`Total ${Math.round(before.totalSeconds / 60)} → ${Math.round(after.totalSeconds / 60)} min`, `Total ${Math.round(before.totalSeconds / 60)} → ${Math.round(after.totalSeconds / 60)} min`);

  const confirm = { en: [] as string[], es: [] as string[] };
  if (workZone > existingMax) { confirm.en.push(`Raises the work zone to Z${workZone}.`); confirm.es.push(`Sube la zona de trabajo a Z${workZone}.`); }
  const increase = after.hardSeconds > before.hardSeconds;
  if (increase) { confirm.en.push(`Hard time (Z4+) rises from ${Math.round(before.hardSeconds / 60)} to ${Math.round(after.hardSeconds / 60)} min.`); confirm.es.push(`El tiempo duro (Z4+) sube de ${Math.round(before.hardSeconds / 60)} a ${Math.round(after.hardSeconds / 60)} min.`); }
  if (restSeconds !== null && before.restSeconds !== null && restSeconds < before.restSeconds) {
    confirm.en.push("Less recovery between efforts increases session density.");
    confirm.es.push("Menos descanso entre esfuerzos aumenta la densidad de la sesión.");
  }
  if (after.totalSeconds > before.totalSeconds && !increase && restSeconds === before.restSeconds) {
    confirm.en.push("The session duration increases."); confirm.es.push("La duración de la sesión aumenta.");
  }
  return { ok: true, steps, setLabel: located.label, before, after, changes, requiresConfirmation: confirm.en.length > 0, confirmationReasons: confirm };
}

// ───────────────────────────── adapters used by the route ─────────────────────────────

/** Today's check-in intensity cap ("z1".."z7") as a zone number from the saved adaptation JSON; null when missing or invalid. */
export function readIntensityCapZone(adaptation: unknown): number | null {
  let value: any = adaptation;
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { return null; } }
  const cap = value && typeof value === "object" ? value.intensityCap : null;
  return typeof cap === "string" && /^z[1-7]$/.test(cap) ? Number(cap.slice(1)) : null;
}

interface CanonicalLike { name: string; phase: EditableStep["phase"]; zone: string; seconds: number; endpoint: { type: string; [key: string]: unknown }; group?: string; note?: string; reps?: number; target: { type: string; low?: number; high?: number; source?: string } }
/**
 * Canonical (resolved) steps → the editable shape the card PATCH accepts. A target derived from the athlete's
 * FTP/LTHR (`source: "profile_reference"`) is NOT passed back: it would freeze today's derived number into the
 * saved prescription as if the athlete had typed it. Only a target the plan author set explicitly is kept.
 */
export function toEditableSteps(steps: readonly CanonicalLike[]): EditableStep[] {
  return steps.map(s => {
    const out: EditableStep = { name: s.name, phase: s.phase, zone: s.zone, seconds: s.seconds, endpoint: s.endpoint as EditableStep["endpoint"] };
    if (s.group) out.group = s.group;
    if (s.note) out.note = s.note;
    if (s.reps != null) out.reps = s.reps;
    if (s.target.source === "explicit" && s.target.type !== "open" && s.target.low !== undefined && s.target.high !== undefined) out.target = { type: s.target.type, low: s.target.low, high: s.target.high };
    return out;
  });
}
