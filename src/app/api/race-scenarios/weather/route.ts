import {trainingAccess,ApiError} from '@/lib/access';
import {rateLimit} from '@/lib/ratelimit';
import {getRaceScenarioWeather,validateRaceWeatherRequest} from '@/lib/race-weather';
import {readScenarioJson,scenarioError,SCENARIO_HEADERS} from '@/lib/race-scenario-http';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{const {actor}=await trainingAccess(req);if(!rateLimit(`race-weather:${actor.id}`,12,60000).ok)throw new ApiError('Please wait before requesting weather again',429);const body=await readScenarioJson(req,4096);let input;try{input=validateRaceWeatherRequest(body);}catch(e){throw new ApiError((e as Error).message);}const result=await getRaceScenarioWeather(input,{userAgent:process.env.RACE_WEATHER_USER_AGENT??'JasMiamiMethod/1.0 (+https://github.com/Pablodd1/Jasmethod)'});return Response.json(result,{headers:SCENARIO_HEADERS});}catch(e){return scenarioError(e);}}
