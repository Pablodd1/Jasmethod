import Link from "next/link";

/** A shared route map; navigation never saves answers or replaces a plan. */
export function TrainingWorkflowNav({ active, es = false }: { active: "setup" | "plan" | "races"; es?: boolean }) {
  const steps = [
    { id: "setup", href: "/onboard?redo=1&step=race&return=training", label: es ? "Tu base" : "Your basics" },
    { id: "plan", href: "/training", label: es ? "Tu plan" : "Your plan" },
    { id: "races", href: "/races", label: es ? "Carreras" : "Races" },
  ];
  return <nav aria-label={es ? "Entrenamiento y carreras" : "Training and races"} className="grid grid-cols-3 gap-1 rounded-xl border border-sand-200 bg-white p-1">
    {steps.map(step => <Link key={step.id} href={step.href} aria-current={step.id === active ? "page" : undefined} className={`flex min-h-11 min-w-0 items-center justify-center rounded-lg px-2 text-center text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocean-700 ${step.id === active ? "bg-ocean-800 text-white" : "text-ocean-800 hover:bg-sand-100"}`}>{step.label}</Link>)}
  </nav>;
}
