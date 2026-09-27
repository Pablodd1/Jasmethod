import {test} from "node:test";
import assert from "node:assert/strict";
import {benchmarkResult} from "./benchmark-result";
test("critical power never overwrites FTP; 5k never becomes measured threshold",()=>{
 assert.deepEqual(benchmarkResult("cp",270).patch,{cp:270});
 assert.deepEqual(benchmarkResult("run5k",1200).patch,{});
 assert.deepEqual(benchmarkResult("ftp",250).patch,{ftp:250});
});
test("missing, nonnumeric, impossible and unknown benchmark results are rejected",()=>{
 for(const v of [null,"",true,"250watts",NaN,Infinity,-1,0,9999]) assert.throws(()=>benchmarkResult("ftp",v));
 assert.throws(()=>benchmarkResult("run5k",60));
 assert.throws(()=>benchmarkResult("unknown",100));
});
