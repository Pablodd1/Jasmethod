// Verify boxing + weight-training ergogenic picks fire correctly.
import { recommendErgogenics } from "../src/lib/adaptive";

const prefs = { enabled: true, likes: [], dislikes: [], optsOut: [] };

const boxing = recommendErgogenics(prefs, { sport: "boxing", type: "interval", durationMin: 60, intensity: "z5" });
const boxingKeys = boxing.recommended.map((e) => e.key);
console.log("BOXING picks:", boxingKeys.join(", "));
if (!boxingKeys.includes("dha")) { console.error("✗ DHA missing for boxing"); process.exit(1); }
if (!boxingKeys.includes("choline")) { console.error("✗ choline missing for boxing"); process.exit(1); }
if (!boxingKeys.includes("creatine")) { console.error("✗ creatine missing for boxing"); process.exit(1); }

const weight = recommendErgogenics(prefs, { sport: "strength", type: "strength", durationMin: 60 });
const weightKeys = weight.recommended.map((e) => e.key);
console.log("WEIGHT picks:", weightKeys.join(", "));
if (!weightKeys.includes("creatine")) { console.error("✗ creatine missing for weight"); process.exit(1); }
if (!weightKeys.includes("citrulline")) { console.error("✗ citrulline missing for weight"); process.exit(1); }

// DHA should NOT fire for endurance sports
const run = recommendErgogenics(prefs, { sport: "run", type: "endurance", durationMin: 90, intensity: "z2" });
const runKeys = run.recommended.map((e) => e.key);
console.log("RUN picks:", runKeys.join(", "));
if (runKeys.includes("dha")) { console.error("✗ DHA should not fire for running"); process.exit(1); }

console.log("✓ boxing-ergo-check — all assertions passed");
