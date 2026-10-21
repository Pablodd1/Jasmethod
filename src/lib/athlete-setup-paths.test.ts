import assert from "node:assert/strict";
import test from "node:test";
import {
  IMPORT_FILE_FORMATS, ROW_COPY, SECTION_COPY, STATUS_LABEL, buildSetupPaths, formatCount, rowCopy, statusLabel,
  type SetupInputs, type SetupRow,
} from "./athlete-setup-paths";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600000).toISOString();
const inputs = (over: Partial<SetupInputs> = {}): SetupInputs => ({ now: NOW, providers: [], capabilities: { intervalsConnector: false }, stored: [], ...over });
const find = (rows: SetupRow[], id: string) => { const row = rows.find(r => r.id === id); assert.ok(row, `row ${id} missing`); return row; };
const all = (paths: ReturnType<typeof buildSetupPaths>) => [...paths.import, ...paths.receive];

test("there are exactly two sections and nothing is required to finish", () => {
  const paths = buildSetupPaths(inputs());
  assert.equal(paths.canFinishWithoutAnyConnection, true);
  assert.ok(paths.import.every(r => r.section === "import"));
  assert.ok(paths.receive.every(r => r.section === "receive"));
  assert.deepEqual(Object.keys(SECTION_COPY).sort(), ["import", "receive"]);
});

test("Garmin is manual import only: no authorization, no publication, no device delivery", () => {
  const garmin = find(buildSetupPaths(inputs()).import, "garmin");
  assert.equal(garmin.authorization, "not_required");
  assert.equal(garmin.publication, "not_applicable");
  assert.equal(garmin.deviceDelivery, "not_applicable");
  assert.equal(garmin.action.kind, "file");
  const direct = find(buildSetupPaths(inputs()).receive, "garmin_direct");
  assert.equal(direct.publication, "unavailable");
  assert.equal(direct.authorization, "unavailable");
});

test("accepted formats list FIT (decoded by the official SDK) but never ZIP (no safe reader exists)", () => {
  assert.ok(IMPORT_FILE_FORMATS.garmin.includes(".fit"));
  assert.ok(!IMPORT_FILE_FORMATS.garmin.some(ext => /zip/.test(ext)));
});

test("authorization, import, publication and device delivery are independent", () => {
  // Authorized but nothing imported yet.
  let strava = find(buildSetupPaths(inputs({ providers: [{ id: "strava", status: "connected", configured: true, method: "oauth", lastSyncAt: null }], stored: [] })).import, "strava");
  assert.equal(strava.authorization, "authorized");
  assert.equal(strava.import, "no_records");
  // Disconnected but history is still stored: import is not erased by revocation.
  strava = find(buildSetupPaths(inputs({ providers: [{ id: "strava", status: "disconnected", configured: true, method: "oauth" }], stored: [{ source: "strava", count: 42, latestAt: hoursAgo(100) }] })).import, "strava");
  assert.equal(strava.authorization, "not_authorized");
  assert.equal(strava.import, "records_stored");
  assert.equal(strava.storedCount, 42);
  // Authorized with stored records but no sync for more than 26 h.
  strava = find(buildSetupPaths(inputs({ providers: [{ id: "strava", status: "connected", configured: true, method: "oauth", lastSyncAt: hoursAgo(30) }], stored: [{ source: "strava", count: 3, latestAt: hoursAgo(30) }] })).import, "strava");
  assert.equal(strava.import, "stale");
  // Import failure does not rewrite authorization.
  strava = find(buildSetupPaths(inputs({ providers: [{ id: "strava", status: "error", configured: true, method: "oauth", lastError: "Provider returned HTTP 500" }] })).import, "strava");
  assert.equal(strava.import, "failed");
  assert.equal(strava.authorization, "authorized");
  // An expired token asks for reconnection.
  strava = find(buildSetupPaths(inputs({ providers: [{ id: "strava", status: "error", configured: true, method: "oauth", lastError: "Authorization expired; reconnect" }] })).import, "strava");
  assert.equal(strava.authorization, "needs_attention");
});

