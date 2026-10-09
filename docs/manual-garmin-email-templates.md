# Manual Garmin workout email templates

Copy reference for `src/lib/manual-workout-email-template.ts`. Subjects and plain-text bodies below are generated from the same renderer as the HTML email. The caller supplies localized dates and canonical content in the selected language.

## Sender contract

- Use only after the athlete has explicitly consented to email delivery of workout instructions, supported targets, preparation, fueling guidance and the workout graphic. This template does not grant or record consent.
- Pass verified, athlete-scoped current content in `readyPlan`: `summary`, ordered `steps`, `preparation`, `before`, `during`, `after`, and `limitations`. Do not put names, workout titles, health symptoms or private review reasons into these fields. Do not fabricate heart-rate zones, VO2max, weather, nutrition doses or missing targets. State missing information honestly. Only include targets supported by the current canonical plan.
- `ready` and `revised`: recheck the current revision and safety state immediately before sending; attach the exact current FIT. Attach the canonical workout PNG with the matching `graphicCid` when provided, and a meaningful `graphicAlt`. Ensure detailed step text remains readable when email images are blocked. `readyPlan` is optional in the renderer; callers that promise complete emailed guidance must provide it.
- `held` and `cancelled`: attach no actionable FIT and no workout graphic. The renderer discards `readyPlan` for these states; the sender must also suppress attachments. Keep reasons in the authenticated app.
- Use `<APP_ORIGIN>/daily?sessionId=<URL_ENCODED_SESSION_ID>` for authenticated current-plan review and `<APP_ORIGIN>/workout-email/settings` to manage or pause these emails. The caller validates the configured trusted app origin and session ownership. The renderer additionally rejects unsafe URL schemes, URL credentials and mixed origins, and escapes all dynamic HTML text/attributes.
- An email or FIT attachment establishes neither a completed download nor Garmin transfer nor on-watch receipt. “Download ready” means the file is available; transfer remains unverified. Do not infer compatibility from successful FIT encoding.
- Old attachments cannot be replaced remotely. Revised messages warn that a prior on-device workout may need manual deletion using model-specific instructions. Held/cancelled messages tell the athlete not to use old files; nothing claims automatic removal.
- Manual transfer requires a compatible Garmin and computer with a data-capable USB cable. The destination is usually Garmin/NewFiles; support depends on model, firmware and operating system. Mac MTP access can require Windows. These templates do not promise universal phone-only import, Garmin Connect activity-upload workout import, or automatic calendar placement.

## Source placeholders

`<LOCAL_DATE>` is the athlete-local display date; `<CANONICAL_REVISION>` is the revision that was checked before sending. Every `<CANONICAL_...>` value below is a labeled field from the approved current plan, not proposed athlete data. `canonical-workout.png` is an example attachment CID. The actual inline image is rendered from the same checked canonical workout. No additional personalized values are calculated by this template.

## Official Garmin guidance

