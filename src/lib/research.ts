// JasMiamiMethod — Evidence base (ranked human studies, recreational + professional).
// Every training/recommendation in the app is grounded in these peer-reviewed
// sources. "AIS" = Australian Institute of Sport supplement framework (Group A/B).

export interface ResearchSource {
  id: string;
  claim: string;         // what the app uses it for
  ref: string;           // author year, journal/body
  level: "A" | "B" | "C";      // A = human outcomes, B = review/consensus, C = protocol/unverified (not efficacy evidence)
  population: "recreational" | "professional" | "both";
}

export const RESEARCH_SOURCES: ResearchSource[] = [
  { id: "seiler2009", claim: "80/20 polarized intensity distribution", ref: "Seiler & Tønnessen 2009, Int J Sports Physiol Perform 4:417-429", level: "A", population: "professional" },
  { id: "billat2001", claim: "vVO2max interval prescription", ref: "Billat et al. 2001, Med Sci Sports Exerc 33:1597-1602", level: "A", population: "both" },
  { id: "coggan", claim: "Historical TrainingPeaks terminology and threshold-power framework; not evidence validating JMetrics", ref: "Allen & Coggan, Training & Racing with a Power Meter", level: "B", population: "both" },
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

  // ---- equipment / power / aerodynamics ----
  { id: "jobson2009", claim: "power meter feedback improves performance", ref: "Jobson, Passfield, Atkinson et al. 2009, Int J Sports Med 30:80-85", level: "A", population: "both" },
  { id: "sanders2019", claim: "power vs heart rate pacing in endurance", ref: "Sanders, Heijboer, Akkermans et al. 2019, Int J Sports Physiol Perform 14:539-546", level: "A", population: "professional" },
  { id: "garcia2018", claim: "running power meters valid/reliable", ref: "García-Pinillos et al. 2018, J Strength Cond Res 32:2204-2210", level: "A", population: "both" },
  { id: "fonda2011", claim: "aerodynamic position reduces CdA", ref: "Fonda & Saris 2011, J Biomech 44:2449-2453", level: "B", population: "both" },
  { id: "griffiths2022", claim: "aero bar position vs drag savings", ref: "Griffiths & Mason 2022, Sports Eng 25:14", level: "B", population: "professional" },
  { id: "debray2014", claim: "CdA measurement on road/track", ref: "de Braam & de Vries 2014, J Sports Sci 32:1151-1159", level: "B", population: "professional" },
  { id: "croucher2023", claim: "pacing strategy with power on hilly courses", ref: "Croucher, McManus, Osborne 2023, Eur J Sport Sci 23:1124-1132", level: "A", population: "professional" },
  { id: "austin2022", claim: "running economy + power measurement", ref: "Austin & Reinking 2022, Sports Med Open 8:71", level: "B", population: "both" },

  // ---- boxing: biomechanics, neuromuscular power, visuomotor ----
  { id: "walilko2005", claim: "Olympic boxer punch forces ~2000-4800N (hand velocity 6-11 m/s)", ref: "Walilko et al. 2005, Br J Sports Med 39:710-719", level: "A", population: "professional" },
  { id: "pieter2022", claim: "elite vs junior boxers: peak punch force 1508 vs 1035N, velocity 7.2 vs 6.3 m/s; lead-leg start-up strength separates levels", ref: "Biomechanics of the lead straight punch of different level boxers, Front Physiol 13:1015154 (2022)", level: "A", population: "both" },
  { id: "loturco2016", claim: "strength & power qualities (jump, bench-throw) highly associated with punching impact in elite boxers", ref: "Loturco et al. 2016, J Strength Cond Res 30:109-116", level: "A", population: "professional" },
  { id: "lopezlaval2020", claim: "bench-press velocity relates to rear-hand punch velocity (pro boxers)", ref: "Lopez-Laval et al. 2020, J Strength Cond Res 34:308-312", level: "A", population: "professional" },
  { id: "chottidao2024", claim: "RCT: plyometric AND jump-rope training improved jab velocity, RFD and reaction time in junior boxers", ref: "Chottidao et al. 2024 (plyometric vs jump-rope RCT, in Muñoz-López et al. 2024 scoping review, Appl Sci 14:9706)", level: "A", population: "both" },
  { id: "munozlopez2024", claim: "scoping review: strength/plyometric training improves punch force, RFD and CMJ in boxers; PAPE acutely boosts punch RFD", ref: "Muñoz-López et al. 2024, Appl Sci 14:9706 (scoping review)", level: "B", population: "both" },
  { id: "turner2011", claim: "rear-hand punch force develops from the ground up (triple extension + hip drive)", ref: "Turner, Baker & Miller 2011, Strength Cond J 33:2-9", level: "B", population: "both" },
  { id: "busko2016", claim: "accelerometer-instrumented bag validly measures punch force", ref: "Buśko et al. 2016, Acta Bioeng Biomech 18(1):47-54", level: "A", population: "both" },
  { id: "diewald2022", claim: "commercial water-filled smart bag: valid & reliable peak punch-force measurement", ref: "Diewald et al. 2022, Sports Eng 25 (instrumented punching-bag validation)", level: "A", population: "both" },
  { id: "smith2000", claim: "boxing dynamometer discriminates punch force (lab gold standard)", ref: "Smith, Dyson, Hale & Janaway 2000, J Sports Sci 18:445-450", level: "A", population: "professional" },
  { id: "zhang2025", claim: "eye-hand coordination, reaction time, perceptual span and depth perception are the top predictors of punch hit rate in amateur boxers", ref: "Front Physiol 16:1639227 (2025) — visual ability vs boxing performance", level: "A", population: "both" },
  { id: "martinezdequel2019", claim: "combat athletes' perceptual-cognitive expertise (anticipation, pattern recognition) is trainable and discriminates skill level", ref: "Martínez de Quel et al. 2019, perceptual-cognitive expertise in combat sports (narrative review)", level: "B", population: "both" },
  { id: "hassan2025", claim: "FITLIGHT reactive-agility training improves visual reaction time and visuomotor skill", ref: "Hassan et al. 2025 (FITLIGHT visual-motor RCT, PMC12252139)", level: "A", population: "recreational" },
  { id: "appelbaum2016", claim: "visual-motor skills are trainable and transfer to sport performance", ref: "Appelbaum & Erickson 2016, J Sports Sci 34:842-850 (review)", level: "B", population: "both" },

  // ---- boxing / combat sports: brain health + explosive power (2025) ----
  { id: "issncombat2025", claim: "combat sport nutrition position stand: macronutrients, making-weight, supplementation framework", ref: "Ricci et al. 2025, ISSN Position Stand, J Int Soc Sports Nutr", level: "B", population: "both" },
  { id: "brainfitness2025", claim: "brain fitness in combat sports: training load, rest, and pre/post-fight protocols for neuroprotection", ref: "Brain Fitness in Combat Sports review, 2025 (PubMed 42379663)", level: "B", population: "both" },
  { id: "beauregard2025", claim: "Omega-3 neuroprotection trial protocol; no efficacy results and no basis for concussion-treatment recommendations", ref: "Beauregard et al. 2025, PLOS ONE study protocol (PMID 40273177)", level: "C", population: "both" },
  { id: "heileson2024", claim: "omega-3 supplementation and head-impact biomarkers in contact-sport athletes (multi-site NCAA)", ref: "Heileson et al. 2024 (PMC11489149)", level: "A", population: "both" },
  { id: "giraldo2025", claim: "Creatine for concussion prevention or treatment is unestablished; experimental rationale does not demonstrate athlete benefit", ref: "Giraldo et al. 2025, J Int Soc Sports Nutr; citation requires verification", level: "C", population: "both" },
  { id: "betaalanineboxing", claim: "beta-alanine 3.2-6.4g/d improves high-intensity performance and punching power in the final seconds of rounds (4-10 wk trials)", ref: "Beta-alanine in combat sports review (PMC10490143); Korean national boxers study 2018", level: "A", population: "both" },
  { id: "bellar2015", claim: "alpha-GPC acutely enhances power output and reaction speed (cholinergic mechanism)", ref: "Bellar et al. 2015, J Int Soc Sports Nutr", level: "A", population: "both" },

  // ---- plyometrics (mandatory 1-2x/week conditioning rule) ----
  { id: "ramirezcampillo2022", claim: "plyometric jump training improves power, economy and injury resilience; 1-2 sessions/week effective", ref: "Ramírez-Campillo et al. 2022, plyometric jump training meta-analysis (Sports Med)", level: "A", population: "both" },

  // ---- female athlete / cycle / sex-specific ----
  { id: "niering2024", claim: "strength favors late follicular phase; early follicular unfavorable", ref: "Niering et al. 2024, Sports 12:31 (systematic review + meta)", level: "A", population: "recreational" },
  { id: "mcnull2020", claim: "trivial overall MC performance effects; individual variability dominates", ref: "McNulty et al. 2020, Br J Sports Med 54:712-722 (meta-analysis)", level: "A", population: "both" },
  { id: "carmichael2021", claim: "perceived performance worst in late luteal + early follicular", ref: "Carmichael et al. 2021, Int J Environ Res Public Health 18:1667", level: "B", population: "both" },
  { id: "williamson2023", claim: "female endurance athletes need ~1.89 g/kg protein; higher than males", ref: "Williamson et al. 2023, Sports Med (female athlete protein)", level: "A", population: "both" },
  { id: "issn2017", claim: "protein 1.4-2.0 g/kg athletes (strength 1.6-2.0)", ref: "Jäger et al. 2017, J Int Soc Sports Nutr 14:20 (ISSN position stand)", level: "A", population: "both" },
  { id: "aossm2023", claim: "youth strength training safe ~7-8+, supervised", ref: "AOSSM 2023, Youth Strength Training (position)", level: "B", population: "recreational" },
  { id: "nsca2022", claim: "youth RT: readiness-based, no max lifts to failure", ref: "NSCA Youth Performance & Fitness 2022 (position)", level: "B", population: "recreational" },
];

export function sourcesFor(ids: string[]): ResearchSource[] {
  return RESEARCH_SOURCES.filter((s) => ids.includes(s.id));
}

export function sourcesForKeys(...keys: string[]): ResearchSource[] {
  // fuzzy: match claim text against a keyword (lowercased)
  return RESEARCH_SOURCES.filter((s) => keys.some((k) => s.claim.toLowerCase().includes(k.toLowerCase())));
}
