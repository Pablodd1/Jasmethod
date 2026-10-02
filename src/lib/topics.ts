// JasMiamiMethod — Editorial science content for the public site.
// Grounded in the same evidence base as the training engine (src/lib/research.ts)
// and the adaptive engine (src/lib/adaptive.ts). Content is static and rendered
// server-side; no DB access, so the public explainer pages work with zero auth.

export type TopicSlug =
  | "supplements"
  | "ergogenic-aids"
  | "sleep"
  | "nutrition"
  | "race-fuel";

export interface TopicSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface MetricGlance {
  value: string;
  unit: string;
  label: string;
}

export interface Topic {
  slug: TopicSlug;
  index: string; // e.g. "01"
  kicker: string;
  title: string;
  subtitle: string;
  lede: string; // opening paragraph (first letter is a dropcap in prose)
  glance: MetricGlance[];
  sections: TopicSection[];
  protocol: { title: string; body: string };
  cites: string[];
  // The concrete, app-level consequence — ties the article back to the product.
  appTie: string;
}

// ---------------------------------------------------------------------------
// 01 — SUPPLEMENTS (daily foundational health; distinct from ergogenic aids)
// ---------------------------------------------------------------------------

const SUPPLEMENTS: Topic = {
  slug: "supplements",
  index: "01",
  kicker: "Field Guide · Daily Foundations",
  title: "Supplements",
  subtitle: "The few pills that earn their place — graded by human-trial evidence through 2026.",
  lede:
    "Most of the supplement aisle is noise dressed up in a shiny label. The shortlist that survives contact with replicated human trials is small: creatine, caffeine, beta-alanine, protein, vitamin D, omega-3 — plus targeted add-ons per sport. Everything here is graded against human trials, not marketing.",
  glance: [
    { value: "61", unit: "meta-analyses", label: "Creatine umbrella review 2025 — best-evidenced supplement in sport" },
    { value: "3–5", unit: "g/day", label: "Creatine monohydrate — safe across the lifespan (Kreider 2025)" },
    { value: "3–6", unit: "mg/kg", label: "Caffeine — the effective dose range (Guest 2021)" },
    { value: "3.2–6.4", unit: "g/day", label: "Beta-alanine chronic load — 4+ weeks to work (Trexler 2015)" },
  ],
  sections: [
    {
      heading: "Correct a deficit, don't chase a feeling",
      paragraphs: [
        "The rule that separates smart supplementation from fad: a supplement is justified when you have evidence your body is short of something and diet alone isn't fixing it. That evidence is a blood panel looking for low vitamin D, low ferritin, low B12, or a diet history showing a consistent gap (a vegan runner's B12, a heavy sweater's sodium and magnesium).",
        "The 2025 state of the science strengthens this: the ISSN umbrella review of 61 creatine meta-analyses (Ashtary-Larky 2025) and the Kreider 2025 safety review confirm that monohydrate — the cheapest form — is also the only form with replicated evidence, and it's safe in healthy people from adolescents to the elderly. Skip 'buffered' and 'advanced' creatines; pay for training, not labels.",
      ],
      bullets: [
        "Test first: ferritin, vitamin D, B12, hemoglobin. Treat what's low.",
        "One correction at a time — you can't attribute a benefit if you change three variables.",
        "Choose third-party-tested brands (NSF / Informed Sport) for anything you take daily.",
        "Monohydrate only for creatine; anything else is marketing.",
      ],
    },
    {
      heading: "Sport-specific stacks (what actually differs)",
      paragraphs: [
        "Sprint/400m: creatine (ATP regeneration), caffeine (RFD + reaction), beta-alanine (the 400m is a 40–75s acidosis battle — carnosine buffering helps), and sodium bicarbonate on race day only if trialed in training.",
        "Boxing/combat: assess sport-performance nutrition separately from head-injury care. No brain-protection supplement stack is established here. The Beauregard 2025 paper is a trial protocol, not evidence of reduced concussion injury. Review individual supplement suitability with a sports nutrition professional.",
        "Endurance/tri: caffeine has the strongest evidence of any supplement; nitrate (beetroot) improves economy; carb mixtures (glucose+fructose) raise absorption above 60 g/h; tart cherry for multi-day competition recovery.",
        "Strength: creatine + 1.6–2.2 g/kg protein daily is the core; citrulline malate adds reps per set; vitamin D if blood level is low.",
      ],
    },
    {
      heading: "The recovery stack — use around competition, not daily",
      paragraphs: [
        "Tart cherry (Montmorency): 2026 meta-analyses of RCTs confirm faster strength recovery and less soreness when taken 4–5 days before and 2–3 days after hard competition (Hagele 2026). Daily use may blunt training adaptation — it's an anti-inflammatory, and inflammation is the signal that drives adaptation. Competition windows only.",
        "Collagen peptides + vitamin C: 15 g taken 30–60 min BEFORE mechanical loading increases tendon collagen synthesis (Baar 2017; Bischof 2024). Timing before loading is the whole trick — taking it after does little. Useful for tendon-heavy sports and masters athletes.",
        "Ashwagandha (KSM-66 300–600 mg/day) reduces cortisol and may improve sleep quality — useful in high-stress blocks, not a performance enhancer per se.",
      ],
    },
    {
      heading: "What the app does with this",
      paragraphs: [
        "JasMiamiMethod stores your blood panels, flags out-of-range markers against athlete-adjusted reference ranges, and surfaces the specific deficit — 'Ferritin 28 ng/mL, aim 50+ for endurance' — instead of a generic multivitamin suggestion. Daily ergogenic recommendations match your session type, and your likes/dislikes are learned. Supplements you opt out of are never recommended again.",
      ],
    },
  ],
  protocol: {
    title: "The 4-question gate",
    body: "Before you buy (or keep taking) anything: 1) Is there replicated human-trial evidence? 2) Is the dose matched to the research? 3) Does it fit MY sport's demand? 4) Can I measure the outcome? If a supplement fails all four, it's decoration.",
  },
  cites: [
    "Ashtary-Larky et al. 2025 — Creatine umbrella review, 61 meta-analyses (J ISSN)",
    "Kreider et al. 2025 — Creatine safety across the lifespan (Front Nutr)",
    "Guest et al. 2021 — Caffeine position stand (J ISSN 18:1)",
    "Trexler et al. 2015 — Beta-alanine position stand (J ISSN 12:30)",
    "Beauregard et al. 2025 — Omega-3 & TBI repair, DHA vs EPA (PLOS ONE)",
    "Hagele et al. 2026 — Tart cherry RCT meta-analysis (MDPI)",
    "Baar 2017 — Collagen + loading mechanism (J Appl Physiol)",
    "Holick 2007 — Vitamin D deficiency (N Engl J Med 357:266-281)",
    "Peeling et al. 2008 — Iron status in female athletes",
  ],
  appTie: "Blood panel markers are checked against athlete-specific ranges, ergogenic picks match your session type and sport, and your feedback is learned — opt-outs are permanent.",
};

