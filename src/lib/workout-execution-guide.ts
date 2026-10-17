import type { CanonicalStep, SessionSport } from "./canonical-session";

/** Display references from the canonical step; never create a second prescription. */
export function stepExecutionGuide(step: CanonicalStep, sessionSport: SessionSport, es = false) {
  const sport = step.componentSport ?? sessionSport;
  const effort = /RPE\s+(\d+(?:[–-]\d+)?)\/10/.exec(step.target.label)?.[0] ??
    `RPE ${[0, 2, 3, 5, 7, 8, 9, 10][Number(step.zone.slice(1))]}/10 ${es ? "(referencia de zona)" : "(zone reference)"}`;
  const phase = step.phase === "warmup" ? (es ? "Empieza suave y progresa dentro del objetivo indicado." : "Start gently and build within the stated target.") :
    step.phase === "recovery" ? (es ? "Reduce el esfuerzo; completa esta recuperación antes del siguiente esfuerzo." : "Ease off; complete this recovery before the next effort.") :
    step.phase === "cooldown" ? (es ? "Reduce el esfuerzo de forma gradual hasta terminar." : "Ease down gradually through the finish.") :
    (es ? "Sigue el objetivo indicado y completa cada recuperación antes de repetir el esfuerzo." : "Follow the stated target and complete each recovery before repeating the effort.");
  const technique = sport === "swim" ? (es ? "Prioriza técnica y respiración controlada. Usa ritmo por distancia si está prescrito; la FC solo si hay un objetivo específico de natación y un sensor fiable." : "Keep technique and breathing controlled. Follow prescribed pace per distance when available; use HR only with a swim-specific target and a reliable sensor.") :
    sport === "bike" ? (es ? "Sigue los vatios prescritos si tienes potenciómetro; de lo contrario, sigue el objetivo de FC o esfuerzo. Adapta la velocidad al terreno y al tráfico." : "Follow prescribed watts with a power meter; otherwise follow the HR or effort target. Let speed vary with terrain and traffic.") :
    sport === "run" ? (es ? "Sigue el ritmo, la FC o los vatios que aparecen en este paso. La potencia requiere sensor y referencia de carrera; no se usa el FTP de ciclismo." : "Follow the pace, HR or watts shown for this step. Running power requires a sensor and a running reference; cycling FTP is not used.") :
    sport === "hyrox" || sport === "strength" ? (es ? "Respeta el movimiento, repeticiones, carga y descanso prescritos. Mantén la técnica; no conviertas los vatios de carrera en carga de estación." : "Follow the prescribed movement, repetitions, load and rest. Maintain technique; running watts are not a station load.") :
    (es ? "Sigue el movimiento y el esfuerzo indicados, sin añadir intensidad." : "Follow the stated movement and effort without adding intensity.");
  return { target: step.target.label, effort, phase, technique };
}
