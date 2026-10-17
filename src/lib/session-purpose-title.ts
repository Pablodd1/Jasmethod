/** Never advertise strides when the saved executable steps contain none. */
export function sessionPurposeTitle(title: string, steps: readonly {name: string; phase: string}[]) {
  if (!steps.length || !/\s*\+\s*strides\b/i.test(title) || steps.some(step => step.phase === 'active' && /\bstrides?\b/i.test(step.name))) return title;
  return title.replace(/\s*\+\s*strides\b/ig, '').trim();
}
