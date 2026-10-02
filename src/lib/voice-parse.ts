// Candidate extraction only. Never apply a transcript without editable review.
export const VOICE_LANGUAGES = ["en", "es"] as const;
export const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
export interface VoiceCheckinAnswers {
  sleep?: number; soreness?: number; energy?: number; motivation?: number; stress?: number;
  weightKg?: number; rhr?: number; hrv?: number; sleepHours?: number; availableMinutes?: number;
  sick?: boolean; menstrual?: boolean; newPain?: boolean; urgentSymptoms?: boolean;
  warnings: string[]; conflicts: string[]; supportedLanguage: boolean;
}
const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100,
};
function normalizeNumbers(text: string): string {
  const words = Object.keys(WORDS).join("|");
  return text.replace(new RegExp(`\\b(?:${words})(?:(?:[ -]+(?:and|y)[ -]+|[ -]+)(?:${words}|hundred)|[ -]+(?:point|punto|coma)[ -]+(?:${words}))*\\b`, "g"), (phrase) => {
    const parts = phrase.split(/\s+(?:point|punto|coma)\s+/);
    const values = parts[0].split(/[ -]+/).filter((w) => w !== "and" && w !== "y");
    // Adjacent unit words are ambiguous ("four five"); leave unparsed.
    if (values.length > 1 && values.every((w) => (WORDS[w] ?? 100) < 10)) return phrase;
    const integer = values.reduce((sum, w) => w === "hundred" ? Math.max(1, sum) * 100 : sum + (WORDS[w] ?? 0), 0);
    const fraction = parts[1]?.split(/[ -]+/).map((w) => WORDS[w]).join("");
    return `${integer}${fraction ? `.${fraction}` : ""}`;
  }).replace(/(\d)\s*(?:point|punto|coma)\s*(\d)/g, "$1.$2");
}
export function parseCheckinTranscript(text: string, language = "en"): VoiceCheckinAnswers {
  const out: VoiceCheckinAnswers = { warnings: [], conflicts: [], supportedLanguage: (VOICE_LANGUAGES as readonly string[]).includes(language) };
  if (!out.supportedLanguage) {
    out.warnings.push("Voice extraction supports English and Spanish only. Use the structured text fields.");
    return out;
  }
  const t = normalizeNumbers(text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/(\d),(\d)/g, "$1.$2"));
  const connector = "\\s*(?:(?:was|is|am|es|fue|esta|de|son|tengo|de anoche)\\s+)*";
  const extract = (key: keyof VoiceCheckinAnswers, pattern: string, min: number, max: number, integer = false) => {
    const matches = [...t.matchAll(new RegExp(`(?:${pattern})${connector}(\\d+(?:\\.\\d+)?)\\b`, "g"))];
    const values = [...new Set(matches.map((m) => Number(m[1])))];
    if (values.length > 1) { out.conflicts.push(String(key)); out.warnings.push(`Conflicting ${key} answers. Enter the correct value manually.`); return; }
    if (!values.length) return;
    const value = values[0];
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) { out.warnings.push(`Unclear or out-of-range ${key}; enter it manually.`); return; }
    (out as unknown as Record<string, unknown>)[key] = value;
  };
  extract("sleep", "\\b(?:sleep(?: quality)?|calidad (?:del )?sueno|sueno)", 1, 5, true);
  extract("soreness", "\\b(?:soreness|muscle soreness|agujetas|dolor muscular)", 1, 5, true);
  extract("energy", "\\b(?:energy|energia)", 1, 5, true);
  extract("motivation", "\\b(?:motivation|motivacion)", 1, 5, true);
  extract("stress", "\\b(?:stress|estres)", 1, 5, true);
  extract("rhr", "\\b(?:resting (?:hr|heart rate)|rhr|pulso en reposo|frecuencia cardiaca en reposo)", 20, 150);
  extract("hrv", "\\b(?:hrv|vfc)", 1, 300);
  extract("sleepHours", "\\b(?:sleep (?:hours?|hrs?)|horas de sueno)", 0, 24);
  const hours = /\b(?:slept|dormi)\s+(\d+(?:\.\d+)?)\s*(?:hours?|horas?)\b/.exec(t);
  if (hours && Number(hours[1]) <= 24) out.sleepHours = Number(hours[1]);
  extract("availableMinutes", "\\b(?:available minutes|minutos disponibles|tiempo disponible)", 0, 1440);
  const weight = /\b(?:weight|weigh|peso)\s*(?:(?:is|was|es|fue|de)\s+)?(\d+(?:\.\d+)?)\s*(kg|kilograms?|kilos?|pounds?|lbs?|libras?)\b/.exec(t);
  if (weight && /^(kg|kilo)/.test(weight[2]) && Number(weight[1]) >= 20 && Number(weight[1]) <= 350) out.weightKg = Number(weight[1]);
  else if (/\b(?:weight|weigh|peso)\b/.test(t)) out.warnings.push("Confirm weight and units manually in kilograms; no unit conversion was assumed.");
  const seen: Partial<Record<"sick" | "newPain" | "urgentSymptoms" | "menstrual", boolean[]>> = {};
  const mentions = /\b(chest (?:pain|discomfort)|dolor (?:en el |de )pecho|faint(?:ing|ed)?|desmayo|severe (?:unexplained )?(?:breathlessness|shortness of breath)|falta de aire (?:grave|severa)|confusion|collapse|colapso|urgent symptoms|emergency symptoms|sintomas de alarma|sick|ill|fever|flu|cough|enferm[oa]|fiebre|gripe|tos|pain|injured|injury|dolor|lesion|period|menstrual|menstruating|menstruacion)\b/g;
  let previousEnd = 0;
  for (const m of t.matchAll(mentions)) {
    const term = m[0];
    const start = m.index!;
    const prefix = t.slice(Math.max(previousEnd, start - 45), start).split(/[,.;!?]|\b(?:but|pero|however|aunque)\b/).pop() || "";
    const negative = /(?:\b(?:not|no|without|sin|niego)|\b(?:don'?t|do not) have|\bno tengo)\s+(?:(?:any|ningun[oa]?|feeling|feel|me siento|estoy)\s+)*$/.test(prefix);
    const key = /chest|pecho|faint|desmayo|breathlessness|shortness|falta de aire|confusion|collapse|colapso|urgent|emergency|alarma/.test(term) ? "urgentSymptoms" : /pain|injur|dolor|lesion/.test(term) ? "newPain" : /period|menstrual|menstruat/.test(term) ? "menstrual" : "sick";
    (seen[key] ||= []).push(!negative);
    previousEnd = start + term.length;
  }
  if (/\b(?:don'?t|do not|not)\s+feel\s+well\b|\bno me siento bien\b/.test(t)) (seen.sick ||= []).push(true);
  for (const key of ["sick", "newPain", "urgentSymptoms", "menstrual"] as const) {
    const values = seen[key];
    if (!values?.length) continue;
    out[key] = values.includes(true); // any positive mention remains visible pending review
    if (values.includes(true) && values.includes(false)) { out.conflicts.push(key); out.warnings.push(`Contradictory ${key} statements. Confirm current symptoms explicitly.`); }
  }
  if (/\b(?:yesterday|tomorrow|ayer|manana|last week|semana pasada)\b/.test(t)) out.warnings.push("A date was mentioned. This form is for today; confirm current symptoms and record each earlier session separately.");
  return out;
}
