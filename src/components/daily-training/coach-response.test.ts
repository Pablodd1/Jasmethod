import test from "node:test";
import assert from "node:assert/strict";
import { readCoachResponse } from "./coach-conversation-client";

test("expired chat sessions explain recovery even when a gateway returns HTML", async () => {
  await assert.rejects(readCoachResponse(new Response("<html>login</html>", { status: 401 }), false), /Sign in again/);
});
test("HTML and empty proxy errors never surface parser errors or response details", async () => {
  for (const body of ["<html>private upstream diagnostics</html>", ""]) {
    await assert.rejects(readCoachResponse(new Response(body, { status: 502 }), false), error => {
      assert.match(String(error), /Reload the conversation/);
      assert.doesNotMatch(String(error), /private|Unexpected|JSON/);
      return true;
    });
  }
});
test("chat rejects malformed success and preserves structured server errors", async () => {
  await assert.rejects(readCoachResponse(Response.json(null), false), /did not complete/);
  await assert.rejects(readCoachResponse(Response.json({ ok: false, error: "Revision changed" }, { status: 409 }), false), /Revision changed/);
  assert.deepEqual(await readCoachResponse(Response.json({ ok: true, conversation: { id: "c", messages: [] } }), false), { ok: true, conversation: { id: "c", messages: [] } });
});
