# Personalized Coach conversation repair

## Verified problems

PR95 is merged. An already-open browser tab retained the older UI until reload. The deployed PR95 page still uses surrounding application navigation and a short viewport calculation; this leaves too little space for the conversation. Browser dictation writes only to a separate transcript panel. External AI only receives fixed education topics, so enabling the existing switch cannot provide an actual personal dialogue. Production environment metadata contains no OPENAI_API_KEY; the local project configuration contains none either. No secret value was read or printed.

## Implemented behavior

- Dedicated Coach uses an immersive authenticated shell with an exit back to Today; original screens remain available.
- Dictation streams into the main composer, keeps typing available after failure, surfaces errors beside the microphone, and requires transcript review before Send. Corrections update the draft. No automatic messages or athlete writes.
- A separately consented OpenAI dialogue channel accepts explicitly athlete-authored messages, including health concerns the athlete chooses to describe. It supports relevant follow-up questions using at most eight previously consented messages from that channel and generation.
- The provider cannot accept app profile objects, sessions, metrics, imports, tool cards, screenshots or arbitrary caller-supplied history. The authenticated service selects owner-scoped trusted channel history and excludes local, imported, legacy and unknown-origin messages. Device/export indicators are an additional refusal check, not proof of provenance. Athletes must not copy those records into personal messages; an origin declaration does not establish rights.
- Read-only action enums can open existing protected profile, cycle, race and current-workout review tools. Outputs are rendered directly and never returned to the model. Existing proposals, revisions, idempotency and explicit save receipts continue to own all mutations.
- Urgent symptom handling remains local. Other injury discussions cannot become diagnosis, medical clearance, dosing or executable workout prescriptions. Locally appended safety replies are excluded from external memory.
- English/Spanish policy explains the separate optional dialogue, health-message consent and bounded isolated memory. No credential creation/rotation or automatic provider fallback.

## Required real-world release checks

An existing OpenAI API key must be securely installed in the production project and the existing external-AI feature flag configured intentionally. No key may be pasted into chat. A real harmless model exchange and real microphone transcription still require verification; mocked contract/browser tests do not certify those. No complete Garmin compliance, sports-medicine validation, model benchmark or autonomous coaching certification is claimed.
