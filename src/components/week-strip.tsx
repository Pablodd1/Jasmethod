"use client";

// Week strip: horizontal scroll of days from the start of the previous month
// through the end of next week. Today is pinned in view on mount; each day
// shows its workouts (color-coded by sport) and tap → selects the day.
import { useEffect, useMemo, useRef } from "react";
import {
  format,
  isSameDay,
  addMonths,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { useAuth } from "./auth";
import { dateKey } from "@/lib/dates";
import { Dumbbell } from "lucide-react";

const SPORT_COLOR: Record<string, string> = {
  swim: "bg-sky-100 text-sky-700",
  bike: "bg-emerald-100 text-emerald-700",
  run: "bg-orange-100 text-orange-700",
  strength: "bg-purple-100 text-purple-700",
  brick: "bg-red-100 text-red-700",
  hyrox: "bg-amber-100 text-amber-700",
  boxing: "bg-rose-100 text-rose-700",
  recovery: "bg-slate-100 text-slate-600",
};

export function WeekStrip({
  workouts,
  selected,
  onSelect,
}: {
  workouts: any[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const { user } = useAuth();
  const todayKey = dateKey(new Date(), user?.timezone);
  const scroller = useRef<HTMLDivElement>(null);

  const days = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(addMonths(now, -1));
    const end = endOfMonth(addMonths(now, 1));
    const out: Date[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1))
      out.push(new Date(d));
    return out;
  }, []);

  // Scroll today into view on first render.
  useEffect(() => {
    const el = scroller.current?.querySelector(`[data-day="${todayKey}"]`);
    el?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={scroller}
      className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1"
      data-testid="week-strip"
    >
      {days.map((d) => {
        const key = format(d, "yyyy-MM-dd");
        const dayWorkouts = workouts.filter(
          (w) => dateKey(new Date(w.date), user?.timezone) === key,
        );
        const isToday = isSameDay(d, new Date());
        const isSel = selected === key;
        return (
          <button
            key={key}
            data-day={key}
            onClick={() => onSelect(key)}
            className={`shrink-0 w-[104px] rounded-xl border p-2 text-left transition-colors cursor-pointer hover:border-ocean-400 ${
              isSel
                ? "border-ocean-500 bg-ocean-50"
                : isToday
                  ? "border-ocean-400 bg-white"
                  : "border-sand-200 bg-white"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase text-slate-400">
                {format(d, "EEE")}
              </span>
              <span
                className={`text-xs font-bold ${isToday ? "text-ocean-600" : "text-slate-500"}`}
              >
                {format(d, "MMM d")}
              </span>
            </div>
            <div className="mt-1 space-y-0.5 min-h-[34px]">
              {dayWorkouts.length === 0 && (
                <div className="text-[10px] text-slate-300">—</div>
              )}
              {dayWorkouts.slice(0, 2).map((w) => (
                <div
                  key={w.id}
                  className={`text-[9px] rounded px-1 py-0.5 truncate ${SPORT_COLOR[w.sport] || "bg-slate-100 text-slate-600"} ${w.completed ? "line-through opacity-60" : ""}`}
                >
                  <Dumbbell className="w-2 h-2 inline mr-0.5" />
                  {w.title.split(":").pop()?.trim().slice(0, 14)}
                </div>
              ))}
              {dayWorkouts.length > 2 && (
                <div className="text-[9px] text-slate-400">
                  +{dayWorkouts.length - 2} more
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
