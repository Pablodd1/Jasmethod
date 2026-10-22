import { trainingAccess, ApiError } from '@/lib/access';
import { rateLimit } from '@/lib/ratelimit';
import { eventLookupInput, lookupRaceEvents, lookupRaceVenue } from '@/lib/race-event-lookup';
import { readScenarioJson, scenarioError, SCENARIO_HEADERS } from '@/lib/race-scenario-http';
import { appMutationOriginAllowed } from '@/lib/request-origin';
export async function POST(req: Request) {
    try {
        const { actor } = await trainingAccess(req);
        if (!appMutationOriginAllowed(req))
            throw new ApiError('Invalid request origin', 403);
        if (!rateLimit(`race-lookup:${actor.id}`, 6, 60000).ok)
            throw new ApiError('Please wait before searching again', 429);
        const body = await readScenarioJson(req, 2048);
        if (body.mode === 'venue') {
            if (Object.keys(body).some(k => !['mode', 'query'].includes(k)) || typeof body.query !== 'string')
                throw new ApiError('Use a public US event address');
            return Response.json({ venues: await lookupRaceVenue(body.query) }, { headers: SCENARIO_HEADERS });
        }
        let input;
        try {
            input = eventLookupInput(body);
        }
        catch (e) {
            throw new ApiError((e as Error).message);
        }
        return Response.json({ candidates: await lookupRaceEvents(input), requiresConfirmation: true }, { headers: SCENARIO_HEADERS });
    }
    catch (e) {
        return scenarioError(e instanceof ApiError ? e : new ApiError('Event lookup unavailable. Your saved race has not changed.', 503));
    }
}