// ---------------------------------------------------------------------------
// 02 — ERGOGENIC AIDS (acute performance boosters)
// ---------------------------------------------------------------------------

const ERGOGENIC_AIDS: Topic = {
  slug: "ergogenic-aids",
  index: "02",
  kicker: "Field Guide · Acute Boosters",
  title: "Ergogenic Aids",
  subtitle: "The evidence-graded add-ons that actually move performance.",
  lede:
    "An ergogenic aid is anything that acutely improves performance — taken before or during, with effect measured in the same session, not next month. Some are as close to settled science as sports nutrition gets. Most are not.",
  glance: [
    { value: "3–6", unit: "mg/kg", label: "Caffeine — Group A, the gold standard" },
    { value: "3–5", unit: "g/day", label: "Creatine monohydrate — strength + repeat sprint" },
    { value: "3.2–6.4", unit: "g/day", label: "Beta-alanine — buffers 1–4 min efforts" },
    { value: "6–13", unit: "mmol", label: "Nitrate / beetroot — efficiency edge" },
  ],
  sections: [
    {
      heading: "Group A: the evidence is in",
      paragraphs: [
        "The Australian Institute of Sport framework grades supplements A, B and C by evidence quality and safety. The Group-A list is short and each entry has a job.",
      ],
      bullets: [
        "Caffeine (3–6 mg/kg, 45–60 min pre) lowers perceived exertion and boosts endurance and high-intensity output — the single most reliable performance booster (Goldstein 2010).",
        "Creatine monohydrate (3–5 g/day) improves strength, repeat-sprint and recovery; a smaller but real endurance benefit exists.",
        "Beta-alanine (3.2–6.4 g/day) buffers muscle acidity for 1–4 min efforts — swim surges, Hyrox stations, the 800m.",
        "Nitrate / beetroot (6–13 mmol, 2–3 h pre) improves efficiency and lowers oxygen cost, strongest in recreational athletes (Jones 2018).",
        "Sodium bicarbonate (0.2–0.3 g/kg) buffers sprint and threshold efforts, but carries GI risk — test in training, never first on race day.",
      ],
    },
    {
      heading: "The 'skip' list",
      paragraphs: [
        "BCAAs add nothing if total protein is adequate. Testosterone boosters and fat burners show no strong evidence in healthy athletes. Your money is better spent on food, sleep and a coach.",
      ],
    },
    {
      heading: "Timing is half the dose",
      paragraphs: [
        "A caffeine + nitrate protocol, a pre-race bicarb load, a creatine habit — each has a window and a ceiling. Taking the right thing at the wrong time (caffeine at 6pm, bicarb first time on race morning) turns a booster into a liability.",
      ],
    },
  ],
  protocol: {
    title: "Race-day protocol (never new on race day)",
    body: "Caffeine 3 mg/kg at T-60min · beta-alanine + creatine taken daily for weeks (not acute) · nitrate 2–3 h pre if using · sodium during for efforts over 90 min. Trial every booster in at least two training sessions first.",
  },
  cites: [
    "AIS Sports Supplement Framework 2021",
    "Goldstein et al. 2010 — Caffeine (J Int Soc Sports Nutr 7:5)",
    "Jones 2018 — Nitrate & endurance",
    "Trexler 2015 — Beta-alanine",
  ],
  appTie: "The daily check-in matches ergogenic picks to today's actual session (sport, type, duration) and respects your liked/opted-out list — then de-duplicates caffeine so you're never told to take it twice.",
};

