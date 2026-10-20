/**
 * Hosted Cal.com is optional. Never invent an event slug or claim live availability.
 * The free individual hosted product avoids running a second scheduling server.
 */
export function verifiedBookingUrl(value: string | undefined | null): string | null {
  if (!value || value.length > 320) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "cal.com" || url.username || url.password ||
        url.search || url.hash || url.pathname === "/" ||
        url.pathname.split("/").filter(Boolean).length < 2) return null;
    return url.toString();
  } catch {
    return null;
  }
}
