import { addDaysKey, dateKey } from "./dates";
import { isDemanding, type ProtocolId } from "./protocols";

type Session = {
  id: string;
  date: Date;
  sport: string;
  durationMin: number;
  intensity?: string | null;
  type?: string | null;
  rpe?: number | null;
};
export function reviewProtocolSchedule(opts: {
  selected: Session;
  candidate: Session;
  nearby: Session[];
  timezone: string;
  level: string;
  protocolId: ProtocolId;
  nextRace?: Date | null;
}) {
  const { selected, candidate, timezone } = opts;
  const key = dateKey(selected.date, timezone);
  const weekday = new Date(`${key}T12:00Z`).getUTCDay();
  const monday = addDaysKey(key, -((weekday + 6) % 7));
  const week = opts.nearby.filter(
    (w) =>
      w.id !== selected.id &&
      dateKey(w.date, timezone) >= monday &&
      dateKey(w.date, timezone) < addDaysKey(monday, 7),
  );
  const warnings: string[] = [],
    blocks: string[] = [];
  const hardEndurance = (w: Session) =>
    w.sport !== "strength" && isDemanding(w);
  const cap = opts.level === "beginner" ? 1 : 2;
  const hardCount = week.filter(hardEndurance).length;
  if (hardEndurance(candidate) && hardCount >= cap) {
    const note = `This week already contains ${hardCount} demanding endurance sessions. The app starting limit is ${cap} across sports.`;
    if (!hardEndurance(selected))
      blocks.push(`${note} Replace an existing demanding session instead.`);
    else
      warnings.push(
        `${note} This replacement does not add another session; review the overall load.`,
      );
  }
  const adjacent = opts.nearby.filter(
    (w) =>
      w.id !== selected.id &&
      isDemanding(w) &&
      Math.abs(Date.parse(dateKey(w.date, timezone)) - Date.parse(key)) <
        2 * 86400000,
  );
  if (isDemanding(candidate) && adjacent.length) {
    const note = `${adjacent.length} demanding session(s) occur on this or an adjacent day. Preserve recovery and separate lifting from fatiguing endurance.`;
    if (!isDemanding(selected))
      blocks.push(
        `${note} Select a different session or reorganize the schedule first.`,
      );
    else warnings.push(note);
  }
  if (opts.nextRace) {
    const days = Math.round(
      (Date.parse(dateKey(opts.nextRace, timezone)) - Date.parse(key)) /
        86400000,
    );
    if (days >= 0 && days <= 14 && opts.protocolId !== "aerobic-base")
      warnings.push(
        `A race is ${days} days away. Use only familiar work at a reduced dose; avoid introducing a new stimulus in the taper.`,
      );
  }
  if (candidate.durationMin > selected.durationMin)
    blocks.push("The protocol exceeds the selected session's time budget.");
  return { warnings, blocks };
}