// ---------------------------------------------------------------------------
// 03 — SLEEP
// ---------------------------------------------------------------------------

const SLEEP: Topic = {
  slug: "sleep",
  index: "03",
  kicker: "Field Guide · The First Recovery Tool",
  title: "Sleep",
  subtitle: "Adaptation is consolidated in bed, not in the gym.",
  lede:
    "Every training stimulus you deliver is only a promise until you sleep. Growth hormone secretion, tissue repair, motor-pattern consolidation and the immune response of a hard block all peak during deep and REM sleep — which is why the literature treats sleep debt as a direct performance tax.",
  glance: [
    { value: "7–9", unit: "hours", label: "Athlete target — more during heavy blocks" },
    { value: "+1", unit: "h/night", label: "Sleep extension improves sprint + accuracy (Mah 2011)" },
    { value: "<30", unit: "min", label: "Sleep latency — fall asleep fast = good sign" },
    { value: "80–90", unit: "%", label: "Sleep-efficiency benchmark" },
  ],
  sections: [
    {
      heading: "Sleep debt is a dose-response",
      paragraphs: [
        "Shortening sleep below ~6h measurably degrades endurance, power, reaction time and — critically — effort perception: the same session feels harder and recovery is slower (Fullagar 2015). The underappreciated lever isn't just duration; it's consistency. A stable bedtime stabilizes the circadian rhythm that anchors your hormone cascade.",
        "One of the cleanest findings in the literature: extending sleep by ~1h/night in athletes already sleeping 7h produced measurable gains in sprint and shooting accuracy in under a week (Mah 2011).",
      ],
      bullets: [
        "Anchor wake time first — it's the stronger circadian cue.",
        "Caffeine half-life is ~5–6h; cut it by early afternoon (the app enforces this on ergogenic picks).",
        "Cool, dark, quiet room; screen light in the last hour is the cheapest thing to fix.",
        "A consistent pre-sleep down-regulation routine shortens sleep latency.",
      ],
    },
    {
      heading: "Sleep vs. the 'recovery hacks'",
      paragraphs: [
        "Chronic cold-water immersion can blunt strength adaptations (Roberts 2015); ice baths are for multi-stage events, not daily use. Nothing replaces eight consistent hours. Nasal breathing and a short resonance-breathing session are the only recovery techniques worth stacking on top of sleep.",
      ],
    },
  ],
  protocol: {
    title: "The evening protocol",
    body: "No caffeine after ~2pm · last meal 2–3h before bed · screens dimmed 1h out · 5 min of 4-7-8 or extended-exhale breathing in the dark · wake time held constant, even on weekends.",
  },
  cites: [
    "Mah et al. 2011 — Sleep extension (Sleep 34:943-950)",
    "Fullagar et al. 2015 — Sleep & athletic performance (Sports Med 45:161-186)",
    "Roberts 2015 — Cold water immersion & adaptation",
    "Lehrer & Gevirtz 2014 — HRV biofeedback",
  ],
  appTie: "Sleep quality is a first-class input to your daily readiness: the check-in scores it, wearable sync pulls real sleep hours and efficiency, and a bad night shifts the coach's verdict toward 'easy' or 'rest' automatically.",
};