test("missing is never zero: unloaded counts are null and render as a dash", () => {
  const unloaded = find(buildSetupPaths(inputs({ stored: null })).import, "garmin");
  assert.equal(unloaded.storedCount, null);
  assert.equal(unloaded.import, "unknown");
  assert.equal(formatCount(unloaded.storedCount), "—");
  const loadedEmpty = find(buildSetupPaths(inputs({ stored: [] })).import, "garmin");
  assert.equal(loadedEmpty.storedCount, 0);
  assert.equal(loadedEmpty.import, "no_records");
  assert.equal(formatCount(0), "0");
});

test("when the connections request fails, nothing is reported as authorized or imported", () => {
  const paths = buildSetupPaths(inputs({ providers: null, stored: null, email: null, telegram: null }));
  for (const id of ["strava", "whoop", "oura", "google_cal"]) {
    const row = find(paths.import, id);
    assert.equal(row.authorization, "unknown", id);
    assert.equal(row.import, "unknown", id);
  }
  assert.equal(find(paths.receive, "email").authorization, "unknown");
  assert.equal(find(paths.receive, "telegram").publication, "unknown");
});

test("Intervals.icu is conditional, optional and never claims device delivery", () => {
  assert.ok(!all(buildSetupPaths(inputs())).some(r => r.id.startsWith("intervals")), "hidden when the release capability is off");
  const on = buildSetupPaths(inputs({ capabilities: { intervalsConnector: true }, providers: [{ id: "intervals", status: "connected", configured: true, method: "oauth", lastSyncAt: hoursAgo(1) }], intervalsPublish: { enabled: false, available: true } }));
  const importRow = find(on.import, "intervals");
  const sendRow = find(on.receive, "intervals_garmin");
  assert.ok(importRow.conditional && sendRow.conditional);
  assert.equal(sendRow.publication, "ready");
  assert.equal(sendRow.deviceDelivery, "unverified");
  // Not authorized yet: publication is unavailable, device delivery stays unverified.
  const notYet = find(buildSetupPaths(inputs({ capabilities: { intervalsConnector: true }, providers: [{ id: "intervals", status: "disconnected", configured: true, method: "oauth" }], intervalsPublish: { enabled: false, available: true } })).receive, "intervals_garmin");
  assert.equal(notYet.authorization, "not_authorized");
  assert.equal(notYet.publication, "unavailable");
  assert.equal(notYet.deviceDelivery, "unverified");
  // Publication switched off on the server.
  const off = find(buildSetupPaths(inputs({ capabilities: { intervalsConnector: true }, providers: [{ id: "intervals", status: "connected", configured: true, method: "oauth" }], intervalsPublish: { enabled: true, available: false } })).receive, "intervals_garmin");
  assert.equal(off.publication, "unavailable");
});

test("no row in any scenario reports a device as having received a workout", () => {
  const scenarios = [
    inputs(), inputs({ providers: null, stored: null }),
    inputs({ capabilities: { intervalsConnector: true }, providers: [{ id: "intervals", status: "connected", configured: true, method: "oauth" }, { id: "google_cal", status: "connected", configured: true, method: "oauth" }], intervalsPublish: { enabled: true, available: true }, email: { configured: true, verified: true, enabled: true }, telegram: { configured: true, paired: true, optedIn: true } }),
  ];
  for (const scenario of scenarios) for (const row of all(buildSetupPaths(scenario))) assert.ok(["not_applicable", "unverified", "manual_file"].includes(row.deviceDelivery), `${row.id}: ${row.deviceDelivery}`);
});

