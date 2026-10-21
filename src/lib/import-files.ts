/**
 * What an uploaded activity/health file actually is, decided from its BYTES (never from its extension or the
 * `source` field the client sent). Used by /api/import so that an unsupported file gets a clear refusal
 * instead of being read as text and silently importing "0 records".
 */
export type UploadKind = "empty" | "fit" | "zip" | "tcx" | "xml" | "csv" | "binary";

export function sniffUpload(bytes: Uint8Array): UploadKind {
  if (bytes.length === 0) return "empty";
  // FIT: header size 12 or 14, ".FIT" at offset 8.
  if ((bytes[0] === 12 || bytes[0] === 14) && bytes.length >= 12 && bytes[8] === 0x2e && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54) return "fit";
  // ZIP local-file, empty-archive or spanned markers.
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [[3, 4], [5, 6], [7, 8]].some(([a, b]) => bytes[2] === a && bytes[3] === b)) return "zip";
  const head = bytes.subarray(0, 8192);
  if (head.includes(0)) return "binary";
  let text = new TextDecoder("utf-8", { fatal: false }).decode(head);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.trimStart();
  if (text.startsWith("<")) return /<TrainingCenterDatabase[\s>]/.test(text) ? "tcx" : "xml";
  return "csv";
}

type Lang = "en" | "es";
const PROBLEMS: Record<string, { en: string; es: string }> = {
  zip: { en: "ZIP archives are not supported. Unzip the file and upload the .tcx, .fit or Activities.csv inside it.",
    es: "No se admiten archivos ZIP. Descomprime el archivo y sube el .tcx, .fit o Activities.csv que contiene." },
  binary: { en: "This is a binary file this importer does not understand. Upload a .tcx, .fit or Activities.csv export.",
    es: "Es un archivo binario que este importador no entiende. Sube una exportación .tcx, .fit o Activities.csv." },
  empty: { en: "The file is empty.", es: "El archivo está vacío." },
  fit_for_other_source: { en: "FIT activity files are accepted only through the Garmin/COROS import.", es: "Los archivos FIT de actividad solo se aceptan en la importación de Garmin/COROS." },
  not_fit: { en: "This is not a valid FIT file.", es: "No es un archivo FIT válido." },
  integrity_failed: { en: "This FIT file is damaged (its checksum does not match). Export it again.", es: "Este archivo FIT está dañado (su suma de control no coincide). Expórtalo de nuevo." },
  decode_failed: { en: "This FIT file could not be read. Nothing was imported.", es: "No se pudo leer este archivo FIT. No se importó nada." },
  not_activity: { en: "This FIT file is not a completed activity (for example a planned workout or a course). Nothing was imported.", es: "Este archivo FIT no es una actividad completada (por ejemplo, un entrenamiento planificado o un recorrido). No se importó nada." },
  no_session: { en: "This FIT activity has no usable session (start time, duration and a supported sport). Nothing was imported.", es: "Esta actividad FIT no tiene una sesión utilizable (inicio, duración y un deporte compatible). No se importó nada." },
  too_large: { en: "The file exceeds 4 MB. Export a smaller date range.", es: "El archivo supera 4 MB. Exporta un intervalo menor." },
  not_tcx: { en: "This XML file is not a Garmin TCX activity.", es: "Este archivo XML no es una actividad TCX de Garmin." },
  doctype_rejected: { en: "This XML file contains a document-type declaration, which TCX files do not need, so it was refused.", es: "Este XML contiene una declaración de tipo de documento, que los TCX no necesitan, por lo que se rechazó." },
  parse_failed: { en: "This TCX file could not be read. Nothing was imported.", es: "No se pudo leer este archivo TCX. No se importó nada." },
  unrecognized_columns: { en: "This CSV does not have the English Garmin Activities.csv columns (Activity Type, Date, Time). Export a single activity as TCX instead, or switch Garmin Connect to English for the export.",
    es: "Este CSV no tiene las columnas en inglés de Activities.csv de Garmin (Activity Type, Date, Time). Exporta una actividad como TCX, o cambia Garmin Connect a inglés para exportar." },
  empty_csv: { en: "The CSV has no rows.", es: "El CSV no tiene filas." },
};
export function uploadProblem(key: string, lang: Lang): string {
  return (PROBLEMS[key] ?? PROBLEMS.decode_failed)[lang];
}