// ---------------------------------------------------------------------------
// 04 — NUTRITION
// ---------------------------------------------------------------------------

const NUTRITION: Topic = {
  slug: "nutrition",
  index: "04",
  kicker: "Field Guide · Daily Intake",
  title: "Nutrition",
  subtitle: "Protein, carbs and micronutrients — engineered around the training, not the reverse.",
  lede:
    "Daily nutrition is the substrate every session is built on. The position stands converge on surprisingly concrete numbers: protein in grams per kilogram, carbs matched to demand, micronutrients protected against the specific depletions endurance training causes.",
  glance: [
    { value: "1.4–2.0", unit: "g/kg/day", label: "Protein — athletes (ISSN 2017)" },
    { value: "1.7–1.9", unit: "g/kg/day", label: "Protein — female endurance athletes (Williamson 2023)" },
    { value: "0.3–0.4", unit: "g/kg", label: "Protein within 2h post-training" },
    { value: "1.2–1.6", unit: "g/kg/day", label: "Protein floor for strength work" },
  ],
  sections: [
    {
      heading: "Protein: the repair budget",
      paragraphs: [
        "Endurance athletes need more than the RDA — training breaks down muscle protein faster and rebuilds it with a higher ceiling. Strength-focused blocks sit at the top of the range (1.6–2.0 g/kg). A major, under-discussed finding: female athletes in hard training need the upper end, ~1.7–1.9 g/kg/day, higher than males — relevant for the female endurance athletes the method serves (Williamson 2023).",
        "Distribution matters: ~0.3–0.4 g/kg every 3–4 hours, with leucine-rich sources, beats one giant dinner.",
      ],
      bullets: [
        "Spread intake across 3–5 feedings rather than back-loading.",
        "For endurance, carbs scale with weekly volume; for strength, protein leads.",
        "Women: aim the higher end of the protein range in heavy training.",
      ],
    },
    {
      heading: "Carbs: match the demand",
      paragraphs: [
        "Carbohydrate needs track training volume, not body weight alone — a 6h/week amateur and a 20h/week pro live on different carbohydrate budgets. Daily intake should oscillate with the block: higher around long and hard sessions, lower on easy days. Chronic under-carbing is a classic cause of the 'tired but training' plateau.",
      ],
    },
    {
      heading: "Micronutrients: the endurance taxes",
      paragraphs: [
        "Heavy training specifically depletes iron (footstrike hemolysis, sweat, GI losses), vitamin D, and electrolytes lost in sweat. These are the gaps worth watching with a panel — and the reason the app flags them by name instead of recommending a blanket multivitamin.",
      ],
    },
  ],
  protocol: {
    title: "The daily template",
    body: "Protein 1.6–2.0 g/kg, spread over the day · carbs matched to today's training demand · iron/D/magnesium guarded, tested not guessed · hydration to keep urine pale (not clear).",
  },
  cites: [
    "Thomas et al. 2016 — ACSM/AND/DC Joint Position Stand",
    "Jäger et al. 2017 — ISSN protein position stand",
    "Williamson et al. 2023 — Female athlete protein",
    "Burke et al. 2001/2011 — Carb periodization",
  ],
  appTie: "The daily check-in computes a personal protein target by sex, sport and phase — female athletes get a phase-adjusted figure that reflects Williamson 2023 rather than the generic male-default number.",
};

