import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {ExecutionReviewCard} from "../components/daily-training/ExecutionReviewCard";
import {evaluateExecution} from "./execution-feedback";

test("local execution card renders actual versus planned with provenance, without copying comments into context",()=>{
 const review=evaluateExecution({verdict:"full",safetyStatus:"clear"},[{id:"synthetic-report",sport:"bike",source:"manual",date:"2026-11-02",feedbackAt:"2026-11-02T12:00Z",expectedDurationMin:60,actualDurationMin:45,feedbackStatus:"partial",rpe:5,feedbackNote:"PRIVATE_COMMENT_CANARY"}]);
 for(const es of [false,true]){
  const html=renderToStaticMarkup(createElement(ExecutionReviewCard,{review,es}));
  assert.match(html,/60/);assert.match(html,/45/);assert.match(html,/2026-11-02/);assert.match(html,/manual/);
  assert.doesNotMatch(html,/PRIVATE_COMMENT_CANARY/);assert.match(html,es?/Comentario guardado/:/Comment saved/);
 }
});

test("absent feedback never renders a claim that the athlete rested",()=>{
 const review=evaluateExecution({verdict:"rest",safetyStatus:"unknown"},[]);
 const html=renderToStaticMarkup(createElement(ExecutionReviewCard,{review,es:false}));
 assert.match(html,/does not mean you have not trained/);assert.doesNotMatch(html,/0 minutes completed/);
 assert.equal(renderToStaticMarkup(createElement(ExecutionReviewCard,{es:false})),"");
 for(const malformed of [{...review,sessions:"bad"},{...review,sessions:[null]},{...review,state:"cleared"}])assert.equal(renderToStaticMarkup(createElement(ExecutionReviewCard,{review:malformed,es:false})),"");
});
