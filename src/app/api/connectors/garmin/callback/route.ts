export function GET() {
  return Response.json(
    { error: "Direct Garmin sync is not enabled; upload TCX or Garmin CSV." },
    { status: 503 },
  );
}
