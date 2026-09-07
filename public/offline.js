const status = document.getElementById("status"),
  sessions = document.getElementById("sessions");
function clear() {
  Object.keys(localStorage)
    .filter(
      (k) =>
        k.startsWith("jmm_today_") ||
        k.startsWith("jmm_checkin_") ||
        k === "jmm_last_user",
    )
    .forEach((k) => localStorage.removeItem(k));
  sessions.replaceChildren();
  status.textContent = "No saved copy on this device.";
}
document.getElementById("clear").onclick = clear;
try {
  const id = localStorage.getItem("jmm_last_user"),
    saved = JSON.parse(localStorage.getItem(`jmm_today_${id}`) || "null");
  if (!saved)
    status.textContent =
      "No saved plan. Open Today while online to save a copy.";
  else {
    status.textContent = `Plan date: ${saved.date}. Saved: ${new Date(saved.updatedAt).toLocaleString()}. Check the date before using this copy.`;
    for (const s of saved.sessions) {
      const article = document.createElement("article"),
        h = document.createElement("h2"),
        p = document.createElement("p");
      h.textContent = s.title;
      p.textContent = `${s.durationMin} planned min · ${s.intensity} · ${s.feedbackStatus || (s.completed ? "completed" : "planned")}${s.actualDurationMin != null ? ` · ${s.actualDurationMin} actual min` : ""}`;
      article.append(h, p);
      for (const step of s.prescription.steps) {
        const line = document.createElement("p");
        line.textContent = `${step.name}: ${Math.floor(step.seconds / 60)}:${String(step.seconds % 60).padStart(2, "0")} · ${step.zone}`;
        article.append(line);
      }
      sessions.append(article);
    }
  }
} catch {
  status.textContent = "Saved plan could not be read. Reconnect to refresh it.";
}
