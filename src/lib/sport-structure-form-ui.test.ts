import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FriendlySportStructureForm } from "../components/FriendlySportStructureForm";
import { emptyFriendlyStep, emptyFriendlyStructure, type FriendlyStructure } from "./sport-structure-form";

function fixture(value: FriendlyStructure, es = false, disabled = false) {
  let changed = value;
  const tree = FriendlySportStructureForm({ id: "fixture", value, es, disabled, onChange: next => { changed = next; } });
  const nodes: React.ReactElement<any>[] = [];
  function visit(node: React.ReactNode) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (React.isValidElement<any>(node)) { nodes.push(node); visit(node.props.children); }
  }
  visit(tree);
  return { nodes, html: renderToStaticMarkup(tree), changed: () => changed };
}

test("friendly authoring labels every input and keeps doses blank in both languages", () => {
  for (const es of [false, true]) for (const sport of ["swim", "strength", "hyrox"]) {
    const form = emptyFriendlyStructure(sport)!;
    form.steps.push(emptyFriendlyStep(sport === "swim" ? "lengths" : sport === "strength" ? "set" : "station"));
    const f = fixture(form, es);
    const inputs = f.nodes.filter(n => ["input", "select", "textarea"].includes(String(n.type)));
    for (const input of inputs) assert.ok(f.nodes.some(n => n.type === "label" && n.props.htmlFor === input.props.id));
    assert.equal(f.nodes.find(n => n.props.id === "fixture-step-0-name")!.props.value, "");
    assert.match(f.html, es ? /no se adivinan/ : /never guessed/);
    assert.match(f.html, es ? /no aprueba ni envía/ : /does not approve or send/);
    if (sport !== "swim") assert.equal(f.nodes.find(n => n.props.id === "fixture-step-0-load")!.props.value, "");
  }
});

test("friendly fields edit only their row, add blank steps, and preserve explicit order", () => {
  const form = emptyFriendlyStructure("hyrox")!;
  form.steps = [{ ...emptyFriendlyStep("run"), name: "Reviewed run" }, { ...emptyFriendlyStep("station"), name: "Reviewed station" }];
  const f = fixture(form);
  f.nodes.find(n => n.props.id === "fixture-step-1-load")!.props.onChange({ target: { value: "4" } });
  assert.equal(f.changed().steps[1].load, "4"); assert.equal(f.changed().steps[0].load, "");
  f.nodes.find(n => n.props["aria-label"] === "Move step up 2")!.props.onClick();
  assert.equal(f.changed().steps[0].name, "Reviewed station");
  const addButtons = f.nodes.filter(n => n.type === "button" && Array.isArray(n.props.children) && n.props.children[0] === "Add");
  addButtons.find(n => n.props.children.includes("Rest"))!.props.onClick();
  assert.equal(f.changed().steps.at(-1)!.kind, "rest"); assert.equal(f.changed().steps.at(-1)!.amount, "");
});

test("locked/history state disables each row and every authoring action", () => {
  const form = emptyFriendlyStructure("swim")!; form.steps.push(emptyFriendlyStep("lengths"));
  const f = fixture(form, false, true);
  assert.equal(f.nodes.find(n => n.type === "fieldset")!.props.disabled, true);
  for (const button of f.nodes.filter(n => n.type === "button")) assert.equal(button.props.disabled, true);
  assert.equal(f.nodes.find(n => n.props.id === "fixture-pool")!.props.disabled, true);
});
