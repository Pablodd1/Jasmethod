# Daily athlete workflow and optional debrief — 17 October 2026

Today now exposes owner-scoped performed activities before the planned workout. Each provider's record retains its own minutes, effort, distance, HR, sport-specific average watts and reported energy. Possible copies remain separate and totals are withheld; the existing reconciliation workflow decides whether records describe one or separate sessions. Recorded average pace uses recorded time and distance, never planned distance or a threshold inference. Labels do not promise matching moving/elapsed time between providers.

An imported record can be selected for its own quick debrief on Today: outcome, actual minutes and session RPE, plus optional HR, average watts, reported kcal and pre/post kg. Today and Daily use the same audited owner-scoped writer. Daily reloads optional measurements. Current form revisions guard against overwriting intervening corrections; future actuals are rejected. Missing values remain unknown, zero power/calories/intake remain reportable, and weight is not silently applied to the profile.

Short saved plans (under ten minutes, a presentation-review threshold, not a physiological minimum) explain the current saved weekly budget and link to history/setup review and cycle regeneration. This does not increase a real athlete's training, replace the saved cycle, resolve copies, or answer the daily safety check-in. An incorrect baseline needs an evidence-reviewed replacement. The weekly budget is distinct from maximum minutes per day. The generator can distribute a small budget across several sports and subsequent cycle reductions can shorten it further. A generic steady run no longer advertises `+ Strides` when its executable active steps contain no named stride block; actual steps and durations are unchanged and the canonical revision reflects the title.

RPE guidance remains visible alongside supplied pace/HR/power targets. A zone-derived effort reference is labeled as such, not presented as measured effort. Running watts are never inferred from cycling FTP. Missing validated sport/device-specific anchors do not become numeric targets. This change does not add simultaneous independent HR/pace/power prescriptions or a running-power threshold model.

## Fuel and body-mass interpretation

Device-reported kcal are estimates and are separate from prescribed carbohydrate. Before/during/after fueling continues to use the existing duration/intensity, weight, practiced tolerance and turnaround evidence. No calorie-to-carbohydrate replacement equation is introduced.

Optional fluid, carbohydrate and gut-symptom reports now also accept urine mL (explicit zero if none; blank remains unknown). The debrief shows saved net mass change. It estimates sweat rate only when both weights, actual duration, fluid intake and urine are known:

`L/h = (pre kg − post kg + fluid mL / 1000 − urine mL / 1000) / actual hours`

This field estimate requires comparable dry weighing conditions and is affected by food, wet clothing, respiratory/metabolic mass changes and duration. Negative balance is not clamped into a fabricated sweat estimate. It does not measure sodium, establish a clinical diagnosis or automatically update hydration/nutrition targets. The legacy weight-only advice no longer calls a mass difference a sweat rate, diagnoses dehydration from weight alone, or forces a fixed replacement dose.

Sources: [NATA fluid replacement position statement](https://pmc.ncbi.nlm.nih.gov/articles/PMC5634236/) and [ACSM exercise and fluid replacement](https://pubmed.ncbi.nlm.nih.gov/17277604/). Fueling context: [AND/DC/ACSM Nutrition and Athletic Performance](https://pubmed.ncbi.nlm.nih.gov/26891166/).

## Verification boundaries

Use synthetic records to test persistence, owner isolation, local dates, copied records, zero/unknown handling, invalid inputs, future results, mass-balance arithmetic and reload. Browser acceptance must inspect the actual Today flow without fabricating an athlete's readiness, effort, food, weight or activity. Real messaging and watch receipt need separate acceptance evidence. No new external AI data sharing, fine-tuning, fitted response model, scientific efficacy or predicted-energy accuracy is claimed.
