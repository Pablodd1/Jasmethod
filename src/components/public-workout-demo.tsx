"use client";

import { useState } from "react";

type Label = readonly [string, string];
type Block = readonly [Label, number, number];

const examples: { sport: Label; main: Label; blocks: Block[]; shorter: Block[]; change: Label }[] = [
  { sport: ["Run", "Carrera"], main: ["3 × 8 min controlled threshold, 2 min easy jog between", "3 × 8 min a umbral controlado, 2 min de trote suave entre series"],
    blocks: [[["Threshold", "Umbral"], 8, 4], [["Easy jog", "Trote suave"], 2, 1], [["Threshold", "Umbral"], 8, 4], [["Easy jog", "Trote suave"], 2, 1], [["Threshold", "Umbral"], 8, 4]],
    shorter: [[["Steady aerobic run", "Carrera aeróbica estable"], 20, 2]],
    change: ["Switch to aerobic work and keep time to warm up and cool down.", "Cambia a trabajo aeróbico y conserva tiempo para calentar y terminar suave."] },
  { sport: ["Bike", "Ciclismo"], main: ["3 × 8 min steady aerobic work, 2 min easy spin between", "3 × 8 min de trabajo aeróbico estable, 2 min de pedaleo suave entre series"],
    blocks: [[["Steady spin", "Pedaleo estable"], 8, 2], [["Easy spin", "Pedaleo suave"], 2, 1], [["Steady spin", "Pedaleo estable"], 8, 2], [["Easy spin", "Pedaleo suave"], 2, 1], [["Steady spin", "Pedaleo estable"], 8, 2]],
    shorter: [[["Steady spin", "Pedaleo estable"], 20, 2]],
    change: ["Keep the aerobic goal and shorten the steady work.", "Conserva el objetivo aeróbico y acorta el trabajo estable."] },
  { sport: ["Swim", "Natación"], main: ["Easy technique and relaxed aerobic swimming", "Técnica suave y natación aeróbica relajada"],
    blocks: [[["Familiar technique drills", "Ejercicios de técnica conocidos"], 10, 1], [["Relaxed aerobic lengths", "Largos aeróbicos suaves"], 18, 2]],
    shorter: [[["Familiar technique drills", "Ejercicios de técnica conocidos"], 5, 1], [["Relaxed aerobic lengths", "Largos aeróbicos suaves"], 15, 2]],
    change: ["Trim the aerobic block and keep technique practice.", "Acorta el bloque aeróbico y conserva la práctica técnica."] },
  { sport: ["Triathlon", "Triatlón"], main: ["Bike–run brick with a distinct transition", "Sesión bici-carrera con una transición definida"],
    blocks: [[["Steady bike", "Ciclismo estable"], 25, 2], [["Transition", "Transición"], 3, 1], [["Easy run", "Carrera suave"], 10, 2]],
    shorter: [[["Steady bike", "Ciclismo estable"], 12, 2], [["Transition", "Transición"], 3, 1], [["Easy run", "Carrera suave"], 5, 2]],
    change: ["Shorten both legs and keep transition practice.", "Acorta ambos segmentos y conserva la práctica de transición."] },
  { sport: ["HYROX", "HYROX"], main: ["Controlled run-to-station technique", "Técnica controlada de carrera a estación"],
    blocks: [[["Easy run", "Carrera suave"], 8, 2], [["Unloaded station practice", "Práctica de estación sin carga"], 6, 1], [["Easy run", "Carrera suave"], 8, 2], [["Unloaded station practice", "Práctica de estación sin carga"], 6, 1]],
    shorter: [[["Easy run", "Carrera suave"], 12, 2], [["Unloaded station practice", "Práctica de estación sin carga"], 8, 1]],
    change: ["Keep one run-to-station transition and reduce the total work.", "Conserva una transición de carrera a estación y reduce el trabajo total."] },
];

export function PublicWorkoutDemo({ es }: { es: boolean }) {
  const [sport, setSport] = useState(0);
  const [short, setShort] = useState(false);
  const example = examples[sport];
  const label = (pair: Label) => pair[es ? 1 : 0];
  const blocks: Block[] = [
    [["Easy preparation", "Preparación suave"], short ? 15 : 25, 1],
    ...(short ? example.shorter : example.blocks),
    [["Easy cool-down", "Vuelta a la calma"], 10, 1],
  ];
  const total = blocks.reduce((minutes, block) => minutes + block[1], 0);
  return (
    <section id="workout-demo" className="website-session" aria-labelledby="workout-demo-title">
      <h2 id="workout-demo-title">{label(["Explore a sample workout", "Explora una sesión de ejemplo"])}</h2>
      <p>{label(["Illustrative workout with sample data.", "Sesión ilustrativa con datos de ejemplo."])}</p>
      <label className="block">
        {label(["Sport", "Deporte"])}
        <select className="website-language ml-2" value={sport} onChange={event => setSport(Number(event.target.value))}>
          {examples.map((item, index) => <option key={item.sport[0]} value={index}>{label(item.sport)}</option>)}
        </select>
      </label>
      <button type="button" className="website-text-link min-h-11" aria-pressed={short} onClick={() => setShort(value => !value)}>
        {label(["I only have 45 minutes", "Solo tengo 45 minutos"])}
      </button>
      <div aria-live="polite">
        <p><strong>{total} min</strong> · {label(short ? example.change : example.main)}</p>
        <div className="my-3 flex h-16 items-end gap-1" aria-hidden="true">
          {blocks.map((block, index) => <span key={index} className="rounded-t bg-current" style={{ flex: block[1], height: `${20 + block[2] * 18}%` }} />)}
        </div>
        <ol>
          {blocks.map(([name, minutes], index) => <li key={index}><span>{minutes} min</span><strong>{label(name)}</strong></li>)}
        </ol>
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer">{label(["Prep, fueling and recovery", "Preparación, alimentación y recuperación"])}</summary>
        <p>{label(["Before: check time, equipment and how you feel. During: use familiar fluids and fuel as appropriate. After: cool down and record what you completed and how hard it felt.", "Antes: revisa tiempo, equipo y cómo te sientes. Durante: usa líquidos y alimentos habituales según tus necesidades. Después: termina suave y registra lo que hiciste y el esfuerzo."])}</p>
      </details>
    </section>
  );
}
