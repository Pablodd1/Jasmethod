// Schema examples only. These are never saved until an athlete explicitly applies
// their edited JSON. Numbers are illustrative, not individualized prescriptions.
export const SPORT_STRUCTURE_EXAMPLES: Record<string, { label: string; structure: Record<string, unknown> }> = {
  swim: {
    label: "Pool swim",
    structure: {
      schemaVersion: 1, kind: "pool", poolLength: { value: 25, unit: "m" },
      steps: [
        { kind: "lengths", name: "Easy swim", phase: "warmup", zone: "z1", lengths: 4, stroke: "freestyle", estimatedSeconds: 120, note: "Illustrative example: adjust lengths and effort to your actual plan." },
        { kind: "rest", seconds: 30 },
        { kind: "lengths", name: "Main set", phase: "active", zone: "z2", lengths: 8, stroke: "freestyle", estimatedSeconds: 240 },
        { kind: "rest", seconds: 30 },
        { kind: "lengths", name: "Easy finish", phase: "cooldown", zone: "z1", lengths: 4, stroke: "backstroke", estimatedSeconds: 120 },
      ],
    },
  },
  strength: {
    label: "Strength",
    structure: {
      schemaVersion: 1, kind: "strength",
      steps: [
        { kind: "step", name: "Warmup", phase: "warmup", zone: "z1", endpoint: { type: "time", seconds: 120 } },
        { kind: "set", exerciseId: "squat", exerciseName: "Goblet squat", setNumber: 1, zone: "z2", endpoint: { type: "reps", reps: 5 }, load: { value: 10, unit: "kg" }, estimatedSeconds: 30, note: "Illustrative example: choose your reviewed exercise and load." },
        { kind: "rest", seconds: 60 },
        { kind: "set", exerciseId: "squat", exerciseName: "Goblet squat", setNumber: 2, zone: "z2", endpoint: { type: "reps", reps: 5 }, load: { value: 10, unit: "kg" }, estimatedSeconds: 30 },
        { kind: "step", name: "Cooldown", phase: "cooldown", zone: "z1", endpoint: { type: "time", seconds: 120 } },
      ],
    },
  },
  hyrox: {
    label: "HYROX",
    structure: {
      schemaVersion: 1, kind: "hyrox",
      steps: [
        { kind: "step", name: "Warmup", phase: "warmup", zone: "z1", endpoint: { type: "time", seconds: 120 } },
        { kind: "run", name: "Run 1", zone: "z2", endpoint: { type: "distance", meters: 1000 }, estimatedSeconds: 360 },
        { kind: "station", stationId: "wall-balls", name: "Wall balls", zone: "z2", endpoint: { type: "reps", reps: 10 }, load: { value: 4, unit: "kg" }, estimatedSeconds: 60, note: "Illustrative station: adjust to your actual plan." },
        { kind: "rest", seconds: 60 },
        { kind: "step", name: "Cooldown", phase: "cooldown", zone: "z1", endpoint: { type: "time", seconds: 120 } },
      ],
    },
  },
  brick: {
    label: "Brick",
    structure: {
      schemaVersion: 1, kind: "brick",
      components: [
        { id: "bike-1", title: "Bike", sport: "bike", durationMin: 10, steps: [{ name: "Easy ride", seconds: 600, phase: "active", zone: "z2", endpoint: { type: "time", seconds: 600 }, target: { type: "open" } }] },
        { id: "run-1", title: "Run", sport: "run", durationMin: 10, steps: [{ name: "Easy run", seconds: 600, phase: "active", zone: "z2", endpoint: { type: "time", seconds: 600 }, target: { type: "open" } }] },
      ],
      transitions: [{ afterComponentId: "bike-1", instruction: "Change shoes, then start the run component", endpoint: { type: "lap" } }],
    },
  },
};
