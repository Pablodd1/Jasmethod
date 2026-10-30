import test from "node:test";
import assert from "node:assert/strict";
import { personalRecordEntry, personalRecordText, type RecordDraft } from "./personal-record-entry";
const draft: RecordDraft = {sport:"run",metric:"time",label:"5K",result:"24:30",distance:"5",distanceUnit:"km",date:"2026-10-01",units:"min/km"};
test("sport results accept clocks and preserve distance, source date and metric without user conversion",()=>{
  const record = personalRecordEntry(draft,"2026-10-30");
  assert.deepEqual(record,{label:"run · 5K · 5 km · time",value:24.5,unit:"min",date:"2026-10-01"});
  assert.equal(personalRecordText(record.value,record.unit),"24:30");
  assert.equal(personalRecordEntry({...draft,sport:"triathlon",label:"70.3",result:"5:12:30",distance:""},"2026-10-30").value,312.5);
  assert.equal(personalRecordEntry({...draft,sport:"bike",metric:"power",result:"247"},"2026-10-30").unit,"W");
  assert.equal(personalRecordEntry({...draft,sport:"swim",metric:"pace",result:"1:40",units:"min/100m"},"2026-10-30").unit,"min/100m");
  assert.equal(personalRecordText(100/60,"min/100m"),"1:40/100m");
});
test("invalid clock, impossible/future date, missing units and ambiguous values cannot become records",()=>{
  for(const patch of [{result:"1:99"},{result:"0"},{result:"-2"},{date:"2026-02-30"},{date:"2026-11-01"},{date:""},{distance:"-5"},{metric:"speed",units:"sec"},{label:""},{result:null}])assert.throws(()=>personalRecordEntry({...draft,...patch} as RecordDraft,"2026-10-30"));
});
