import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { canonicalSession } from "./canonical-session";
import { MANUAL_EMAIL_CONSENT } from "./manual-workout-email";
import { reconcileManualWorkoutEmails } from "./manual-workout-email-service";
import type { ManualEmailMessage, ManualEmailReceipt } from "./manual-workout-email-transport";

type Dependencies = NonNullable<Parameters<typeof reconcileManualWorkoutEmails>[2]>;
type Snapshot = Awaited<ReturnType<Dependencies["resolve"]>>;
type Row = Record<string, any>;
const now = new Date("2026-10-07T06:00:00Z");

function snapshot(kind: "ready" | "held" | "cancelled" = "ready", name = "Steady effort", dateLocal = "2026-10-07"): Snapshot {
  const workout = { id: "session-a", userId: "athlete-a", sport: "bike", title: "Bike", durationMin: 10, startTime: "08:00", approved: kind === "ready", planned: true, completed: false, feedbackStatus: null };
  const prescription = { sport: "bike", durationMin: 10, verdict: "full", steps: [{ name, seconds: 600, zone: "z2", phase: "active" }] };
  const canonical = canonicalSession({ athleteId: workout.userId, workout, prescription, dateLocal, timezone: "UTC" });
  // The real resolver owns database hydration. Fixtures carry only values used
  // by reconciliation, while retaining a real canonical/FIT-renderable session.
  return {
    kind, revision: kind === "cancelled" ? "cancelled" : canonical.revision,
    workout: kind === "cancelled" ? null : workout,
    resolved: kind === "cancelled" ? null : { canonical, workout, prescription, targetProfile: {}, nutrition: null },
  } as Snapshot;
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([field, value]) => {
    const actual = row[field];
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value && !value.in.includes(actual)) return false;
      if ("not" in value && actual === value.not) return false;
      if ("lt" in value && !(actual != null && actual < value.lt)) return false;
      if ("gt" in value && !(actual != null && actual > value.gt)) return false;
      if ("gte" in value && !(actual != null && actual >= value.gte)) return false;
      return true;
    }
    return actual === value;
  });
}

/** In-memory model fakes perform the same compare-and-set predicates as the
 * service. No Prisma query or SMTP operation may escape this harness. */
async function withHarness(run: (h: ReturnType<typeof makeHarness>) => Promise<void>) {
  const h = makeHarness();
  try { await run(h); } finally { h.restore(); }
}

