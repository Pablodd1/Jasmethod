// Educational content for the landing page — pre/post-workout nutrition,
// ergogenic aids, and the daily-data onboarding. All claims trace to
// research.ts sources (ISSN, Williamson 2023, Niering 2024, etc.).

export interface EduCard {
  icon: string;
  title: string;
  text: string;
  ref?: string;
}

export const PRE_WORKOUT: EduCard[] = [
  { icon: "☕", title: "Caffeine 3-6 mg/kg", text: "Take 45-60 min before hard sessions. Proven endurance and power boost — skip after 2 PM or your sleep pays the bill.", ref: "Guest 2021, ISSN position stand" },
  { icon: "🌾", title: "Carbs 1-4 g/kg", text: "1-4 h before long sessions. Top off glycogen; for sessions under 75 min, water is enough.", ref: "Kerksick 2017, ISSN" },
  { icon: "💧", title: "Sodium pre-load", text: "500-700 ml water with a pinch of salt 90 min before heat training or racing. Starts hydrated,pee clear not clear-yellow.", ref: "Sawka 2007, ACSM" },
  { icon: "🚫", title: "Skip heavy fat/fiber", text: "Big fat or fiber meals within 3 h of intensity = GI distress. Save the avocado toast for after." },
];

export const POST_WORKOUT: EduCard[] = [
  { icon: "🥛", title: "Protein 0.3-0.4 g/kg", text: "Within 2 h after — 20-40 g with 2-3 g leucine. Women need the higher end (1.7-1.9 g/kg/day total).", ref: "Williamson 2023" },
  { icon: "🍚", title: "Carbs 1.2 g/kg/h", text: "First 4 h after hard work. Chocolate milk hits both boxes — cheap and effective.", ref: "Kerksick 2017, ISSN" },
  { icon: "😴", title: "Casein before bed", text: "30-40 g slow protein at night reduces overnight breakdown and helps overnight recovery.", ref: "Snijders 2015" },
  { icon: "🧊", title: "Sleep > ice baths", text: "Chronic cold water immersion can blunt strength adaptations. Sleep 8h+ instead; save ice for multi-stage events.", ref: "Roberts 2015" },
];

export const ERGOGENIC_AIDS: EduCard[] = [
  { icon: "💪", title: "Creatine monohydrate 3-5 g/day", text: "The most-studied supplement in sport. +8% strength, +14% reps-to-fatigue, brain benefits too. Women: same dosing, load not required.", ref: "Kreider 2017, ISSN" },
  { icon: "🥤", title: "Beta-alanine 3.2-6.4 g/day", text: "Buffers muscle acidity — helps 1-4 min efforts (rowing, 800m, Hyrox stations). Tingling is harmless.", ref: "Trexler 2015" },
  { icon: "🫧", title: "Nitrate / beetroot 6-13 mg/kg", text: "2-3 h before sub-elite endurance efforts. Real effect in recreational athletes; elite response is smaller.", ref: "Jones 2018" },
  { icon: "🧂", title: "Sodium during >90 min", text: "300-600 mg/h in heat. Electrolyte drinks only matter past 90 min or in heavy sweat.", ref: "Sawka 2007" },
  { icon: "⚠️", title: "Skip the fancy stuff", text: "No strong evidence for BCAAs (if protein is adequate), testosterone boosters, or fat burners. Money better spent on real food and sleep.", ref: "ISSN 2018 review" },
];

export const ONBOARDING_STEPS: { icon: string; title: string; text: string }[] = [
  { icon: "🌅", title: "Every morning: 2-min check-in", text: "Tell the app how you slept and feel — type it, or hold the mic button and speak. No devices needed: the Morning Check measures your nervous system with finger taps, balance, and a 15-second pulse count." },
  { icon: "⌚", title: "Have a watch? It plugs in", text: "Connect Garmin, Strava, COROS or Whoop once. Every sync pulls your HRV, sleep and workouts automatically. No watch? Everything works manually or by voice." },
  { icon: "📋", title: "Your prescription appears", text: "The coach reads your check-in + biometrics + calendar and writes TODAY'S exact session: warm-up, main set, heart-rate or pace targets from YOUR tests, cooldown. You don't think — you execute." },
  { icon: "📈", title: "Every 6 weeks: test & re-anchor", text: "The plan runs in 6-week cycles. Test weeks schedule your baselines (time trial, FTP, HR thresholds). Completing a test re-anchors your zones — the next cycle gets harder as you get fitter, or backs off if life gets busy." },
  { icon: "🎯", title: "Your goal sets the structure", text: "Triathlon, HYROX, boxing camp, cycling, swimming, or just lifting — the cycle adapts to the goal. Racing adds a taper; non-racers get a steady 6-week progression wave." },
  { icon: "🔥", title: "Intensity grows with you", text: "The app watches your heart rate, duration and weights. Complete weeks and load rises ~5-8%; fail check-ins and it drops before you break. Progressive overload without the guesswork." },
];

export const MIND_RECOVERY: EduCard[] = [
  { icon: "🧘", title: "Breathing & meditation", text: "5 min box breathing (4-4-4-4) pre-workout sharpens focus; post-workout down-regulation speeds recovery. Guided scripts live in your daily prescription." },
  { icon: "👁️", title: "Visualization", text: "Olympic teams script it: 5 min rehearsing tomorrow's session or race the night before measurably improves execution. The app prompts what to visualize." },
  { icon: "📚", title: "Read to grow", text: "Each prescription includes a 2-minute science lesson (why intervals work, what HRV means) — you finish the plan smarter than you started." },
];
