// The old email + CSV command wrote directly to the database with guessed units
// and dates. It is intentionally disabled; never load credentials or Prisma here.
console.error([
  "Direct Garmin database import has been retired; no file was read and nothing was saved.",
  "Preview locally with:",
  "  node --import tsx scripts/preview-garmin-file.ts --file Activities.csv --timezone America/New_York --unit-system metric --number-format decimal-dot",
  "For unlabeled swimming distances add --swim-distance-unit m (or yd/km/mi, as exported).",
  "To save activities, sign in to JMM → Connections → Garmin file import, review the preview and explicitly confirm it.",
  "The old <email> <file> syntax is not supported.",
].join("\n"));
process.exitCode = 1;
