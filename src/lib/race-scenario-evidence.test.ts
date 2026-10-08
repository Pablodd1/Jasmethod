import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRaceScenarioAnchors} from './race-scenario-evidence';
const now=new Date('2026-10-08T12:00Z');
const base={id:'a',type:'run5k',result:1500,date:new Date('2026-10-01T12:00Z'),name:'5 km',completed:true,skipped:false};
test('5 km results use arithmetic only, FTP stays a reference, undated profile stays unavailable',()=>{const a=buildRaceScenarioAnchors([base,{...base,id:'f',type:'ftp',result:250}],{ftp:270},now);assert.equal(a[0].value,300);assert.equal(a[1].value,250);assert.equal(a[2].usable,false);assert.equal(a[2].observedAt,null);});
test('missing, skipped, stale, future and unknown sport anchors cannot silently become capacity',()=>{assert.equal(buildRaceScenarioAnchors([{...base,skipped:true},{...base,result:null}],null,now).length,0);for(const t of [{...base,date:new Date('2020-01-01')},{...base,date:new Date('2027-01-01')},{...base,type:'cp'},{...base,type:'lthr'}])assert.equal(buildRaceScenarioAnchors([t],null,now)[0].usable,false);});
