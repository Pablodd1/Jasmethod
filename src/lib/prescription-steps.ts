import type { EditableStep } from "./workout-interval-edit";

function parsePrescription(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

/** Steps of a stored prescription, with repeat nodes expanded. null when there are no explicit steps. */
export function prescriptionSteps(prescription: unknown): EditableStep[] | null {
  const p = typeof prescription === "string" ? parsePrescription(prescription) : prescription;
  if (!p || typeof p !== "object") return null;
  const raw = p.sportStructure?.kind === "endurance" && Array.isArray(p.sportStructure.steps) ? p.sportStructure.steps : p.steps;
  if (!Array.isArray(raw) || !raw.length) return null;
  const out: EditableStep[] = [];
  const expand = (nodes: any[], depth = 0): boolean => {
    if (depth > 4) return false;
    for (const node of nodes) {
      if (!node || typeof node !== "object") return false;
      if (node.repeat !== undefined) {
        const n = Number(node.repeat);
        if (!Number.isInteger(n) || n < 1 || n > 100 || !Array.isArray(node.steps)) return false;
        for (let i = 0; i < n; i++) if (!expand(node.steps, depth + 1)) return false;
      } else { out.push(node as EditableStep); if (out.length > 1000) return false; }
    }
    return true;
  };
  return expand(raw) ? out : null;
}