// ---------------------------------------------------------------------------
// 05 — RACE & TRAINING FUEL
// ---------------------------------------------------------------------------

const RACE_FUEL: Topic = {
  slug: "race-fuel",
  index: "05",
  kicker: "Field Guide · Intra-Session Strategy",
  title: "Race & Training Fuel",
  subtitle: "Carbs, fluid and sodium — tuned to duration, heat and effort.",
  lede:
    "Fueling is a strategy, not a snack. The gut can be trained to absorb carbohydrates, but only within physiogical limits that shift with exercise duration, heat and intensity. The science gives you a ladder; your job is climbing it in training so race day is reflexive.",
  glance: [
    { value: "30–60", unit: "g/h", label: "Carbs for 1–2.5h efforts" },
    { value: "60–90", unit: "g/h", label: "Carbs over 2.5h — glucose:fructose 2:1" },
    { value: "400–1000", unit: "mg/h", label: "Sodium in heat / heavy sweat (ACSM 2007)" },
    { value: "0.4–1.2", unit: "L/h", label: "Fluid — matched to sweat rate" },
  ],
  sections: [
    {
      heading: "The carbohydrate ladder",
      paragraphs: [
        "Under ~60 minutes, water is enough — no fuel needed. 1–2.5 hours: 30–60 g/h. Beyond 2.5 hours, the ceiling rises to 60–90 g/h, but only with multiple transportable carbs (glucose + fructose in a 2:1 ratio), because each uses a different intestinal transporter (Jeukendrup 2014). Pushing a single carb type past ~60 g/h just leaves sugar sitting in the gut.",
      ],
      bullets: [
        "Train the gut: build up to target intake over weeks, not on race morning.",
        "Practical: one gel (~25g) every 30 min at the low end; two types of carb above 2.5h.",
        "Under 75 min — skip it; the cost of GI distress exceeds any marginal glycogen saving.",
      ],
    },
    {
      heading: "Sodium and fluid: match the sweat",
      paragraphs: [
        "Sweat rate varies wildly between athletes. The only way to know yours is to weigh before and after a representative session (1 kg lost ≈ 1 L sweat). In heat, sodium needs rise to 400–1000 mg/h and fluid to roughly your measured loss rate — drinking to thirst is a floor, not a plan, on long hot days (Casa 2000, ACSM 2007).",
        "Heat also slows you: the app's temperature model scales pace, trims volume and scales hydration as conditions cross from warm to hot to extreme.",
      ],
    },
    {
      heading: "Caffeine as race fuel",
      paragraphs: [
        "Pre-race caffeine (3–6 mg/kg) is the highest-confidence acute boost available. For multi-hour events, trickle it — small doses early and mid-race — rather than one large bolus, and never introduce it on race day if you train without it.",
      ],
    },
  ],
  protocol: {
    title: "The race-day fuel plan (tested in training)",
    body: "T-60min: caffeine 3 mg/kg + 500ml electrolytes if hot · start fueling at ~20 min, not when you're empty · 60–90 g/h multi-transportable carbs · sodium to match sweat rate · fluid by measured loss.",
  },
  cites: [
    "Jeukendrup 2014 — Multiple transportable carbs (Sports Med 44:S25-33)",
    "Casa et al. 2000 — Hydration / sweat rate",
    "ACSM 2007 — Exercise & fluid replacement",
    "Ely et al. 2007 — Heat pacing",
  ],
  appTie: "Every check-in returns a fuel plan — carbs/h, sodium mg/h, fluid ml/h — scaled to today's session duration, intensity and the A-race's expected heat. A heat factor automatically raises your fluid and sodium targets.",
};

