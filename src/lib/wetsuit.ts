// JasMiamiMethod — Wetsuit legality by federation
//
// Adjudication 2026-09-08, Conflict 5 (CRITICAL SAFETY): a single universal
// temperature cutoff is dangerous — it can get an athlete DQ'd, or talk a
// weaker swimmer out of a legal, safety-enhancing wetsuit. Rules are
// federation- and category-specific, sourced from official handbooks, and
// every threshold carries a "verify against the CURRENT rulebook" flag
// because federations revise them.
//
// Nothing here is hardcoded into predictions without the verdict surface —
// the forecast UI shows the verdict + citation + verify warning verbatim.

export type Federation = "USAT" | "WORLD_TRIATHLON" | "BRITISH_TRIATHLON" | "IRONMAN";
export type WetsuitCategory = "age_group" | "elite";

export type WetsuitVerdict =
  | "mandatory"
  | "permitted"
  | "permitted_no_awards"
  | "forbidden"
  | "unknown";

export interface WetsuitDecision {
  verdict: WetsuitVerdict;
  legal: true | "optional" | false; // backward-compatible summary for the UI
  note: string;
  federation: Federation | "unknown";
  category: WetsuitCategory;
  citation: string;
  mustVerify: boolean;
  waterTempC?: number;
}

interface FederationRule {
  forbiddenAtOrAboveC?: number;
  noAwardsBandC?: [number, number];   // permitted but not award-eligible (USAT)
  mandatoryBelowC?: number;
  mandatoryNote?: string;             // e.g. acclimatization exceptions
  nuance?: (ctx: { age?: number; swimM?: number }) => {
    forbiddenAtOrAboveC?: number;
    note?: string;
  } | null;
  citation: string;
  eliteUsesSeparateRule: boolean;
}

// Values transcribed from the 2026-09-08 adjudication report (official
// federation handbooks, verified as of 2025). mustVerify=true is intentional:
// federation rules change — the UI must surface the verify warning.
const RULES: Partial<Record<Federation, Partial<Record<WetsuitCategory, FederationRule>>>> = {
  USAT: {
    age_group: {
      forbiddenAtOrAboveC: 28.9, // 84°F
      noAwardsBandC: [25.6, 28.9], // 78.1–83.9°F: wear it, lose award eligibility
      mandatoryBelowC: 15.6, // 60°F
      citation: "USA Triathlon rulebook (rule 4.4), as of 2025",
      eliteUsesSeparateRule: true,
    },
  },
  WORLD_TRIATHLON: {
    elite: {
      forbiddenAtOrAboveC: 20.0, // varies slightly by event/distance
      mandatoryBelowC: 14.0, // UNVERIFIED exact band — verify current WT rules
      citation: "World Triathlon competition rules, as of 2025",
      eliteUsesSeparateRule: true,
    },
    age_group: {
      forbiddenAtOrAboveC: 22.0, // UNVERIFIED — WT age-group bands differ from elite
      mandatoryBelowC: 14.0, // UNVERIFIED
      citation: "World Triathlon age-group rules — VERIFY against current rulebook",
      eliteUsesSeparateRule: true,
    },
  },
  BRITISH_TRIATHLON: {
    age_group: {
      forbiddenAtOrAboveC: 22.0,
      mandatoryBelowC: 16.0, // 14°C permitted with documented acclimatization
      mandatoryNote: "Acclimatization exceptions may extend mandatory wear to 14°C — check the event",
      nuance: ({ age, swimM }) =>
        age != null && age >= 60 ? { forbiddenAtOrAboveC: 24.6, note: "Age 60+ band (24.6°C cutoff)" } :
        swimM != null && swimM > 1500 ? { forbiddenAtOrAboveC: 24.6, note: "Swims longer than 1,500m use the 24.6°C cutoff" } :
        null,
      citation: "British Triathlon rules, as of 2025",
      eliteUsesSeparateRule: true,
    },
  },
  IRONMAN: {
    age_group: {
      forbiddenAtOrAboveC: 24.5, // UNVERIFIED — Ironman publishes its own bands
      mandatoryBelowC: 14.0, // UNVERIFIED
      citation: "Ironman competition rules — VERIFY against the current event rulebook",
      eliteUsesSeparateRule: true,
    },
  },
};

export const FEDERATION_LABELS: Record<Federation, string> = {
  USAT: "USA Triathlon",
  WORLD_TRIATHLON: "World Triathlon",
  BRITISH_TRIATHLON: "British Triathlon",
  IRONMAN: "Ironman",
};

export function wetsuitVerdict(
  waterTempC: number,
  opts: {
    federation?: Federation | string | null;
    category?: WetsuitCategory | string | null;
    age?: number | null;
    swimM?: number | null;
  } = {},
): WetsuitDecision {
  const federation = (opts.federation as Federation) ?? "USAT";
  const category = (opts.category as WetsuitCategory) ?? "age_group";
  const base = { waterTempC, federation, category };

  if (!RULES[federation]?.[category]) {
    // Known federation, missing category combo (e.g. USAT elite) — never guess.
    return {
      ...base,
      verdict: "unknown",
      legal: "optional",
      note: `No verified ${category} rule loaded for ${FEDERATION_LABELS[federation] ?? federation} — check the current rulebook before race day.`,
      citation: "—",
      mustVerify: true,
    };
  }

  const rule = RULES[federation]![category]!;
  const nuance = rule.nuance?.({ age: opts.age ?? undefined, swimM: opts.swimM ?? undefined }) ?? null;
  const forbiddenAt = nuance?.forbiddenAtOrAboveC ?? rule.forbiddenAtOrAboveC;
  const noAwards = rule.noAwardsBandC;

  const parts: string[] = [`${waterTempC}°C water`];
  let verdict: WetsuitVerdict;
  if (forbiddenAt != null && waterTempC >= forbiddenAt) {
    verdict = "forbidden";
    parts.push(`wetsuits FORBIDDEN at/above ${forbiddenAt}°C for this event`);
  } else if (noAwards && waterTempC >= noAwards[0] && waterTempC < noAwards[1]) {
    verdict = "permitted_no_awards";
    parts.push(`legal, but you forfeit award eligibility (band ${noAwards[0]}–${noAwards[1]}°C)`);
  } else if (rule.mandatoryBelowC != null && waterTempC < rule.mandatoryBelowC) {
    verdict = "mandatory";
    parts.push(`wetsuit MANDATORY below ${rule.mandatoryBelowC}°C`);
    if (rule.mandatoryNote) parts.push(`(${rule.mandatoryNote})`);
  } else {
    verdict = "permitted";
    parts.push(`wetsuit legal and recommended if you swim better in one`);
  }
  if (nuance?.note) parts.push(nuance.note);

  return {
    ...base,
    verdict,
    legal: verdict === "forbidden" ? false : verdict === "mandatory" ? true : "optional",
    note: parts.join(" — ") + ".",
    citation: rule.citation,
    mustVerify: true, // federation rules change; always surface the verify warning
  };
}
