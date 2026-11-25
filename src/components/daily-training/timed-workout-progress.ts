type TimedStep = { seconds: number };

export function timedWorkoutProgress(steps: readonly TimedStep[], elapsedSeconds: number) {
  const totalSeconds = steps.reduce((total, step) => total + step.seconds, 0);
  const elapsed = Math.min(totalSeconds, Math.max(0, elapsedSeconds));
  let end = 0;
  for (const [index, step] of steps.entries()) {
    end += step.seconds;
    if (elapsed < end) return { index, elapsed, remaining: Math.ceil(end - elapsed), complete: false };
  }
  return { index: Math.max(0, steps.length - 1), elapsed, remaining: 0, complete: steps.length > 0 };
}