export const TOPICS: Record<TopicSlug, Topic> = {
  supplements: SUPPLEMENTS,
  "ergogenic-aids": ERGOGENIC_AIDS,
  sleep: SLEEP,
  nutrition: NUTRITION,
  "race-fuel": RACE_FUEL,
};

// ---------------------------------------------------------------------------
// Daily check-in explainer — mirrors src/lib/adaptive.ts `adaptSession()`.
// WHY (science) → METRIC (the 1–5 scale) → EVALUATION (how it moves the score).
// ---------------------------------------------------------------------------

export interface CheckinQuestion {
  key: string;
  label: string;
  scale: string; // e.g. "1 = wrecked · 5 = fresh"
  why: string; // the science behind asking it
  metric: string; // how to self-rate on the 1–5 scale
  evaluation: string; // how it feeds the readiness score / verdict
  weight: string; // e.g. "±16 points"
}

export const CHECKIN_QUESTIONS: CheckinQuestion[] = [
  {
    key: "sleep",
    label: "Sleep quality",
    scale: "1 = terrible · 5 = deep, unbroken",
    why: "Sleep is when adaptation consolidates — growth hormone, tissue repair and motor learning all peak overnight (Fullagar 2015). A short or broken night is the single biggest predictor of a poor session.",
    metric: "Rate last night honestly: did you wake refreshed, or fight the whole night? Hours matter, but so does quality — 6 solid hours can beat 8 fragmented ones.",
    evaluation: "Moves the readiness score ±16 points. A bad night pulls the verdict toward an easy day or full rest, protecting the block instead of digging a hole.",
    weight: "±16 points",
  },
  {
    key: "soreness",
    label: "Muscle soreness",
    scale: "1 = fresh · 5 = wrecked",
    why: "Residual soreness is a proxy for incomplete recovery — the muscles are still in the repair phase rather than ready to produce force (session-RPE / recovery research).",
    metric: "Squat down, walk a few steps. Tight and heavy? That's a 4–5. Loose and springy? A 1–2.",
    evaluation: "Subtracts up to 12 points (more sore = lower readiness). High soreness caps today's intensity.",
    weight: "−12 points",
  },
  {
    key: "energy",
    label: "Energy",
    scale: "1 = drained · 5 = buzzing",
    why: "Subjective energy tracks autonomic recovery — how much 'reserve' the nervous system has available for a quality session (readiness-screening research).",
    metric: "How do you feel before coffee and before you've talked yourself into anything? The first honest answer is usually the right one.",
    evaluation: "Moves the score ±16 points. Low energy is the most common signal to trim volume rather than force it.",
    weight: "±16 points",
  },
  {
    key: "motivation",
    label: "Motivation",
    scale: "1 = none · 5 = fired up",
    why: "Motivation is a psychobiological signal — a sharp, persistent drop can signal under-recovery even when the body hasn't said so yet (overtraining-syndrome literature).",
    metric: "Do you want today's session, or are you dreading it? Momentum is real; burnout often announces itself here first.",
    evaluation: "A lighter ±8 points. Low motivation nudges the coach toward keeping the habit easy rather than calling rest.",
    weight: "±8 points",
  },
  {
    key: "stress",
    label: "Life stress",
    scale: "1 = calm · 5 = overwhelmed",
    why: "Psychological stress and training stress share the same physiological currency — allostatic load. A brutal work week taxes recovery even if the legs feel fine.",
    metric: "Rate the whole picture — work, family, sleep pressure — not just today's mood.",
    evaluation: "Subtracts up to 10 points. High stress trims the prescription even when you feel physically okay.",
    weight: "−10 points",
  },
];

export interface ObjectiveMetric {
  key: string;
  label: string;
  hint: string;
  why: string;
  evaluation: string;
}