- [Copy or back up Garmin device information and settings](https://support.garmin.com/en-GB/?faq=AXV7LuWgc73v21nq6nbDa6)
- [Access the Garmin folder on a Mac](https://support.garmin.com/en-MY/?faq=4NnyLlu0o5ASH4BVZ6QWPA)

These are supporting transfer/access references. Always check the model-specific manual and inspect the workout on the device before training. Physical-device acceptance remains unverified until observed.

## Copy previews

### EN · ready

Subject: Your workout file is ready · <LOCAL_DATE>

```text
Hi!

Your workout FIT file for <LOCAL_DATE> is attached.

Revision: <CANONICAL_REVISION>.

Download ready. Transfer to your Garmin has not been verified.

Open the full plan for your workout graphic, available targets, preparation and fueling guidance.
<APP_ORIGIN>/daily?sessionId=<URL_ENCODED_SESSION_ID>

<CANONICAL_WORKOUT_SUMMARY>

The workout graphic is included in the HTML email. The steps are listed below.

Workout and targets
1. <CANONICAL_ORDERED_STEP_WITH_EXACT_ENDPOINT_AND_SUPPORTED_TARGET>

Preparation
- <CANONICAL_PREPARATION_GUIDANCE>

Before: fueling and hydration
- <CANONICAL_BEFORE_FUELING_AND_HYDRATION>

During: fueling and hydration
- <CANONICAL_DURING_FUELING_AND_HYDRATION>

After: fueling and hydration
- <CANONICAL_AFTER_FUELING_AND_HYDRATION>

What to keep in mind
- <CANONICAL_MISSING_OR_UNVERIFIED_TARGETS_AND_LIMITATIONS>

Before heading out, check your gear, route and local conditions; bring appropriate fluids and cooling supplies when it is hot. Local weather has not been verified for this email. If you like, take a quiet minute to breathe or meditate to focus.

1. Save the attached FIT file to your computer. Check that your Garmin model supports workout files and USB transfer.
2. Connect it with a data-capable USB cable. Follow your model’s instructions to copy the file, usually to Garmin/NewFiles, then safely disconnect.
3. Find the workout on your Garmin and check every step against the current plan before starting.

Transfer steps depend on your model and operating system. Some MTP Garmin devices are not accessible in Mac Finder and may require Windows. JMM has not verified compatibility with your model and firmware.

Garmin file-transfer guide: https://support.garmin.com/en-GB/?faq=AXV7LuWgc73v21nq6nbDa6
Mac guidance: https://support.garmin.com/en-MY/?faq=4NnyLlu0o5ASH4BVZ6QWPA

Manage or pause these emails: <APP_ORIGIN>/workout-email/settings

JasMiamiMethod
```

### EN · revised

Subject: Your workout has a new version · <LOCAL_DATE>

```text
Hi!

Your workout for <LOCAL_DATE> has changed. The updated FIT file is attached.

Revision: <CANONICAL_REVISION>.

Download ready. Transfer to your Garmin has not been verified.

Open the full plan for your workout graphic, available targets, preparation and fueling guidance.
<APP_ORIGIN>/daily?sessionId=<URL_ENCODED_SESSION_ID>

Older email attachments do not update. Use this revision after checking the current plan. If you already transferred the previous workout, you may need to delete it manually from your Garmin following your model’s instructions; JMM does not remove it.

<CANONICAL_WORKOUT_SUMMARY>

The workout graphic is included in the HTML email. The steps are listed below.

Workout and targets
1. <CANONICAL_ORDERED_STEP_WITH_EXACT_ENDPOINT_AND_SUPPORTED_TARGET>

Preparation
- <CANONICAL_PREPARATION_GUIDANCE>

Before: fueling and hydration
- <CANONICAL_BEFORE_FUELING_AND_HYDRATION>

During: fueling and hydration
- <CANONICAL_DURING_FUELING_AND_HYDRATION>

After: fueling and hydration
- <CANONICAL_AFTER_FUELING_AND_HYDRATION>

What to keep in mind
- <CANONICAL_MISSING_OR_UNVERIFIED_TARGETS_AND_LIMITATIONS>

Before heading out, check your gear, route and local conditions; bring appropriate fluids and cooling supplies when it is hot. Local weather has not been verified for this email. If you like, take a quiet minute to breathe or meditate to focus.

1. Save the attached FIT file to your computer. Check that your Garmin model supports workout files and USB transfer.
2. Connect it with a data-capable USB cable. Follow your model’s instructions to copy the file, usually to Garmin/NewFiles, then safely disconnect.
3. Find the workout on your Garmin and check every step against the current plan before starting.

Transfer steps depend on your model and operating system. Some MTP Garmin devices are not accessible in Mac Finder and may require Windows. JMM has not verified compatibility with your model and firmware.

Garmin file-transfer guide: https://support.garmin.com/en-GB/?faq=AXV7LuWgc73v21nq6nbDa6
Mac guidance: https://support.garmin.com/en-MY/?faq=4NnyLlu0o5ASH4BVZ6QWPA

Manage or pause these emails: <APP_ORIGIN>/workout-email/settings

JasMiamiMethod
```

### EN · held

Subject: Your workout is on hold · <LOCAL_DATE>

```text
Hi!

Your workout for <LOCAL_DATE> is on hold. No workout file is attached.

Revision: <CANONICAL_REVISION>.

No FIT file is available with this update.

View the current plan before training.
<APP_ORIGIN>/daily?sessionId=<URL_ENCODED_SESSION_ID>

Do not use older files for this workout. Check the current plan for what to do next. Files already transferred are not automatically removed from your Garmin.

Manage or pause these emails: <APP_ORIGIN>/workout-email/settings

JasMiamiMethod
```

### EN · cancelled

Subject: Your workout has been cancelled · <LOCAL_DATE>

```text
Hi!

Your workout for <LOCAL_DATE> has been cancelled. No workout file is attached.

Revision: <CANONICAL_REVISION>.

No FIT file is available with this update.

View the current plan before training.
<APP_ORIGIN>/daily?sessionId=<URL_ENCODED_SESSION_ID>

Do not use older files for this workout. Check the current plan for what to do next. Files already transferred are not automatically removed from your Garmin.

Manage or pause these emails: <APP_ORIGIN>/workout-email/settings

JasMiamiMethod
```

### ES · ready

Subject: Tu archivo de entrenamiento está listo · <LOCAL_DATE>

```text
¡Hola!

Adjuntamos el archivo FIT de tu entrenamiento del <LOCAL_DATE>.

Revisión: <CANONICAL_REVISION>.

Descarga lista. La transferencia a tu Garmin no está verificada.

Abre el plan completo para consultar el gráfico del entrenamiento, los objetivos disponibles, la preparación y la guía de alimentación.
<APP_ORIGIN>/daily?sessionId=<URL_ENCODED_SESSION_ID>

<CANONICAL_WORKOUT_SUMMARY>

El gráfico está incluido en la versión HTML del correo. Los pasos se detallan a continuación.

Entrenamiento y objetivos
1. <CANONICAL_ORDERED_STEP_WITH_EXACT_ENDPOINT_AND_SUPPORTED_TARGET>

Preparación
- <CANONICAL_PREPARATION_GUIDANCE>

Antes: alimentación e hidratación
- <CANONICAL_BEFORE_FUELING_AND_HYDRATION>

Durante: alimentación e hidratación
- <CANONICAL_DURING_FUELING_AND_HYDRATION>

Después: alimentación e hidratación
- <CANONICAL_AFTER_FUELING_AND_HYDRATION>

Qué debes tener en cuenta
- <CANONICAL_MISSING_OR_UNVERIFIED_TARGETS_AND_LIMITATIONS>

Antes de salir, revisa el material, la ruta y las condiciones locales; si hace calor, lleva líquidos adecuados y lo necesario para refrescarte. El tiempo local no se ha verificado para este correo. Si te apetece, dedica un minuto tranquilo a respirar o meditar para concentrarte.

1. Guarda el FIT adjunto en tu ordenador. Comprueba que tu modelo Garmin admite archivos de entrenamiento y transferencia por USB.
2. Conéctalo con un cable USB de datos. Sigue las instrucciones de tu modelo para copiar el archivo, normalmente a Garmin/NewFiles, y desconéctalo de forma segura.
3. Busca el entrenamiento en tu Garmin y comprueba cada paso con el plan actual antes de empezar.

Los pasos dependen del modelo y del sistema operativo. Algunos Garmin MTP no aparecen en el Finder de Mac y pueden requerir Windows. JMM no ha verificado la compatibilidad con tu modelo y firmware.

Guía de archivos de Garmin: https://support.garmin.com/en-GB/?faq=AXV7LuWgc73v21nq6nbDa6
Guía para Mac: https://support.garmin.com/en-MY/?faq=4NnyLlu0o5ASH4BVZ6QWPA

Gestiona o pausa estos correos: <APP_ORIGIN>/workout-email/settings

JasMiamiMethod
```

### ES · revised

Subject: Tu entrenamiento tiene una nueva versión · <LOCAL_DATE>

```text
¡Hola!

El entrenamiento del <LOCAL_DATE> ha cambiado. Adjuntamos el nuevo archivo FIT.

Revisión: <CANONICAL_REVISION>.

Descarga lista. La transferencia a tu Garmin no está verificada.

Abre el plan completo para consultar el gráfico del entrenamiento, los objetivos disponibles, la preparación y la guía de alimentación.
<APP_ORIGIN>/daily?sessionId=<URL_ENCODED_SESSION_ID>

Los adjuntos de correos anteriores no se actualizan. Usa esta revisión tras consultar el plan actual. Si ya transferiste la versión anterior, puede que tengas que eliminarla manualmente del Garmin según tu modelo; JMM no la elimina.

<CANONICAL_WORKOUT_SUMMARY>

El gráfico está incluido en la versión HTML del correo. Los pasos se detallan a continuación.

Entrenamiento y objetivos
1. <CANONICAL_ORDERED_STEP_WITH_EXACT_ENDPOINT_AND_SUPPORTED_TARGET>

Preparación
- <CANONICAL_PREPARATION_GUIDANCE>

Antes: alimentación e hidratación
- <CANONICAL_BEFORE_FUELING_AND_HYDRATION>

Durante: alimentación e hidratación
- <CANONICAL_DURING_FUELING_AND_HYDRATION>

Después: alimentación e hidratación
- <CANONICAL_AFTER_FUELING_AND_HYDRATION>

Qué debes tener en cuenta
- <CANONICAL_MISSING_OR_UNVERIFIED_TARGETS_AND_LIMITATIONS>

Antes de salir, revisa el material, la ruta y las condiciones locales; si hace calor, lleva líquidos adecuados y lo necesario para refrescarte. El tiempo local no se ha verificado para este correo. Si te apetece, dedica un minuto tranquilo a respirar o meditar para concentrarte.

1. Guarda el FIT adjunto en tu ordenador. Comprueba que tu modelo Garmin admite archivos de entrenamiento y transferencia por USB.
2. Conéctalo con un cable USB de datos. Sigue las instrucciones de tu modelo para copiar el archivo, normalmente a Garmin/NewFiles, y desconéctalo de forma segura.
3. Busca el entrenamiento en tu Garmin y comprueba cada paso con el plan actual antes de empezar.

Los pasos dependen del modelo y del sistema operativo. Algunos Garmin MTP no aparecen en el Finder de Mac y pueden requerir Windows. JMM no ha verificado la compatibilidad con tu modelo y firmware.

Guía de archivos de Garmin: https://support.garmin.com/en-GB/?faq=AXV7LuWgc73v21nq6nbDa6
Guía para Mac: https://support.garmin.com/en-MY/?faq=4NnyLlu0o5ASH4BVZ6QWPA

Gestiona o pausa estos correos: <APP_ORIGIN>/workout-email/settings

JasMiamiMethod
```

### ES · held

Subject: Tu entrenamiento está en pausa · <LOCAL_DATE>

```text
¡Hola!

El entrenamiento del <LOCAL_DATE> está en pausa. No adjuntamos ningún archivo de entrenamiento.

Revisión: <CANONICAL_REVISION>.

No hay un archivo FIT disponible para este aviso.

Consulta el plan actual antes de entrenar.
<APP_ORIGIN>/daily?sessionId=<URL_ENCODED_SESSION_ID>

No uses archivos anteriores de este entrenamiento. Revisa el plan actual para saber cómo continuar. Los archivos ya transferidos no se eliminan automáticamente del Garmin.

Gestiona o pausa estos correos: <APP_ORIGIN>/workout-email/settings

JasMiamiMethod
```

### ES · cancelled

Subject: Tu entrenamiento se ha cancelado · <LOCAL_DATE>

```text
¡Hola!

El entrenamiento del <LOCAL_DATE> se ha cancelado. No adjuntamos ningún archivo de entrenamiento.

Revisión: <CANONICAL_REVISION>.

No hay un archivo FIT disponible para este aviso.

Consulta el plan actual antes de entrenar.
<APP_ORIGIN>/daily?sessionId=<URL_ENCODED_SESSION_ID>

No uses archivos anteriores de este entrenamiento. Revisa el plan actual para saber cómo continuar. Los archivos ya transferidos no se eliminan automáticamente del Garmin.

Gestiona o pausa estos correos: <APP_ORIGIN>/workout-email/settings

JasMiamiMethod
```
