/** Local, read-only preview. No environment-file loading, database or network access. */
import { basename } from "node:path";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { parseArgs } from "node:util";
import { GARMIN_FILE_MAX_BYTES, parseGarminFile, type GarminFileInput } from "../src/lib/garmin-file-import";

const usage = `Read-only Garmin file preview (nothing is saved).
Usage: node --import tsx scripts/preview-garmin-file.ts --file <Activities.csv|activity.tcx>
  --timezone <IANA zone>                 Required for CSV, e.g. Europe/Madrid
  --unit-system <metric|imperial>         Required for CSV
  --number-format <decimal-dot|decimal-comma>
  --distance-unit <km|mi|m|yd>            Optional explicit non-swimming unit
  --swim-distance-unit <km|mi|m|yd>       Required for unlabeled swim distances

CSV numeric separators require an explicit number format. FIT/ZIP are not supported.
To save, sign in to JMM → Connections → Garmin file import and review/confirm there.
The old <email> <file> direct-database command is not supported.`;

function readBoundedFile(file: string): Uint8Array {
  // Don't block on a FIFO/device or follow a symbolic link. Bound the read itself
  // as well as stat size so a growing file cannot exhaust memory.
  const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error("Select a regular file, not a directory, link or device.");
    if (stat.size > GARMIN_FILE_MAX_BYTES) throw new Error("File must be at most 10 MiB.");
    const buffer = Buffer.alloc(GARMIN_FILE_MAX_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    if (offset > GARMIN_FILE_MAX_BYTES) throw new Error("File must be at most 10 MiB.");
    return buffer.subarray(0, offset);
  } finally { closeSync(fd); }
}

try {
  const { values } = parseArgs({ options: {
    file: { type: "string" }, timezone: { type: "string" },
    "unit-system": { type: "string" }, "number-format": { type: "string" },
    "distance-unit": { type: "string" }, "swim-distance-unit": { type: "string" },
    help: { type: "boolean", short: "h" },
  }, strict: true, allowPositionals: false });
  if (values.help) console.log(usage);
  else {
    if (!values.file) throw new Error("--file is required. Use --help for the read-only preview options.");
    const result = parseGarminFile({ filename: basename(values.file), content: readBoundedFile(values.file), timezone: values.timezone,
      unitSystem: values["unit-system"] as GarminFileInput["unitSystem"], numberFormat: values["number-format"] as GarminFileInput["numberFormat"],
      distanceUnit: values["distance-unit"] as GarminFileInput["distanceUnit"], swimDistanceUnit: values["swim-distance-unit"] as GarminFileInput["swimDistanceUnit"],
    });
    console.log(JSON.stringify({ saved: false, guidance: "This is a local preview only. Save through authenticated JMM Connections → Garmin file import after reviewing and confirming its preview.", ...result }, null, 2));
    if (result.fatal || result.rejectedRecords > 0 || result.workouts.length === 0) process.exitCode = 1;
  }
} catch (error) {
  // Avoid echoing arbitrary file paths, file contents or credential-bearing errors.
  console.error(error instanceof Error && !('path' in error) ? error.message : "The selected local file could not be read safely.");
  process.exitCode = 1;
}
