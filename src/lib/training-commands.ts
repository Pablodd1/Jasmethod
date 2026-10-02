// JasMiamiMethod — JASAI Training Command Parser
// Athletes can talk or type to modify today's training:
//   "make it easier" → reduce intensity
//   "add 2 more reps" → add volume
//   "remove the last set" → reduce volume
//   "I'm sore, change to recovery" → substitute
//   "swap running for swimming" → cross-train
//   "make it a rest day" → full rest
//   "I feel great, can I go harder?" → conditional escalation

export type TrainingCommand =
  | "ADD_REPS"
  | "REMOVE_REPS"
  | "REDUCE_INTENSITY"
  | "INCREASE_INTENSITY"
  | "REST_DAY"
  | "SUBSTITUTE_SPORT"
  | "RECOVERY_MODE"
  | "CHANGE_DURATION"
  | "NO_CHANGE";

export interface ParsedCommand {
  command: TrainingCommand;
  value?: number;
  sport?: string;
  confidence: number;
  originalText: string;
}

export function parseTrainingCommand(text: string): ParsedCommand {
  const t = text.toLowerCase().trim();

  // QUESTIONS ARE NOT COMMANDS — reproduce-guard: "What is a rest day?" used
  // to trigger REST_DAY. A question only carries a command when it also holds
  // an explicit imperative verb ("can you make it easier?" is both).
  const isQuestion =
    /\?\s*$/.test(t) ||
    /^(what|why|how|when|who|where|which|is|are|do|does|did|can|could|should|would|will|what's|whats|qué|que|cómo|como|cuándo|cuando|quién|quien|dónde|donde|por qué|es|está|puedo|puede|debería)\b/.test(t);
  const hasImperative =
    /\b(make|swap|switch|add|remove|drop|cancel|skip|set|turn|convert|increase|reduce|lower|change|haz|hacer|cambia|cambiar|añade|añadir|agrega|quita|quitar|baja|sube|pon|convierte)\b/.test(t);
  if (isQuestion && !hasImperative) {
    return { command: "NO_CHANGE", confidence: 0.2, originalText: text };
  }

  // NEGATION GUARD — "Do not cancel my workout" / "I do not need a rest day"
  // used to trigger edits. A negated action (within a short window before the
  // action word) is an instruction to NOT act, i.e. NO_CHANGE.
  if (
    /\b(do not|don'?t|dont|never|no|not|avoid)\b[^.?!]{0,24}\b(cancel|skip|rest|rest day|day off|remove|drop|change|reduce|increase|delete|quit|modify|touch|remove)\b/.test(t) ||
    /\b(cancel|skip|rest day|day off)\b[^.?!]{0,24}\b(no|not|never|needed)\b/.test(t)
  ) {
    return { command: "NO_CHANGE", confidence: 0.2, originalText: text };
  }

  // REST DAY — explicit intent only ("make it a rest day", "I need a rest
  // day", "I'm sick", "cancel today's workout"). Bare keyword presence is not
  // enough: "rest"/"cancel" appear in questions and negations handled above.
  if (/(make it|turn this|convert|convierte|haz).*(rest|descanso|day off)|i (need|want|am|feel).*(rest|descanso|sick|enfermo|too tired)|rest day|día de descanso|dia de descanso|i'?m sick|estoy enfermo|(skip|cancel|saltar|cancelar)\b.{0,30}\b(today|workout|session|training|entreno|hoy)/.test(t)) {
    return { command: "REST_DAY", confidence: 0.9, originalText: text };
  }

  // RECOVERY MODE
  if (/(recovery|recuper|easy|suave|light|ligero|zone 1|z1|recovery day|active recovery)/.test(t)) {
    return { command: "RECOVERY_MODE", confidence: 0.85, originalText: text };
  }

  // SUBSTITUTE SPORT
  const sportMatch = t.match(/(?:swap|change|switch|cambiar|cambia).*(?:to|for|por)\s+(swim|bike|run|swimming|cycling|running|pool|nadar|bici|correr)/);
  if (sportMatch) {
    const s = sportMatch[1];
    const sport = s.includes("swim") || s.includes("pool") || s.includes("nadar") ? "swim"
      : s.includes("bike") || s.includes("cycl") || s.includes("bici") ? "bike"
      : "run";
    return { command: "SUBSTITUTE_SPORT", sport, confidence: 0.9, originalText: text };
  }

  // ADD REPS
  const addMatch = t.match(/(?:add|añadir|agregar|más|one more|two more|dos más)\s*(\d+)?\s*(?:rep|reps|set|sets|repe|series|interv)/);
  if (addMatch) {
    const n = addMatch[1] ? parseInt(addMatch[1]) : 1;
    return { command: "ADD_REPS", value: n, confidence: 0.9, originalText: text };
  }

  // REMOVE REPS
  const removeMatch = t.match(/(?:remove|quitar|less|menos|drop|skip|saltar)\s*(\d+)?\s*(?:rep|reps|set|sets|repe|series|interv|last)/);
  if (removeMatch) {
    const n = removeMatch[1] ? parseInt(removeMatch[1]) : 1;
    return { command: "REMOVE_REPS", value: n, confidence: 0.9, originalText: text };
  }

  // INCREASE INTENSITY (only if multiple positive signals)
  if (/(harder|más duro|increase|aumentar|faster|más rápido|more intensity|go up|sube)/.test(t)) {
    return { command: "INCREASE_INTENSITY", confidence: 0.7, originalText: text };
  }

  // REDUCE INTENSITY
  if (/(easier|más fácil|reduce|bajar|lower|slow down|menos|intensity down|baja)/.test(t)) {
    return { command: "REDUCE_INTENSITY", confidence: 0.85, originalText: text };
  }

  // CHANGE DURATION
  const durationMatch = t.match(/(?:make it|hacer|cambiar|change)\s*(\d+)\s*(?:min|minutes|minutos|hour|hora)/);
  if (durationMatch) {
    return { command: "CHANGE_DURATION", value: parseInt(durationMatch[1]), confidence: 0.85, originalText: text };
  }

  return { command: "NO_CHANGE", confidence: 0.3, originalText: text };
}

// Apply the command to a prescription — returns the adjusted version
export function applyTrainingCommand(
  prescription: any,
  cmd: ParsedCommand,
  context: { readinessScore?: number; hrvStatus?: string; soreness?: number },
): { adjusted: any; explanation: string; allowed: boolean } {
  const p = JSON.parse(JSON.stringify(prescription)); // deep copy

  switch (cmd.command) {
    case "REST_DAY": {
      p.session.title = "Rest day";
      p.session.mainSet = [];
      p.steps = [];
      p.verdict = "rest";
      p.durationMin = 0;
      p.session.type = "recovery";
      p.session.durationMin = 0;
      p.session.totalQualityMeters = 0;
      return { adjusted: p, explanation: "Rest requested. No exercise is prescribed; review any symptoms or restrictions before resuming.", allowed: true };
    }

    case "RECOVERY_MODE": {
      p.session.mainSet = p.session.mainSet.map((s: string) =>
        s.replace(/\d+%.*max velocity/g, "60-65% max velocity (recovery pace)")
      );
      p.session.title += " (Recovery)";
      p.session.totalQualityMeters = Math.round(p.session.totalQualityMeters * 0.5);
      return { adjusted: p, explanation: "Intensity capped to recovery zone (Z1). Volume halved. The session structure is preserved but the stimulus is gentle.", allowed: true };
    }

    case "SUBSTITUTE_SPORT": {
      if (cmd.sport === "swim") {
        p.session.title = `Alt: Swim Session (same energy system)`;
        p.session.mainSet = ["8×100m easy-moderate with 20s rest", "Focus: technique, body line, breathing rhythm"];
        p.session.type = "endurance";
        return { adjusted: p, explanation: "Swimming preserves the aerobic stimulus with zero impact. Great for sore legs or hot days.", allowed: true };
      }
      if (cmd.sport === "bike") {
        p.session.title = `Alt: Bike Session (same energy system)`;
        p.session.mainSet = ["40 min steady Z2, cadence 85-95", "Zero impact — same aerobic engine work"];
        p.session.type = "endurance";
        return { adjusted: p, explanation: "Cycling preserves the aerobic engine without the eccentric muscle damage of running.", allowed: true };
      }
      return { adjusted: p, explanation: "Same sport maintained — already a run session.", allowed: false };
    }

    case "ADD_REPS": {
      return { adjusted: p, explanation: "Adding volume needs a reviewed recent training baseline, current safety check and recovery context. Keep the current plan until that review.", allowed: false };
    }

    case "REMOVE_REPS": {
      p.session.mainSet = p.session.mainSet.map((s: string) => {
        const m = s.match(/(\d+)×/);
        if (m) {
          const current = parseInt(m[1]);
          const newN = Math.max(1, current - (cmd.value || 1));
          return s.replace(`${m[1]}×`, `${newN}×`);
        }
        return s;
      });
      p.session.totalQualityMeters = Math.max(0, p.session.totalQualityMeters - 40 * (cmd.value || 1));
      return { adjusted: p, explanation: `Removed ${cmd.value || 1} rep(s). Better to do fewer reps with quality than grind through fatigue.`, allowed: true };
    }

    case "INCREASE_INTENSITY": {
      return { adjusted: p, explanation: "Readiness or HRV alone cannot clear harder training. Request a reviewed plan change with current symptoms, recent tolerated load and goals.", allowed: false };
    }

    case "REDUCE_INTENSITY": {
      p.session.mainSet = p.session.mainSet.map((s: string) =>
        s.replace(/(\d+)%\s*max velocity/g, (match, pct) => `${Math.max(50, parseInt(pct) - 15)}% max velocity`)
      );
      p.session.title += " (Reduced)";
      return { adjusted: p, explanation: "Intensity reduced by 15%. Sometimes the best training decision is to back off.", allowed: true };
    }

    case "CHANGE_DURATION": {
      if (!cmd.value || cmd.value < 20 || cmd.value > 180) {
        return { adjusted: p, explanation: "Duration must be between 20 and 180 minutes.", allowed: false };
      }
      if (!Number.isFinite(p.session.durationMin) || cmd.value > p.session.durationMin) {
        return { adjusted: p, explanation: "A longer session needs a reviewed recent training baseline and current safety context. This command cannot increase your prescribed duration.", allowed: false };
      }
      p.session.durationMin = cmd.value;
      return { adjusted: p, explanation: `Duration set to ${cmd.value} minutes.`, allowed: true };
    }

    default:
      return { adjusted: p, explanation: "I didn't catch a training modification. Try: 'make it easier', 'add 2 reps', 'rest day', or 'swap to swim'.", allowed: false };
  }
}
