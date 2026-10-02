import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { dayBounds } from "../src/lib/dates";
import { storeActivity } from "../src/lib/activity-store";
import { syncUserConnectors } from "../src/lib/sync";
import { GET as reminders } from "../src/app/api/cron/reminders/route";
const db = new PrismaClient(),
  url = new URL(process.env.DATABASE_URL || "");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !/test|integration|ci/.test(url.pathname)
)
  throw new Error("Use an isolated local test database.");
const original = globalThis.fetch,
  previous = {
    cron: process.env.CRON_SECRET,
    automatedDelivery: process.env.ENABLE_AUTOMATED_DELIVERY,
    mockCoaching: process.env.ENABLE_MOCK_COACHING,
    telegramCoaching: process.env.ENABLE_TELEGRAM_COACHING,
    transport: process.env.COACHING_TRANSPORT,
    smtp: process.env.SMTP_HOST,
    telegram: process.env.TELEGRAM_BOT_TOKEN,
  };
let userId = "";
async function main() {
  const user = await db.user.create({
    data: {
      email: `sync-${randomUUID()}@example.invalid`,
      name: "Sync Test",
      passwordHash: "disabled",
    },
  });
  userId = user.id;
  const day = dayBounds(user.timezone),
    workout = await db.workout.create({
      data: {
        userId,
        date: day.start,
        title: "Original title",
        sport: "bike",
        type: "endurance",
        durationMin: 60,
        intensity: "z2",
        planned: true,
        source: "plan",
      },
    });
  const activity = {
    date: day.start,
    sport: "bike",
    title: "Imported ride",
    durationMin: 60,
    source: "strava",
    externalId: "test-ride",
  };
  const imports = await Promise.all([
    storeActivity(userId, user.timezone, activity),
    storeActivity(userId, user.timezone, activity),
  ]);
  assert.equal(imports.filter(Boolean).length, 1);
  assert.ok(
    (await db.workout.findUniqueOrThrow({ where: { id: workout.id } }))
      .matchedPlanId,
  );
  await db.connector.create({
    data: {
      userId,
      provider: "google_cal",
      status: "connected",
      tokenEnc: "fixture-access",
    },
  });
  let meetings: any[] = [
    {
      id: "meeting",
      summary: "Meeting",
      start: { dateTime: `${day.key}T13:00:00-04:00` },
      end: { dateTime: `${day.key}T14:00:00-04:00` },
    },
  ];
  const remote = new Map<string, any>();
  let posts = 0;
  globalThis.fetch = (async (input: any, init: any) => {
    const u = new URL(String(input));
    assert.equal(u.hostname, "www.googleapis.com");
    const id = u.pathname.split("/").at(-1)!;
    if (init?.method === "POST") {
      const b = JSON.parse(init.body);
      remote.set(b.id, b);
      posts++;
      return Response.json(b);
    }
    if (init?.method === "PATCH") {
      if (!remote.has(id)) return new Response(null, { status: 404 });
      const b = { ...remote.get(id), ...JSON.parse(init.body), id };
      remote.set(id, b);
      return Response.json(b);
    }
    if (init?.method === "DELETE") {
      remote.delete(id);
      return new Response(null, { status: 204 });
    }
    return Response.json({
      items: [...meetings, ...Array.from(remote.values())],
    });
  }) as typeof fetch;
  assert.ok((await syncUserConnectors(userId)).results.every((r) => r.ok));
  assert.equal(posts, 1);
  await db.workout.update({
    where: { id: workout.id },
    data: { title: "Renamed ride" },
  });
  assert.ok((await syncUserConnectors(userId)).results.every((r) => r.ok));
  assert.equal(posts, 1);
  assert.equal(remote.size, 1);
  assert.equal(
    await db.calendarEvent.count({ where: { userId, type: "workout" } }),
    1,
  );
  meetings = [];
  await syncUserConnectors(userId);
  assert.equal(
    await db.calendarEvent.count({ where: { userId, type: "appointment" } }),
    0,
  );
  await db.workout.update({
    where: { id: workout.id },
    data: { durationMin: 0 },
  });
  await syncUserConnectors(userId);
  assert.equal(remote.size, 0);
  globalThis.fetch = original;
  process.env.CRON_SECRET = "local-reminder-test";
  delete process.env.SMTP_HOST;
  delete process.env.TELEGRAM_BOT_TOKEN;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: user.timezone,
    }).format(new Date()),
  );
  await db.reminderPref.create({
    data: {
      userId,
      emailEnabled: false,
      telegramEnabled: true,
      telegramChatId: "local-test",
      reminderHour: hour,
    },
  });
  const req = () =>
    new Request("http://localhost/api/cron/reminders", {
      headers: { authorization: "Bearer local-reminder-test" },
    });
  delete process.env.ENABLE_AUTOMATED_DELIVERY;
  delete process.env.ENABLE_MOCK_COACHING;
  delete process.env.ENABLE_TELEGRAM_COACHING;
  delete process.env.COACHING_TRANSPORT;
  const disabled = await (await reminders(req())).json();
  assert.equal(disabled.enabled, false);
  assert.equal(await db.reminderDelivery.count({ where: { userId } }), 0);
  process.env.ENABLE_AUTOMATED_DELIVERY = "true";
  const first = await (await reminders(req())).json();
  assert.equal(first.sent, 0);
  assert.equal(first.enabled, false, "Legacy reminder preferences alone cannot authorize purpose-specific coaching delivery");
  const second = await (await reminders(req())).json();
  assert.equal(second.sent, 0);
  assert.equal(second.enabled, false);
  assert.equal(await db.reminderDelivery.count({ where: { userId } }), 0);
  assert.equal(await db.coachingPrompt.count({ where: { userId } }), 0);
  assert.equal(await db.sentEmail.count({ where: { userId } }), 0);
  console.log(
    "Sync integration passed: concurrent imports, plan matching, calendar create/rename/delete, legacy preference isolation (new purpose-specific delivery/retry is covered by the coaching suite). No external requests or messages were sent.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries({
      CRON_SECRET: previous.cron,
      ENABLE_AUTOMATED_DELIVERY: previous.automatedDelivery,
      ENABLE_MOCK_COACHING: previous.mockCoaching,
      ENABLE_TELEGRAM_COACHING: previous.telegramCoaching,
      COACHING_TRANSPORT: previous.transport,
      SMTP_HOST: previous.smtp,
      TELEGRAM_BOT_TOKEN: previous.telegram,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (userId) {
      await db.reminderDelivery.deleteMany({ where: { userId } });
      await db.user.delete({ where: { id: userId } });
    }
    await db.$disconnect();
  });
