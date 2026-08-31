// Voice check-in parser — turns a free-form transcript into structured answers.
// Pure function, no browser APIs, so it's unit-testable.
// Numbers spoken as words (one..five) map to the 1-5 scales; weight supports
// "point" decimals ("74 point 2" → 74.2).

export const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

export interface VoiceCheckinAnswers {
  sleep?: number;
  soreness?: number;
  energy?: number;
  motivation?: number;
  stress?: number;
  weightKg?: number;
  rhr?: number;
  hrv?: number;
  sleepHours?: number;
  sick: boolean;
  menstrual: boolean;
}

function num(m?: string): number | undefined {
  if (!m) return undefined;
  const n = parseInt(m, 10);
  if (!isNaN(n) && n >= 1 && n <= 5) return n;
  return WORD_NUM[m.toLowerCase()];
}

export function parseCheckinTranscript(text: string): VoiceCheckinAnswers {
  const t = " " + text.toLowerCase().replace(/\s*point\s*/g, ".").replace(/\b(kilos|kgs?|kilograms?)\b/g, " ") + " ";
  const out: VoiceCheckinAnswers = { sick: false, menstrual: false };
  const scale = (pattern: RegExp): number | undefined => {
    const m = pattern.exec(t);
    return m ? num(m[1]) : undefined;
  };
  out.sleep = scale(/\b(?:sleep|slept)\w*\s*(?:was|is)?\s*([1-5]|one|two|three|four|five)\b/);
  out.soreness = scale(/\b(?:sore\w*|ache\w*|soreness)\s*(?:was|is)?\s*([1-5]|one|two|three|four|five)\b/);
  out.energy = scale(/\b(?:energy|energiz\w*)\s*(?:was|is)?\s*([1-5]|one|two|three|four|five)\b/);
  out.motivation = scale(/\b(?:motivat\w*)\s*(?:was|is)?\s*([1-5]|one|two|three|four|five)\b/);
  out.stress = scale(/\b(?:stress\w*)\s*(?:was|is)?\s*([1-5]|one|two|three|four|five)\b/);

  const w = /\b(?:weight|weigh)\w*\s*(?:was|is|am)?\s*(\d{2,3}(?:\.\d)?)/.exec(t);
  if (w) out.weightKg = parseFloat(w[1]);
  const hr = /\b(?:resting\s*(?:hr|heart\s*rate)|rhr|heart\s*rate)\s*(?:was|is)?\s*(\d{2})/.exec(t);
  if (hr) out.rhr = parseInt(hr[1], 10);
  const hrv = /\bhrv\s*(?:was|is)?\s*(\d{2,3}(?:\.\d)?)/.exec(t);
  if (hrv) out.hrv = parseFloat(hrv[1]);
  const sh = /\b(?:sleep\s*(?:hours?|hrs?))\s*(?:was|is)?\s*(\d{1,2}(?:\.\d)?)/.exec(t);
  if (sh) out.sleepHours = parseFloat(sh[1]);

  const unwell = /\b(?:don'?t|dont|not)\s+feel\w*\s+well\b/.test(t); // "don't feel well" = sick in itself
  const symptoms = /\b(sick|ill|injured|hurt|cold|flu|fever|cough|under the weather)\b/.test(t);
  const negated = /\b(?:not|no|isn'?t|aren'?t|don'?t|dont)\s+(?:feeling\s+|feel\s+)?(sick|ill|injured)\b/.test(t);
  out.sick = unwell || (symptoms && !negated);
  out.menstrual = /\b(period|menstrual|menstruating|on my cycle)\b/.test(t);
  return out;
}
