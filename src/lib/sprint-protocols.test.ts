import assert from "node:assert/strict";
import { test } from "node:test";
import { allSprintProtocols, selectSprintProtocols } from "./sprint-protocols";

test("omitted evidence filter preserves unfiltered retrieval", () => {
  assert.deepEqual(selectSprintProtocols(), allSprintProtocols());
});

test("unknown, blank and misspelled evidence filters fail closed", () => {
  for (const minEvidence of ["unknown", "", "RCT", "meta-analysis", "observational "]) {
    assert.deepEqual(selectSprintProtocols({ minEvidence }), []);
  }
});

test("known tier keeps the established retrieval behavior", () => {
  const result = selectSprintProtocols({ minEvidence: "meta_analysis" });
  assert.ok(result.length > 0);
  assert.ok(result.every((protocol) => protocol.evidence_level === "meta_analysis"));
});

test("domain, event and missing-rest filters remain conjunctive", () => {
  const result = selectSprintProtocols({
    minEvidence: "observational",
    domains: ["speed_endurance"],
    event: "400",
    excludeNotSpecified: true,
  });
  const allowed = new Set(["observational", "case_study", "systematic_review", "peer_reviewed_modeling", "rct", "meta_analysis"]);
  const expected = allSprintProtocols().filter((protocol) =>
    allowed.has(protocol.evidence_level) &&
    protocol.domain === "speed_endurance" &&
    protocol.event.includes("400") &&
    !/not specified in source/i.test(protocol.rest_ratio)
  );
  assert.deepEqual(result, expected);
});
