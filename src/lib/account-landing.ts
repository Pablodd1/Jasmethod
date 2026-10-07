export function accountLanding(onboarded: unknown) {
  return onboarded === true ? "/today" : "/onboard";
}
