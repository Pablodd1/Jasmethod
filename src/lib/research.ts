// JasMiamiMethod — Evidence base (ranked human studies, recreational + professional).
// Every training/recommendation in the app is grounded in these peer-reviewed
// sources. "AIS" = Australian Institute of Sport supplement framework (Group A/B).

export interface ResearchSource {
  id: string;
  claim: string;         // what the app uses it for
  ref: string;           // author year, journal/body
  level: "A" | "B";      // A = randomized/cohort human data, B = review/consensus
  population: "recreational" | "professional" | "both";
}

export const RESEARCH_SOURCES: ResearchSource[] = [
  { id: "seiler2009", claim: "80/20 polarized intensity distribution", ref: "Seiler & Tønnessen 2009, Int J Sports Physiol Perform 4:417-429", level: "A", population: "professional" },
  { id: "billat2001", claim: "vVO2max interval prescription", ref: "Billat et al. 2001, Med Sci Sports Exerc 33:1597-1602", level: "A", population: "both" },
  { id: "coggan", claim: "TSS, FTP, normalized power (PMC basis)", ref: "Allen & Coggan, Training & Racing with a Power Meter", level: "B", population: "both" },
  { id: "friel", claim: "7-zone HR model on LTHR", ref: "Friel, The Triathlete's Training Bible", level: "B", population: "both" },
  { id: "buchheit2014", claim: "HRV-guided training readiness", ref: "Buchheit 2014, Front Physiol 5:73", level: "A", population: "professional" },
  { id: "plews2013", claim: "HRV RMSSD vs 7-day baseline", ref: "Plews et al. 2013, Sports Med 43:773-781", level: "A", population: "professional" },
  { id: "foster1998", claim: "session-RPE training load", ref: "Foster 1998, J Strength Cond Res 12:109-115", level: "A", population: "both" },
  { id: "tanaka2001", claim: "HRmax = 208 − 0.7×age", ref: "Tanaka, Monahan & Seals 2001, J Am Coll Cardiol 37:153-156", level: "A", population: "both" },
  { id: "jurca2005", claim: "non-exercise VO2max estimate", ref: "Jurca et al. 2005, Med Sci Sports Exerc 37:984-992", level: "A", population: "recreational" },
  { id: "ronnestad2014", claim: "strength training improves endurance economy", ref: "Rønnestad & Mujika 2014, Scand J Med Sci Sports", level: "A", population: "professional" },
  { id: "jeukendrup2014", claim: "60-90g/h multiple-transportable carbs", ref: "Jeukendrup 2014, Sports Med 44(Suppl 1):S25-33", level: "A", population: "professional" },
  { id: "thomas2016", claim: "ACSM/AND/DC nutrition position", ref: "Thomas et al. 2016, Med Sci Sports Exerc 48:543-568", level: "B", population: "both" },
  { id: "mah2011", claim: "sleep extension improves performance", ref: "Mah et al. 2011, Sleep 34:943-950", level: "A", population: "recreational" },
  { id: "fullagar2015", claim: "sleep and athletic performance review", ref: "Fullagar et al. 2015, Sports Med 45:161-186", level: "B", population: "both" },
  { id: "casa2000", claim: "hydration / sweat rate guidance", ref: "Casa et al. 2000, J Athl Train 35:212-224", level: "A", population: "both" },
  { id: "ely2007", claim: "heat pacing / performance decrement", ref: "Ely et al. 2007, J Appl Physiol 103:1471-1480", level: "A", population: "both" },
  { id: "balban2023", claim: "physiological sigh down-regulates arousal", ref: "Balban et al. 2023, Cell Rep Med 4:100895", level: "A", population: "recreational" },
  { id: "lehrer2014", claim: "HRV biofeedback / resonance breathing", ref: "Lehrer & Gevirtz 2014, Front Psychol 5:756", level: "A", population: "both" },
  { id: "ais2021", claim: "ergogenic aids Group A/B grading", ref: "AIS Sports Supplement Framework 2021", level: "B", population: "professional" },
  { id: "goldstein2010", claim: "caffeine performance dose 3-6 mg/kg", ref: "Goldstein et al. 2010, J Int Soc Sports Nutr 7:5", level: "A", population: "both" },
  { id: "bartsaltin2008", claim: "altitude aerobic power loss", ref: "Bärtsch & Saltin 2008, Scand J Med Sci Sports 18(Suppl 1)", level: "B", population: "both" },
  { id: "banister1975", claim: "TRIMP / training impulse model", ref: "Banister et al. 1975, Aust J Sports Med 7:57-61", level: "B", population: "both" },
  { id: "stoggl2016", claim: "polarized vs threshold distribution", ref: "Stöggl & Sperlich 2016, Front Physiol 7:399", level: "A", population: "professional" },
  { id: "gollwitzer1999", claim: "implementation intentions (motivation)", ref: "Gollwitzer 1999, Am Psychol 54:493-503", level: "A", population: "recreational" },
];

export function sourcesFor(ids: string[]): ResearchSource[] {
  return RESEARCH_SOURCES.filter((s) => ids.includes(s.id));
}

export function sourcesForKeys(...keys: string[]): ResearchSource[] {
  // fuzzy: match claim text against a keyword (lowercased)
  return RESEARCH_SOURCES.filter((s) => keys.some((k) => s.claim.toLowerCase().includes(k.toLowerCase())));
}
