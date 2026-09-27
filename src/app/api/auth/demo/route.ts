export async function POST() {
  return Response.json({error: "Shared demo login is disabled. Sign in with your own account."}, {status: 410});
}
