// Bounded provider calls. Only safe reads are retried automatically.
export async function providerFetch(url: string | URL, init: RequestInit = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15000),
    });
    if (
      attempt === 0 &&
      (!init.method || init.method === "GET") &&
      (response.status === 429 || response.status >= 500)
    ) {
      const delay = Math.min(
        2000,
        Math.max(250, Number(response.headers.get("retry-after") || 1) * 1000),
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    return response;
  }
  throw new Error("Provider unavailable");
}
