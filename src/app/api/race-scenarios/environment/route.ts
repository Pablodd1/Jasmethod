import { trainingAccess, ApiError } from '@/lib/access';
import { rateLimit } from '@/lib/ratelimit';
import { getRaceEnvironment } from '@/lib/race-environment';
import { validateRaceWeatherRequest } from '@/lib/race-weather';
import { readScenarioJson, scenarioError, SCENARIO_HEADERS } from '@/lib/race-scenario-http';
import { appMutationOriginAllowed } from '@/lib/request-origin';
export const maxDuration = 60;
export async function POST(req: Request) {
    try {
        const { actor } = await trainingAccess(req);
        if (!appMutationOriginAllowed(req))
            throw new ApiError('Invalid request origin', 403);
        if (!rateLimit(`race-environment:${actor.id}`, 6, 60000).ok)
            throw new ApiError('Please wait before requesting conditions again', 429);
        const body = await readScenarioJson(req, 2048);
        let input;
        try {
            input = validateRaceWeatherRequest(body);
        }
        catch (e) {
            throw new ApiError((e as Error).message);
        }
        const result = await getRaceEnvironment(input, { userAgent: process.env.RACE_WEATHER_USER_AGENT ?? 'JasMiamiMethod/1.0 (+https://github.com/Pablodd1/Jasmethod)' });
        return Response.json(result, { headers: SCENARIO_HEADERS });
    }
    catch (e) {
        return scenarioError(e);
    }
}
