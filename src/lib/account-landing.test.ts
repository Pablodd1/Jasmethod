import test from "node:test";
import assert from "node:assert/strict";
import { accountLanding } from "./account-landing";
test("only completed onboarding enters Today directly", () => {
  assert.equal(accountLanding(true), "/today");
  for (const value of [false, undefined, null, "true"]) assert.equal(accountLanding(value), "/onboard");
});
