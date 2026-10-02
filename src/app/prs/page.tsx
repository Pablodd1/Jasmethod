import { redirect } from "next/navigation";

// Personal Records moved into Profile & Zones (Settings → Personal records —
// computed PRs from devices + user-editable manual marks). Keep old
// bookmarks/links working.
export default function PrsPage() {
  redirect("/settings#personal-records");
}
