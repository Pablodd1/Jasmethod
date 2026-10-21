import { Resvg } from "@resvg/resvg-js";
import { join } from "node:path";
import {
  endpointText,
  stepColor,
  type UniversalWorkoutCard,
} from "./universal-workout-card";

const esc = (s: string) =>
  s
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(c)))
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
const wrap = (s: string, max = 90) => {
  const lines: string[] = [];
  let line = "";
  for (const word of s.replace(/\s+/g, " ").split(" ")) {
    if (line.length + word.length > max && line) {
      lines.push(line);
      line = "";
    }
    line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  return lines;
};
export function renderUniversalWorkoutSvg(card: UniversalWorkoutCard): string {
  const { session: s, content: c } = card,
    es = card.language === "es";
  const elements: string[] = [];
  let y = 50;
  const text = (value: string, size = 24, color = "#e9f2f4") => {
    for (const line of wrap(value, size >= 40 ? 40 : 88)) {
      elements.push(
        `<text x="36" y="${y}" font-size="${size}" fill="${color}">${esc(line)}</text>`,
      );
      y += size + 8;
    }
  };
  const section = (n: string, title: string) => {
    y += 24;
    elements.push(
      `<rect x="24" y="${y - 30}" width="976" height="48" fill="#17252b"/><rect x="24" y="${y - 30}" width="58" height="48" fill="#ff5938"/>`,
    );
    elements.push(
      `<text x="36" y="${y + 4}" font-size="28" fill="#080d10">${n}</text><text x="100" y="${y + 4}" font-size="28" fill="#fff">${esc(title.toUpperCase())}</text>`,
    );
    y += 54;
  };
  text(s.title.toUpperCase(), 52);
  text(
    `${s.dateLocal} · ${s.timezone} · ${s.sport.toUpperCase()}`,
    24,
    "#a7bec8",
  );
  text(
    `${s.exactTimeSeconds === null ? "~" : ""}${endpointText({ endpoint: { type: "time", seconds: s.exactTimeSeconds ?? s.durationMin * 60 } }, card.language)} · ${s.verdict.toUpperCase()} · REV ${s.revision.slice(0, 8)}`,
    28,
  );
  if (s.verdict !== "ready") text(s.reason);
  section("01", es ? "La secuencia" : "The flow");
  const total = s.exactTimeSeconds;
  if (total && s.steps.every((st) => st.endpoint.type === "time")) {
    let x = 36;
    const bottom = y + 130;
    for (const step of s.steps) {
      const w = (952 * step.seconds) / total,
        h = 24 + Number(step.zone.slice(1)) * 15;
      elements.push(
        `<rect x="${x}" y="${bottom - h}" width="${w}" height="${h}" fill="${stepColor(step)}" stroke="#080d10" stroke-width="1"><title>${esc(step.name)} · ${endpointText(step, card.language)}</title></rect>`,
      );
      x += w;
    }
    y = bottom + 35;
    text(
      es
        ? "Anchura = tiempo prescrito; altura = zona del plan, no fisiología medida."
        : "Width = prescribed time; height = planning zone, not measured physiology.",
      20,
      "#a7bec8",
    );
  } else
    text(
      es
        ? "Pasos por distancia, repeticiones o LAP: no hay escala temporal exacta."
        : "Distance, repetition or LAP endpoints: exact time scale unavailable.",
      22,
      "#a7bec8",
    );
  section("02", es ? "Los detalles" : "The details");
  s.steps.forEach((step, i) => {
    text(
      `${i + 1}. ${step.name} · ${endpointText(step, card.language)} · ${step.zone.toUpperCase()}`,
      26,
      stepColor(step),
    );
    text(c.steps[i] || step.target.label, 21);
    y += 10;
  });
  section("03", es ? "Objetivos por paso" : "Step targets");
  for (const type of ["pace", "power", "heartRate", "RPE"]) {
    const labels = [
      ...new Set(
        s.steps
          .filter((step) =>
            type === "RPE"
              ? /RPE \d+\/10/.test(step.target.label)
              : step.target.type === type,
          )
          .map((step) =>
            type === "RPE"
              ? /RPE \d+\/10/.exec(step.target.label)![0]
              : step.target.label,
          ),
      ),
    ];
    text(
      `${type}: ${labels.length ? labels.join(" · ") : es ? "No indicado" : "Not supplied"}`,
      22,
    );
  }
  section("04", es ? "Alimentación y apoyo" : "Fuel & support");
  for (const [title, items] of [
    [es ? "ANTES" : "PRE-WORKOUT", c.before],
    [es ? "DURANTE" : "DURING", c.during],
    [es ? "DESPUÉS" : "POST-WORKOUT", c.after],
  ] as const) {
    text(title, 28, "#f7c84a");
    items.forEach((item) => text(item, 22));
    y += 14;
  }
  section("05", es ? "Respira y recupera" : "Breathe & recover");
  text(card.breathing.instructions);
  text(card.breathing.limitation, 22, "#a7bec8");
  text(
    es
      ? "Consulta la revisión vigente en JMM antes de entrenar."
      : "Review the current revision in JMM before training.",
    22,
    "#a7bec8",
  );
  if (y > 20000)
    throw Error(
      "Workout card is too long for image export. Use the interactive or print view.",
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="${y + 30}" viewBox="0 0 1024 ${y + 30}"><rect width="1024" height="${y + 30}" fill="#080f13"/><g font-family="Barlow Condensed">${elements.join("")}</g></svg>`;
}
export function renderUniversalWorkoutPng(card: UniversalWorkoutCard): Buffer {
  return Buffer.from(
    new Resvg(renderUniversalWorkoutSvg(card), {
      font: {
        fontFiles: [
          join(process.cwd(), "public/fonts/BarlowCondensed-SemiBold.ttf"),
        ],
        loadSystemFonts: false,
        defaultFontFamily: "Barlow Condensed",
      },
    })
      .render()
      .asPng(),
  );
}
