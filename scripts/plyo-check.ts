// Quick verification: plyometrics 1-2x/week present in every generator.
import { generatePlan, generateHyroxPlan, generateSingleSport } from "../src/lib/science";

const start = new Date("2026-09-07");
const tri = generatePlan({ level: "amateur", distance: "olympic", weeks: 12, startDate: start });
const perWeek = tri.map((w) => ({ week: w.week, plyo: w.sessions.filter((s) => s.type === "plyo").length }));
console.log("TRI — dedicated plyo sessions per week:", perWeek.map((p) => `w${p.week}:${p.plyo}`).join(" "));

const hy = generateHyroxPlan({ level: "amateur", weeks: 12, startDate: start });
const hyPlyo = hy.filter((w) => w.sessions.some((s) => s.description.toLowerCase().includes("plyometric"))).length;
console.log("HYROX — weeks containing plyometric prescriptions:", hyPlyo + "/12");

const run = generateSingleSport({ sport: "run", level: "amateur", weeks: 6, startDate: start });
const runPlyo = run.every((w) => w.sessions.some((s) => s.description.toLowerCase().includes("plyometric")));
console.log("RUN-ONLY — every week has plyo prescription:", runPlyo);