function makeHarness() {
  const restore: (() => void)[] = [];
  const replace = (model: object, method: string, replacement: (...args: any[]) => unknown) => {
    const target = model as Row;
    const original = target[method];
    target[method] = replacement;
    restore.push(() => { target[method] = original; });
  };
  for (const [key, value] of Object.entries({ ENABLE_MANUAL_WORKOUT_EMAIL: "true", SMTP_HOST: "smtp.example.invalid", SMTP_FROM: "workouts@example.invalid", MANUAL_WORKOUT_EMAIL_ORIGIN: "https://app.example.invalid" })) {
    const original = process.env[key];
    process.env[key] = value;
    restore.push(() => { if (original === undefined) delete process.env[key]; else process.env[key] = original; });
  }
  const user = { id: "athlete-a", email: "athlete@example.invalid", timezone: "UTC", language: "en" };
  const preference: Row = { userId: user.id, user, enabled: true, daily: true, revisions: true, calendarGuidance: false, recipient: user.email, verifiedAt: now, consentAt: now, consentVersion: MANUAL_EMAIL_CONSENT, timezone: "UTC", minuteOfDay: 360, leadMinutes: 90 };
  const rows: Row[] = [];
  const dispatch: Row[] = [];
  const sends: ManualEmailMessage[] = [];
  const writes: { model: string; where: Row; data: Row }[] = [];
  let resolveReads = 0;
  let preferenceReads = 0;
  let userReads = 0;
  const h = {
    user, preference, rows, dispatch, sends, writes,
    state: snapshot(),
    failAcceptedWrite: false,
    sendTime: now,
    resolve: (_read: number): Snapshot => structuredClone(h.state),
    readPreference: (_read: number): Row | null => structuredClone(preference),
    readUser: (_read: number): Row | null => structuredClone(user),
    send: async (_message: ManualEmailMessage): Promise<ManualEmailReceipt> => ({ status: "accepted", receiptId: "fake-smtp-receipt" }),
    run: () => reconcileManualWorkoutEmails(now, user.id, {
      resolve: async (userId, sessionId) => {
        assert.equal(userId, user.id);
        assert.equal(sessionId, "session-a");
        return h.resolve(++resolveReads);
      },
      send: async message => { sends.push(message); return h.send(message); },
      clock: () => h.sendTime,
    }),
    restore: () => { for (const undo of restore.reverse()) undo(); },
  };
  replace(prisma.manualWorkoutEmailPreference, "findMany", async ({ where }: Row) => matches(preference, where) ? [structuredClone(preference)] : []);
  replace(prisma.manualWorkoutEmailPreference, "findUnique", async ({ where }: Row) => {
    assert.equal(where.userId, user.id);
    return h.readPreference(++preferenceReads);
  });
  replace(prisma.user, "findUnique", async ({ where }: Row) => {
    assert.equal(where.id, user.id);
    return h.readUser(++userReads);
  });
  replace(prisma.workout, "findMany", async ({ where }: Row) => {
    assert.equal(where.userId, user.id);
    return [{ id: "session-a" }];
  });
  replace(prisma.manualWorkoutEmailOutbox, "findMany", async ({ where }: Row) => structuredClone(rows.filter(row => matches(row, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())));
  replace(prisma.manualWorkoutEmailOutbox, "upsert", async ({ where, create }: Row) => {
    let row = rows.find(row => matches(row, where));
    if (!row) {
      const created: Row = { id: `outbox-${rows.length + 1}`, status: "queued", createdAt: new Date(now.getTime() + rows.length), attemptedAt: null, ...create };
      rows.push(created);
      row = created;
    }
    return structuredClone(row);
  });
  replace(prisma.manualWorkoutEmailOutbox, "updateMany", async ({ where, data }: Row) => {
    writes.push({ model: "outbox", where, data });
    const found = rows.filter(row => matches(row, where));
    found.forEach(row => Object.assign(row, data));
    return { count: found.length };
  });
  replace(prisma.manualWorkoutEmailOutbox, "update", async ({ where, data }: Row) => {
    writes.push({ model: "outbox", where, data });
    if (data.status === "accepted" && h.failAcceptedWrite) throw Error("Simulated database failure after SMTP accepted");
    const row = rows.find(row => matches(row, where));
    assert.ok(row, "An outbox update must target an existing row.");
    Object.assign(row, data);
    return structuredClone(row);
  });
  replace(prisma.manualWorkoutEmailDispatch, "upsert", async ({ where, create }: Row) => {
    let row = dispatch.find(row => matches(row, where));
    if (!row) { const created: Row = { outboxId: null, ...create }; dispatch.push(created); row = created; }
    return structuredClone(row);
  });
  replace(prisma.manualWorkoutEmailDispatch, "updateMany", async ({ where, data }: Row) => {
    writes.push({ model: "dispatch", where, data });
    const found = dispatch.filter(row => matches(row, where));
    found.forEach(row => Object.assign(row, data));
    return { count: found.length };
  });
  return h;
}

test("same-revision held/approved/held transitions each send once with correct attachment boundary", async () => {
  await withHarness(async h => {
    h.state = snapshot("held");
    assert.equal((await h.run()).accepted, 1);
    const revision = h.rows[0].revision;
    assert.deepEqual(h.sends[0].attachments, []);
    assert.match(h.sends[0].text, /on hold/);
    h.state = snapshot("ready");
    assert.equal(h.state!.revision, revision);
    assert.equal((await h.run()).accepted, 1);
    assert.equal(h.rows[1].kind, "revised");
    assert.match(h.sends[1].text, /has changed/);
    assert.equal(h.sends[1].attachments!.filter(attachment => attachment.filename.endsWith(".fit")).length, 1);
    assert.ok(h.sends[1].attachments!.every(attachment => !attachment.filename.endsWith(".zip")));
    assert.equal((await h.run()).accepted, 0);
    h.state = snapshot("held");
    assert.equal((await h.run()).accepted, 1);
    assert.deepEqual(h.sends[2].attachments, []);
    assert.doesNotMatch(h.sends[2].text, /Steady effort|600 s|TOTAL carbohydrate/);
    assert.equal((await h.run()).accepted, 0);
    assert.equal(h.sends.length, 3);
    assert.equal(new Set(h.rows.map(row => row.dedupeKey)).size, 3);
  });
});

test("concurrent reconciliations claim the same outbox attempt only once", async () => {
  await withHarness(async h => {
    const results = await Promise.all([h.run(), h.run(), h.run()]);
    assert.equal(results.reduce((count, result) => count + result.accepted, 0), 1);
    assert.equal(h.sends.length, 1);
    assert.equal(h.rows.length, 1);
    assert.equal(h.rows[0].status, "accepted");
    assert.equal(h.dispatch[0].outboxId, null);
  });
});

test("moving a previously emailed session to another date sends a hold notice without tomorrow's FIT", async () => {
  await withHarness(async h => {
    assert.equal((await h.run()).accepted, 1);
    h.state = snapshot("ready", "Steady effort", "2026-10-08");
    assert.equal((await h.run()).accepted, 1);
    assert.equal(h.sends.length, 2);
    assert.equal(h.rows[1].kind, "held");
    assert.deepEqual(h.sends[1].attachments, []);
    assert.match(h.sends[1].text, /on hold/);
    assert.doesNotMatch(h.sends[1].text, /600 s|Steady effort/);
    assert.equal((await h.run()).accepted, 0);
    assert.equal(h.sends.length, 2);
  });
});

test("dispatch lease serializes different revisions while an SMTP attempt is in progress", async () => {
  await withHarness(async h => {
    let releaseSend!: () => void;
    let markSending!: () => void;
    const started = new Promise<void>(resolve => { markSending = resolve; });
    const released = new Promise<void>(resolve => { releaseSend = resolve; });
    h.send = async () => { markSending(); await released; return { status: "accepted" }; };
    const first = h.run();
    await started;
    h.state = snapshot("ready", "Updated effort");
    const contended = await h.run();
    assert.equal(contended.accepted, 0);
    assert.equal(h.sends.length, 1);
    assert.equal(h.rows[1].status, "queued");
    releaseSend();
    await first;
    assert.equal((await h.run()).accepted, 1);
    assert.equal(h.sends.length, 2);
    assert.match(h.sends[1].text, /Updated effort/);
    assert.equal(h.rows[1].status, "accepted");
  });
});

test("last-moment opt-out, recipient change or purpose withdrawal supersedes before SMTP", async () => {
  for (const changed of [{ enabled: false }, { recipient: "changed@example.invalid" }, { daily: false }, { verifiedAt: null }, { consentVersion: "obsolete" }]) {
    await withHarness(async h => {
      h.readPreference = read => ({ ...h.preference, ...(read >= 2 ? changed : {}) });
      assert.equal((await h.run()).accepted, 0);
      assert.equal(h.sends.length, 0, JSON.stringify(changed));
      assert.equal(h.rows[0].status, "superseded");
      assert.equal(h.dispatch[0].outboxId, null);
    });
  }
});

test("a builder that loses or outlives its dispatch lease cannot send or release another owner's lease", async () => {
  for (const lost of ["owner-changed", "expired"] as const) {
    await withHarness(async h => {
      h.resolve = read => {
        if (read === 3) {
          if (lost === "owner-changed") h.dispatch[0].outboxId = "another-attempt";
          else h.dispatch[0].leasedUntil = new Date(0);
        }
        return structuredClone(h.state);
      };
      assert.equal((await h.run()).accepted, 0);
      assert.equal(h.sends.length, 0);
      assert.equal(h.rows[0].status, "superseded");
      if (lost === "owner-changed") assert.equal(h.dispatch[0].outboxId, "another-attempt");
    });
  }
});

test("source change, hold, cancellation or completion during FIT generation prevents stale sending", async () => {
  for (const last of [snapshot("ready", "New canonical source"), snapshot("held"), snapshot("cancelled"), null]) {
    await withHarness(async h => {
      h.resolve = read => structuredClone(read >= 3 ? last : h.state);
      assert.equal((await h.run()).accepted, 0);
      assert.equal(h.sends.length, 0);
      assert.equal(h.rows[0].status, "superseded");
    });
  }
});

test("final clock check suppresses actionable files at start time or on the next local date", async () => {
  for (const sendTime of ["2026-10-07T08:00:00Z", "2026-10-07T08:00:01Z", "2026-10-08T06:00:00Z"]) {
    await withHarness(async h => {
      h.sendTime = new Date(sendTime);
      assert.equal((await h.run()).accepted, 0);
      assert.equal(h.sends.length, 0);
      assert.equal(h.rows[0].status, "superseded");
    });
  }
});

test("accepted SMTP followed by failed persistence becomes unknown and is never automatically resent", async () => {
  await withHarness(async h => {
    h.failAcceptedWrite = true;
    assert.equal((await h.run()).accepted, 0);
    assert.equal(h.sends.length, 1);
    assert.equal(h.rows[0].status, "unknown");
    assert.match(h.rows[0].error, /No automatic retry/);
    h.failAcceptedWrite = false;
    assert.equal((await h.run()).accepted, 0);
    assert.equal(h.sends.length, 1);
    assert.equal(h.rows[0].status, "unknown");
    assert.equal(h.dispatch[0].outboxId, null);
  });
});

test("only a pre-SMTP superseded attempt can be safely requeued after eligibility returns", async () => {
  await withHarness(async h => {
    h.readPreference = () => ({ ...h.preference, enabled: false });
    assert.equal((await h.run()).accepted, 0);
    assert.equal(h.rows[0].status, "superseded");
    assert.equal(h.sends.length, 0);
    h.readPreference = () => ({ ...h.preference });
    assert.equal((await h.run()).accepted, 1);
    assert.equal(h.rows.length, 1);
    assert.equal(h.sends.length, 1);
    assert.equal(h.rows[0].status, "accepted");
    assert.equal((await h.run()).accepted, 0);
    assert.equal(h.sends.length, 1);
  });
});

test("unknown and rejected transport outcomes do not trigger duplicate automatic attempts", async () => {
  for (const status of ["unknown", "rejected"] as const) {
    await withHarness(async h => {
      h.send = async () => ({ status });
      assert.equal((await h.run()).accepted, 0);
      assert.equal(h.rows[0].status, status);
      assert.equal((await h.run()).accepted, 0);
      assert.equal(h.sends.length, 1);
    });
  }
});

test("saved Spanish athlete language selects Spanish email regardless of the server default", async () => {
  await withHarness(async h => {
    h.user.language = "es";
    assert.equal((await h.run()).accepted, 1);
    assert.match(h.sends[0].subject, /^Tu archivo de entrenamiento está listo/);
    assert.match(h.sends[0].html, /<html lang="es">/);
    assert.match(h.sends[0].text, /Entrenamiento y objetivos/);
    assert.match(h.sends[0].text, /transferencia a tu Garmin no está verificada/);
    assert.doesNotMatch(h.sends[0].subject, /Your workout/);
  });
});

test("saved English athlete language selects English email", async () => {
  await withHarness(async h => {
    h.user.language = "en";
    assert.equal((await h.run()).accepted, 1);
    assert.match(h.sends[0].subject, /^Your workout file is ready/);
    assert.match(h.sends[0].html, /<html lang="en">/);
    assert.match(h.sends[0].text, /Workout and targets/);
  });
});

test("unsupported athlete language is explicitly counted and never silently falls back to English", async () => {
  await withHarness(async h => {
    h.user.language = "fr";
    const result = await h.run();
    assert.equal(result.accepted, 0);
    assert.equal((result as typeof result & { unsupportedLanguage?: number }).unsupportedLanguage, 1);
    assert.equal(h.rows.length, 0);
    assert.equal(h.sends.length, 0);
  });
});

test("a saved-language change during generation supersedes the old-language email before sending", async () => {
  for (const changedAtRead of [1, 2]) {
    await withHarness(async h => {
      h.readUser = read => ({ ...h.user, language: read >= changedAtRead ? "es" : "en" });
      assert.equal((await h.run()).accepted, 0);
      assert.equal(h.sends.length, 0);
      assert.equal(h.rows[0].status, "superseded");
    });
  }
});
