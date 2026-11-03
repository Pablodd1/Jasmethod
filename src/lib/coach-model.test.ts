import test from "node:test";
import assert from "node:assert/strict";
import { coachDialogueAnswer } from "./coach-dialogue-provider";
import { coachTextConfigured } from "./coach-text-provider";
import { coachModelParameters } from "./coach-model";

test("flagship coach request uses compatible reasoning parameters without widening data access", async () => {
  let calls = 0;
  const env = { EXTERNAL_AI_ENABLED:"true", OPENAI_API_KEY:"synthetic-only" };
  assert.equal(coachTextConfigured(env),true);
  const result = await coachDialogueAnswer({message:"Explain the purpose of recovery.",language:"en",units:"metric",manualDialogueConsent:true,messageOrigin:"athlete_authored",externalConsent:true,textProviderConsent:"openai",history:[]}, {env,fetch:async (_url, init) => {
    calls++;
    const body=JSON.parse(String(init?.body));
    assert.equal(body.model,"gpt-6-astra");
    assert.equal(body.reasoning_effort,"low");
    assert.equal(body.max_completion_tokens,8192);
    assert.equal(body.temperature,undefined);
    assert.equal(body.max_tokens,undefined);
    assert.equal(body.store,false);
    assert.equal(body.tools,undefined);
    return Response.json({choices:[{finish_reason:"stop",message:{role:"assistant",content:JSON.stringify({answer:"Recovery supports adaptation between demanding sessions.",action:"none"})}}]});
  }});
  assert.equal(calls,1);
  assert.equal(result.status,"answered");
  assert.equal(coachTextConfigured({...env,OPENAI_TEXT_MODEL:"unreviewed-model"}),false);
});

test("explicit legacy model retains its supported request parameters", () => {
  assert.deepEqual(coachModelParameters("gpt-4.1-mini",1200),{temperature:0.2,max_tokens:1200});
});
