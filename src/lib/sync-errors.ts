// Only authentication-specific evidence should ask an athlete to reconnect.
export function isSyncAuthFailure(message: string): boolean {
  if (/^Strava activity data needs review:/i.test(message)) return false;
  return /\b(?:401|unauthorized|invalid_grant|invalid_token)\b|\breconnect\b|(?:expired|invalid|revoked)\s+(?:access\s+|refresh\s+)?token|token\s+(?:expired|invalid|revoked)|authorization\s+(?:failed|expired|revoked|required)/i.test(message);
}