test("Strava rows are flagged and carry the AI-exclusion notice in both languages", () => {
  const paths = buildSetupPaths(inputs());
  const strava = find(paths.import, "strava");
  assert.equal(strava.stravaRestricted, true);
  assert.equal(strava.publication, "not_applicable");
  assert.equal(strava.deviceDelivery, "not_applicable");
  for (const lang of ["en", "es"] as const) assert.match(rowCopy(strava, lang).limit, lang === "en" ? /AI features do not receive Strava-origin data/ : /IA de JMM no reciben datos de origen Strava/);
  assert.equal(paths.import.filter(r => r.stravaRestricted).length, 1);
});

test("calendar events and file downloads are not described as watch delivery", () => {
  const paths = buildSetupPaths(inputs({ providers: [{ id: "google_cal", status: "connected", configured: true, method: "oauth" }] }));
  const events = find(paths.receive, "google_cal_events");
  assert.equal(events.publication, "ready");
  assert.equal(events.deviceDelivery, "not_applicable");
  assert.match(rowCopy(events, "en").limit, /not structured watch workouts/);
  const fit = find(paths.receive, "fit");
  assert.equal(fit.deviceDelivery, "manual_file");
  assert.match(rowCopy(fit, "en").limit, /download is not delivery/i);
});

test("email and Telegram need verification/pairing AND opt-in before they are ready", () => {
  const cases: [SetupInputs["email"], string, string][] = [
    [{ configured: false, verified: false, enabled: false }, "unavailable", "unavailable"],
    [{ configured: true, verified: false, enabled: true }, "not_authorized", "off"],
    [{ configured: true, verified: true, enabled: false }, "authorized", "off"],
    [{ configured: true, verified: true, enabled: true }, "authorized", "ready"],
  ];
  for (const [email, auth, pub] of cases) {
    const row = find(buildSetupPaths(inputs({ email })).receive, "email");
    assert.equal(row.authorization, auth); assert.equal(row.publication, pub);
  }
  const telegram = find(buildSetupPaths(inputs({ telegram: { configured: true, paired: true, optedIn: false } })).receive, "telegram");
  assert.equal(telegram.authorization, "authorized"); assert.equal(telegram.publication, "off");
});

test("COROS has no direct row beyond an honest unavailable state and a manual file import", () => {
  const paths = buildSetupPaths(inputs());
  assert.equal(find(paths.receive, "coros_direct").publication, "unavailable");
  const coros = find(paths.import, "coros");
  assert.equal(coros.authorization, "not_required");
  assert.match(rowCopy(coros, "en").limit, /no authorized direct COROS connection/);
});

test("two athletes' inputs never bleed into each other and the builder keeps no state", () => {
  const a = inputs({ providers: [{ id: "strava", status: "connected", configured: true, method: "oauth", lastSyncAt: hoursAgo(1) }], stored: [{ source: "strava", count: 9, latestAt: hoursAgo(1) }] });
  const b = inputs({ providers: [{ id: "strava", status: "disconnected", configured: true, method: "oauth" }], stored: [{ source: "garmin", count: 2, latestAt: hoursAgo(5) }] });
  const firstA = JSON.stringify(buildSetupPaths(a));
  const resultB = buildSetupPaths(b);
  assert.equal(JSON.stringify(buildSetupPaths(a)), firstA);
  assert.equal(find(resultB.import, "strava").storedCount, 0);
  assert.equal(find(resultB.import, "garmin").storedCount, 2);
});

test("every row has bilingual copy and no copy makes an affirmative delivery claim", () => {
  const rows = all(buildSetupPaths(inputs({ capabilities: { intervalsConnector: true } })));
  for (const row of rows) { assert.ok(ROW_COPY[row.copyKey], `copy for ${row.id}`); }
  const banned = [/\b(sent|delivered|synced|pushed) to your (watch|garmin|coros|device)\b/i, /\bautomatically (sent|delivered|synced) to your (watch|garmin|device)\b/i, /\benviado a tu reloj\b/i, /\bentregado en tu reloj\b/i];
  const strings: string[] = [];
  for (const entry of Object.values(ROW_COPY)) strings.push(entry.what.en, entry.what.es, entry.limit.en, entry.limit.es);
  for (const entry of Object.values(SECTION_COPY)) strings.push(entry.title.en, entry.title.es, entry.intro.en, entry.intro.es);
  for (const table of Object.values(STATUS_LABEL)) for (const dict of Object.values(table)) strings.push(dict.en, dict.es);
  for (const text of strings) { assert.ok(text.trim().length > 0); for (const pattern of banned) assert.doesNotMatch(text, pattern); }
  for (const entry of Object.values(ROW_COPY)) { assert.notEqual(entry.what.en, entry.what.es); assert.notEqual(entry.limit.en, entry.limit.es); }
});