export const CHECKIN_OBJECTIVE: ObjectiveMetric[] = [
  {
    key: "rhr",
    label: "Resting heart rate",
    hint: "Before coffee, still in bed.",
    why: "Resting HR is an objective autonomic window — a fast, cheap signal of how hard the body is working to recover (Plews 2013).",
    evaluation: "A reading 6+ bpm over your 7-day baseline subtracts 10 points; 6 below adds 4. It's the app's most objective daily signal.",
  },
  {
    key: "weightKg",
    label: "Morning weight",
    hint: "Same scale, after bathroom, before food.",
    why: "Day-to-day weight tracks hydration and fueling status — sudden swings are fluid or glycogen, not body composition.",
    evaluation: "Rolled into a 3-day vs prior trend. ±1.5% flags overhydration/under-fuelling or dehydration.",
  },
  {
    key: "cycleDay",
    label: "Cycle day (female athletes)",
    hint: "Day 1–35 of the menstrual cycle.",
    why: "Strength favors the late follicular phase and dips in the early follicular phase (Niering 2024); individual variability is large (McNulty 2020).",
    evaluation: "Adjusts readiness, protein target and training focus by phase — individualized, never a blanket 'train lighter' rule.",
  },
  {
    key: "sick",
    label: "Sick or injured",
    hint: "A yes/no — don't train through it.",
    why: "Training through illness converts a 2-day setback into a 2-week one; the immune system is already taxed by the block.",
    evaluation: "A 'yes' subtracts 40 points and forces a rest verdict — the engine's hard stop.",
  },
];

export interface VerdictExplanation {
  verdict: "full" | "trim" | "easy" | "rest";
  label: string;
  range: string;
  duration: string;
  intensity: string;
  meaning: string;
}

export const VERDICTS: VerdictExplanation[] = [
  {
    verdict: "full",
    label: "FULL",
    range: "65–100",
    duration: "×1.0",
    intensity: "cap Z7",
    meaning: "Green to go. Take the key session by the horns — chase the quality.",
  },
  {
    verdict: "trim",
    label: "TRIM",
    range: "45–64",
    duration: "×0.85",
    intensity: "cap Z4",
    meaning: "Trim the last interval set, keep the main work, extend the warm-up.",
  },
  {
    verdict: "easy",
    label: "EASY",
    range: "25–44",
    duration: "×0.60",
    intensity: "cap Z2",
    meaning: "Keep the habit, drop to easy intensity and ~60% duration. Sleep is priority.",
  },
  {
    verdict: "rest",
    label: "REST",
    range: "<25 (or sick)",
    duration: "×0",
    intensity: "Z1 flush only",
    meaning: "Full rest or a 20-min Z1 flush. Protect the block — the hard work keeps for tomorrow.",
  },
];

export const CHECKIN_SCORE_EXPLAINER = {
  title: "How the daily evaluation works",
  intro:
    "Your five answers (plus resting HR and weight when you add them) combine into a single readiness score from 0–100. That score becomes one of four verdicts — and today's session is scaled to it automatically.",
  formula: "50 + sleep(±16) − soreness(≤12) + energy(±16) + motivation(±8) − stress(≤10) − sick(40) ± RHR vs baseline",
  note: "The scoring is deliberately conservative: subjective signals are weighted, objective resting HR trims the edges, and 'sick' overrides everything. When in doubt, the engine backs off.",
};

export const TOPIC_LIST: { slug: TopicSlug; index: string; title: string; subtitle: string }[] = [
  { slug: "supplements", index: "01", title: "Supplements", subtitle: "Daily foundational health — correct a deficit, skip the hype." },
  { slug: "ergogenic-aids", index: "02", title: "Ergogenic Aids", subtitle: "Evidence-graded acute boosters that actually move performance." },
  { slug: "sleep", index: "03", title: "Sleep", subtitle: "The first recovery tool — adaptation happens in bed." },
  { slug: "nutrition", index: "04", title: "Nutrition", subtitle: "Protein, carbs and micronutrients engineered around the training." },
  { slug: "race-fuel", index: "05", title: "Race & Training Fuel", subtitle: "Carbs, fluid and sodium tuned to duration, heat and effort." },
];
