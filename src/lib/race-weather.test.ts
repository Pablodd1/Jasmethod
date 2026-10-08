import test from "node:test";
import assert from "node:assert/strict";
import { clearRaceWeatherCacheForTests, getRaceScenarioWeather, parseRaceWeatherForecast, validateRaceWeatherRequest, type RaceWeatherRequest } from "./race-weather";
const request: RaceWeatherRequest = {latitude: 10.123456, longitude: 20.123456, at:"2026-10-09T02:00:00Z", timeZone:"UTC"};
const fixture = () => ({properties:{meta:{updated_at:"2026-10-08T00:00:00Z",units:{air_temperature:"celsius",relative_humidity:"%",wind_speed:"m/s",wind_from_direction:"degrees",precipitation_amount:"mm"}},timeseries:[0,6].map(h=>({time:`2026-10-09T0${h}:00:00Z`,data:{instant:{details:{air_temperature:20,relative_humidity:70,wind_speed:5,wind_from_direction:90}},...(h===0?{next_6_hours:{details:{precipitation_amount:6}}}:{})}}))}});
test("forecast retains nearest sample time and precipitation interval",()=>{
  const result = parseRaceWeatherForecast(fixture(),request,"2026-10-08T00:00:00Z");
  assert.equal(result.kind,"forecast"); assert.equal(result.point?.at,"2026-10-09T00:00:00.000Z");
  assert.equal(result.point?.precipitation?.intervalEnd,"2026-10-09T06:00:00.000Z");
  assert.equal(result.point?.precipitation?.amountMm,6); assert.ok(result.attribution[0].text.includes("MET Norway"));
});
test("out-of-horizon dates never return current weather or fabricated climatology",()=>{
  const result = parseRaceWeatherForecast(fixture(),{...request,at:"2027-10-09T02:00:00Z"},"2026-10-08T00:00:00Z");
  assert.equal(result.kind,"unavailable"); assert.equal(result.status,"outside_horizon"); assert.equal(result.point,null); assert.equal(result.points.length,0);
});
test("missing units or values remain null",()=>{
  const raw = fixture(); delete (raw.properties.meta.units as Record<string,unknown>).relative_humidity;
  const result = parseRaceWeatherForecast(raw,request,"2026-10-08T00:00:00Z");
  assert.equal(result.point?.humidityPct,null); assert.equal(result.points[1].precipitation,null);
});
test("reject invalid coordinates, bare local date, unknown zone, health fields",()=>{
  for (const invalid of [{...request,latitude:NaN},{...request,longitude:181},{...request,at:"2026-10-09T02:00"},{...request,timeZone:"Bad/Zone"},{...request,heartRate:100},{...request,altitudeM:1.5},{...request,at:"2026-02-30T00:00:00Z"},{...request,at:"2026-10-09T02:00:00+05:00",timeZone:"UTC"}]) assert.throws(()=>validateRaceWeatherRequest(invalid));
});
test("fetch sends event coordinates only and cache honors Expires",async()=>{
  clearRaceWeatherCacheForTests(); let calls=0; const now=Date.parse("2026-10-08T00:00:00Z");
  const fetcher: typeof fetch = async (url, options)=>{
    calls++; const parsed=new URL(String(url)); assert.equal(parsed.hostname,"api.met.no");
    assert.equal(parsed.searchParams.get("lat"),"10.1234"); assert.equal(parsed.searchParams.get("lon"),"20.1234");
    assert.equal([...parsed.searchParams.keys()].length,2); assert.equal(options?.redirect,"error");
    return new Response(JSON.stringify(fixture()),{headers:{Expires:new Date(now+3600000).toUTCString(),"Last-Modified":new Date(now).toUTCString()}});
  };
  const options={fetcher,now:()=>now,userAgent:"RaceApp https://example.com/contact"};
  assert.equal((await getRaceScenarioWeather(request,options)).kind,"forecast");
  await getRaceScenarioWeather(request,options); assert.equal(calls,1);
});
test("bad identity and provider errors are honest unavailable states",async()=>{
  clearRaceWeatherCacheForTests(); assert.equal((await getRaceScenarioWeather(request,{userAgent:""})).status,"provider_unavailable");
  const fetcher:typeof fetch=async()=>new Response("blocked",{status:403});
  assert.equal((await getRaceScenarioWeather(request,{userAgent:"RaceApp https://example.com/contact",fetcher})).kind,"unavailable");
});

