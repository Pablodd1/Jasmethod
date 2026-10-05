import test from "node:test";
import assert from "node:assert/strict";
import { readIntervalsAutoPublish } from "./intervals-preferences";

test("Intervals automatic publication requires explicit owner consent for the same remote account", async () => {
  for (const [after, expected] of [
    [null, false], ["invalid", false],
    [JSON.stringify({ version: 1, enabled: false, externalRef: "a1" }), false],
    [JSON.stringify({ version: 1, enabled: true, externalRef: "a2" }), false],
    [JSON.stringify({ version: 1, enabled: "true", externalRef: "a1" }), false],
    [JSON.stringify({ version: 1, enabled: true, externalRef: "a1" }), true],
  ] as const) {
    const db: any = { auditLog: { findFirst: async (query: any) => {
      assert.deepEqual(query.where, { actorId: "owner", subjectId: "owner", action: "intervals.auto_publish" });
      assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
      return { after };
    } } };
    assert.equal(await readIntervalsAutoPublish("owner", "a1", db), expected);
  }
});
