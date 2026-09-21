"use client";

// The red trail — inline SVG effort profile of the real session steps.
// Red bars scale with zone; grey = warm-up/cool-down; pink = recoveries.

interface Step {
  name: string;
  seconds: number;
  zone: string;
  phase?: "warmup" | "active" | "recovery" | "cooldown";
}

const RED: Record<string, string> = {
  z1: "#f87171", z2: "#f87171", z3: "#ef4444", z4: "#dc2626",
  z5: "#b91c1c", z6: "#991b1b", z7: "#7f1d1d",
};

export function WorkoutSparkline({ steps }: { steps: Step[] }) {
  const total = steps.reduce((a, s) => a + s.seconds, 0);
  if (!total || steps.length < 3) return null;
  const W = 640, H = 40, GAP = 1.5;
  let cursor = 0;
  return (
    <div className="mb-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-8 rounded-md"
        role="img"
        aria-label="Workout effort profile — red bars scale with intensity"
      >
        {steps.map((s, i) => {
          if (s.seconds <= 0) return null;
          const x = (cursor / total) * W;
          cursor += s.seconds;
          const w = Math.max(2, (s.seconds / total) * W - GAP);
          const fill =
            s.phase === "warmup" || s.phase === "cooldown"
              ? "#cbd5e1"
              : s.phase === "recovery"
                ? "#fca5a5"
                : RED[s.zone] || "#dc2626";
          return <rect key={i} x={x} y={0} width={w} height={H} rx={2} fill={fill} />;
        })}
      </svg>
    </div>
  );
}
