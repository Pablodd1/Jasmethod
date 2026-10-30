/** Never advertise strides when the saved executable steps contain none. */
export function sessionPurposeTitle(title: string, steps: readonly {name: string; phase: string}[]) {
  if (!steps.length || !/\s*\+\s*strides\b/i.test(title) || steps.some(step => step.phase === 'active' && /\bstrides?\b/i.test(step.name))) return title;
  return title.replace(/\s*\+\s*strides\b/ig, '').trim();
}

/** Repair display identity only; never reconstruct steps after a sport edit. */
export function sportConsistentTitle(title: string, sport: string): string {
  const prefix = /^\s*(run|bike|swim|strength|hyrox|mobility|recovery|brick|boxing)\s*:/i.exec(title)?.[1].toLowerCase();
  return prefix && prefix !== sport ? `${sport.charAt(0).toUpperCase()}${sport.slice(1)} session` : title;
}