import { getRaceScenarioHistory, parseRaceHistoricalWeather, validateRaceHistoryRequest } from "./race-weather";
const historyRequest = { latitude:10,longitude:20,eventDate:"2027-04-20" };
const historical = () => ({header:{time_standard:"LST",fill_value:-999}, parameters:{T2M:{units:"C"},RH2M:{units:"%"},WS10M:{units:"m/s"}},properties:{parameter:{T2M:{"20210420":10,"20220420":20,"20230420":-999},RH2M:{"20210420":60,"20220420":80},WS10M:{"20210420":2,"20220420":4}}}});
test("history uses actual prior years and variable sample coverage",()=>{
  const r=parseRaceHistoricalWeather(historical(),historyRequest,"2026-10-08T00:00:00Z",Date.parse("2026-10-08T00:00:00Z"));
  assert.deepEqual(r.baselineYears,[2021,2022,2023,2024,2025]);assert.deepEqual(r.yearsWithData,[2021,2022]);
  assert.equal(r.expectedSamples,75);assert.equal(r.completeSamples,2);assert.equal(r.temperatureC?.median,15);assert.equal(r.temperatureC?.samples,2);
  assert.equal(r.kind,"historical_summary");assert.equal(r.timeStandard,"local_solar_daily");
});
test("history never counts fill values, unknown units or empty coverage as conditions",()=>{
  const raw=historical();raw.parameters.T2M.units="F";
  assert.equal(parseRaceHistoricalWeather(raw,historyRequest,"2026-10-08T00:00:00Z",Date.parse("2026-10-08")).temperatureC,null);
  assert.throws(()=>validateRaceHistoryRequest({...historyRequest,eventDate:"2027-02-29"}));
  assert.throws(()=>validateRaceHistoryRequest({...historyRequest,health:"private"}));
});
test("history safely handles leap day and cross-year windows",()=>{
  const r=parseRaceHistoricalWeather(historical(),{...historyRequest,eventDate:"2028-02-29"},"2026-10-08T00:00:00Z",Date.parse("2026-10-08"));
  assert.equal(r.expectedSamples,75);assert.ok(r.warnings.some(w=>w.includes("February 29")));
  const dec=parseRaceHistoricalWeather(historical(),{...historyRequest,eventDate:"2027-12-31"},"2026-10-08T00:00:00Z",Date.parse("2026-10-08"));
  assert.deepEqual(dec.baselineYears,[2020,2021,2022,2023,2024]);
});
test("history queries a fixed NASA endpoint without athlete inputs",async()=>{
  const fetcher:typeof fetch=async(url)=>{
    const u=new URL(String(url));assert.equal(u.hostname,"power.larc.nasa.gov");assert.equal(u.searchParams.get("parameters"),"T2M,RH2M,WS10M");
    assert.equal(u.searchParams.get("start"),"20210413");assert.equal(u.searchParams.get("end"),"20250427");
    return new Response(JSON.stringify(historical()));
  };
  const r=await getRaceScenarioHistory(historyRequest,{fetcher,now:()=>Date.parse("2026-10-08")});assert.equal(r.kind,"historical_summary");
});

test("expired weather cache uses conditional revalidation and preserves data on 304",async()=>{
  clearRaceWeatherCacheForTests();let clock=Date.parse("2026-10-08T00:00:00Z"),calls=0;
  const modified=new Date(clock).toUTCString();
  const fetcher:typeof fetch=async(_url,options)=>{
    calls++;if(calls===1)return new Response(JSON.stringify(fixture()),{headers:{Expires:new Date(clock+1000).toUTCString(),"Last-Modified":modified}});
    assert.equal((options?.headers as Record<string,string>)["If-Modified-Since"],modified);
    return new Response(null,{status:304,headers:{Expires:new Date(clock+3600000).toUTCString()}});
  };
  const options={fetcher,now:()=>clock,userAgent:"RaceApp https://example.com/contact"};
  await getRaceScenarioWeather(request,options);clock+=2000;
  const result=await getRaceScenarioWeather(request,options);assert.equal(result.kind,"forecast");assert.equal(calls,2);
});
test("weather rejects oversized provider response and handles stale fallback honestly",async()=>{
  clearRaceWeatherCacheForTests();let clock=Date.parse("2026-10-08T00:00:00Z"),calls=0;
  const fetcher:typeof fetch=async()=>++calls===1?new Response(JSON.stringify(fixture()),{headers:{Expires:new Date(clock+1000).toUTCString()}}):new Response("large",{headers:{"Content-Length":"2000000"}});
  const options={fetcher,now:()=>clock,userAgent:"RaceApp https://example.com/contact"};
  await getRaceScenarioWeather(request,options);clock+=2000;
  assert.equal((await getRaceScenarioWeather(request,options)).status,"stale");
});