test("statusLabel falls back to Unknown instead of throwing or inventing a state", () => {
  assert.equal(statusLabel("authorization", "authorized", "en"), "Authorized");
  assert.equal(statusLabel("import", "not-a-state", "en"), "Unknown");
  assert.equal(statusLabel("deviceDelivery", "unverified", "es"), "Sin confirmar por el dispositivo");
});

test("WHOOP without OAuth keys is a CSV upload, not an unavailable connection, and keeps no activity count", () => {
  const row = find(buildSetupPaths(inputs({ providers: [{ id: "whoop", status: "disconnected", configured: true, method: "upload" }] })).import, "whoop");
  assert.equal(row.authorization, "not_required");
  assert.equal(row.action.kind, "file");
  assert.equal(row.storedCount, null);
  assert.equal(row.import, "unknown");
});

import { mapEmailPreferences, mapIntervalsPreferences, mapStoredCounts, mapTelegramPreferences } from "./athlete-setup-paths";

test("adapters turn malformed or partial payloads into unknown (null), never into defaults", () => {
  assert.equal(mapEmailPreferences(null), null);
  assert.equal(mapEmailPreferences({ error: "Unauthorized" }), null);
  assert.deepEqual(mapEmailPreferences({ configured: false }), { configured: false, verified: false, enabled: false });
  assert.equal(mapEmailPreferences({ configured: true }), null);
  assert.deepEqual(mapEmailPreferences({ configured: true, preference: { enabled: true, verified: true } }), { configured: true, verified: true, enabled: true });
  assert.equal(mapTelegramPreferences({ preferences: {} }), null);
  assert.deepEqual(mapTelegramPreferences({ externalDeliveryEnabled: false }), { configured: false, paired: false, optedIn: false });
  assert.deepEqual(mapTelegramPreferences({ externalDeliveryEnabled: true, preferences: { verifiedChatId: "c1", verificationTransport: "telegram", paused: false, dailyPlan: true, consentVersion: "v1" } }), { configured: true, paired: true, optedIn: true });
  // A mock-transport pairing is not a Telegram pairing; a paused chat is not opted in.
  assert.equal(mapTelegramPreferences({ externalDeliveryEnabled: true, preferences: { verifiedChatId: "c1", verificationTransport: "mock", paused: false, dailyPlan: true, consentVersion: "v1" } })!.paired, false);
  assert.equal(mapTelegramPreferences({ externalDeliveryEnabled: true, preferences: { verifiedChatId: "c1", verificationTransport: "telegram", paused: true, dailyPlan: true, consentVersion: "v1" } })!.optedIn, false);
  assert.equal(mapIntervalsPreferences({ enabled: "yes" }), null);
  assert.deepEqual(mapIntervalsPreferences({ enabled: false, available: true }), { enabled: false, available: true });
  assert.equal(mapStoredCounts({ history: {} }), null);
  assert.equal(mapStoredCounts({ history: { bySource: [{ source: "garmin", count: -1 }] } }), null);
  assert.deepEqual(mapStoredCounts({ history: { bySource: [{ source: "garmin", count: 2, latestAt: "2026-10-01T00:00:00.000Z" }, { source: null, count: 1 }] } }),
    [{ source: "garmin", count: 2, latestAt: "2026-10-01T00:00:00.000Z" }, { source: null, count: 1, latestAt: null }]);
});
