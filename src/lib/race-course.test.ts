import test from "node:test";
import assert from "node:assert/strict";
import { parseRaceCourseGpx, raceCourseDistanceM, RACE_GPX_MAX_BYTES } from "./race-course";
const wrap = (body: string) => `<gpx version="1.1"><trk><trkseg>${body}</trkseg></trk></gpx>`;
const point = (lat: number, lon: number, ele?: number) => `<trkpt lat="${lat}" lon="${lon}">${ele === undefined ? "" : `<ele>${ele}</ele>`}</trkpt>`;
test("course retains signed grades, ascent and descent", () => {
  const result = parseRaceCourseGpx(wrap(point(0,0,0)+point(0,0.01,10)+point(0,0.02,4)));
  assert.equal(result.ascentM,10); assert.equal(result.descentM,6);
  assert.ok(result.segments[0].gradePct! > 0); assert.ok(result.segments[1].gradePct! < 0);
  assert.equal(result.officialStatus,"unverified"); assert.equal(result.method.smoothing,"none");
});
test("missing elevation stays unknown, not sea level", () => {
  const result = parseRaceCourseGpx(wrap(point(0,0,10)+point(0,0.01)+point(0,0.02,20)));
  assert.equal(result.ascentM,null); assert.equal(result.descentM,null); assert.equal(result.elevationCoverage,0);
  assert.equal(result.profile[1].elevationM,null); assert.equal(result.segments[0].gradePct,null);
});
test("track segment gaps never create distance or ascent bridges", () => {
  const result = parseRaceCourseGpx(`<gpx version="1.1"><trk><trkseg>${point(0,0,0)+point(0,0.01,10)}</trkseg><trkseg>${point(40,40,1000)+point(40,40.01,1010)}</trkseg></trk></gpx>`);
  assert.ok(result.distanceM < 2300); assert.equal(result.ascentM,20); assert.equal(result.gapCount,1);
});
test("antimeridian and duplicate points remain finite", () => {
  assert.ok(raceCourseDistanceM({latitude:0,longitude:179.99},{latitude:0,longitude:-179.99}) < 2300);
  const result = parseRaceCourseGpx(wrap(point(0,0,1)+point(0,0,1)+point(0,0.01,2)));
  assert.equal(result.segments.length,1); assert.ok(Number.isFinite(result.segments[0].gradePct));
});
test("GPX safety boundaries reject malformed, entities, missing numeric data and multiple courses", () => {
  for (const xml of ["<gpx>", '<!DOCTYPE gpx [<!ENTITY x "bad">]><gpx version="1.1"/>', wrap('<trkpt lat="" lon="0"/>'+point(0,1)), wrap(point(91,0)+point(0,1)), '<gpx version="1.1"><trk/><rte/></gpx>', "x".repeat(RACE_GPX_MAX_BYTES + 1), '<gpx version="1.1">'+"<x>".repeat(40)+"</x>".repeat(40)+"</gpx>"]) assert.throws(() => parseRaceCourseGpx(xml));
});
test("route GPX and namespace work, athlete extensions are not retained", () => {
  const result = parseRaceCourseGpx('<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1" version="1.1"><g:rte><g:rtept lon="0" lat="0"><g:ele>0</g:ele><extensions><hr>180</hr></extensions></g:rtept><g:rtept lon="0.01" lat="0"><g:ele>1</g:ele></g:rtept></g:rte></g:gpx>');
  assert.equal(result.ascentM,1); assert.ok(!JSON.stringify(result).includes('"hr"'));
});

import { courseToScenarioSegments } from "./race-course";
test("profile stays within 2000 samples even with many track boundaries",()=>{
  const groups=Array.from({length:100},(_,j)=>`<trkseg>${Array.from({length:800},(_,i)=>`<trkpt lat="${(10+j*.01+i*.000001).toFixed(6)}" lon="10"><ele>1</ele></trkpt>`).join("")}</trkseg>`).join("");
  const r=parseRaceCourseGpx(`<gpx version="1.1"><trk>${groups}</trk></gpx>`);assert.ok(r.profile.length<=2000);
});
test("model conversion retains separate uphill/downhill runs and path distance",()=>{
  const r=parseRaceCourseGpx(wrap(point(0,0,0)+point(0,0.01,10)+point(0,0.02,20)+point(0,0.03,5)));
  const segments=courseToScenarioSegments(r);assert.equal(segments.length,2);assert.ok(segments[0].grade>0);assert.ok(segments[1].grade<0);
  assert.ok(segments.reduce((sum,s)=>sum+s.distanceM,0)>r.distanceM);
  assert.throws(()=>courseToScenarioSegments(parseRaceCourseGpx(wrap(point(0,0)+point(0,0.01)))));
});
test("model reduction checks raw steep grades before averaging and retains exact path distance",()=>{
  const r=parseRaceCourseGpx(wrap(point(0,0,0)+point(0,0.001,40)+point(0,0.1,41)));
  assert.throws(()=>courseToScenarioSegments(r),/raw course section/);
  const s=courseToScenarioSegments(r,{maxAbsGrade:0.45});
  const expected=r.segments.reduce((n,x)=>n+Math.hypot(x.distanceM,x.elevationChangeM!),0);
  assert.ok(Math.abs(s.reduce((n,x)=>n+x.distanceM,0)-expected)<1e-7);
});

test("comment text cannot hide excessive XML nesting from the depth guard",()=>{const hidden='<!-- '+('</x>'.repeat(100))+' -->';const xml='<gpx version="1.1">'+hidden+'<x>'.repeat(40)+'</x>'.repeat(40)+'</gpx>';assert.throws(()=>parseRaceCourseGpx(xml),/deeply nested/);});
