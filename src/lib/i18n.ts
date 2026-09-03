// JasMiamiMethod — i18n (es, ht, fr, ru + en)
// Minimal, dependency-free translation layer. `t(lang, key)` falls back to en.
// ponytail: flat dictionary, no i18n framework — 5 languages × a few dozen keys.

export type Lang = "en" | "es" | "ht" | "fr" | "ru";

// User-requested language set: English, Spanish (default per-user), Haitian Creole,
// French, Russian. All five have dictionary strings below.
export const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "ht", label: "Haitian Creole", native: "Kreyòl Ayisyen" },
  { code: "fr", label: "French", native: "Français" },
  { code: "ru", label: "Russian", native: "Русский" },
];

const S: Record<string, Partial<Record<Lang, string>>> = {
  // ---- nav ----
  "nav.today": { en: "Today", es: "Hoy", ht: "Jodi a", fr: "Aujourd'hui", ru: "Сегодня" },
  "nav.dashboard": { en: "Dashboard", es: "Panel", ht: "Tablodbò", fr: "Tableau de bord", ru: "Главная" },
  "nav.fitness": { en: "Performance", es: "Rendimiento", ht: "Pèfòmans", fr: "Performance", ru: "Результаты" },
  "nav.calendar": { en: "Calendar", es: "Calendario", ht: "Kalandriye", fr: "Calendrier", ru: "Календарь" },
  "nav.training": { en: "Training Plan", es: "Plan de entrenamiento", ht: "Plan antrennman", fr: "Plan d'entraînement", ru: "План тренировок" },
  "nav.races": { en: "Races & Venues", es: "Carreras y sedes", ht: "Kous ak lokal", fr: "Courses et lieux", ru: "Гонки и места" },
  "nav.forecast": { en: "AdvanzedRacing", es: "AdvanzedRacing", ht: "AdvanzedRacing", fr: "AdvanzedRacing", ru: "AdvanzedRacing" },
  "nav.prs": { en: "Personal Records", es: "Récords personales", ht: "Rekò pèsonèl", fr: "Records personnels", ru: "Личные рекорды" },
  "nav.checkin": { en: "Daily Check-In", es: "Chequeo diario", ht: "Tcheke chak jou", fr: "Bilan quotidien", ru: "Ежедневный чек-ин" },
  "nav.labs": { en: "Field-Test Labs", es: "Pruebas de campo", ht: "Tès teren", fr: "Tests de terrain", ru: "Полевые тесты" },
  "nav.metrics": { en: "HRV & Recovery", es: "VFC y recuperación", ht: "VFC ak rekiperasyon", fr: "VFC et récupération", ru: "ВСР и восстановление" },
  "nav.sleep": { en: "Sleep", es: "Sueño", ht: "Dòmi", fr: "Sommeil", ru: "Сон" },
  "nav.nutrition": { en: "Nutrition & Hydration", es: "Nutrición e hidratación", ht: "Nitrisyon ak idratasyon", fr: "Nutrition et hydratation", ru: "Питание и гидратация" },
  "nav.blood": { en: "Blood Panels", es: "Análisis de sangre", ht: "Tès san", fr: "Bilans sanguins", ru: "Анализы крови" },
  "nav.dna": { en: "DNA Analysis", es: "Análisis de ADN", ht: "Analiz ADN", fr: "Analyse ADN", ru: "Анализ ДНК" },
  "nav.connectors": { en: "Connectors", es: "Conectores", ht: "Konektè", fr: "Connecteurs", ru: "Подключения" },
  "nav.gear": { en: "Gear Lab", es: "Laboratorio de equipamiento", ht: "Laboratwa ekipman", fr: "Labo équipement", ru: "Лаборатория снаряжения" },
  "nav.brain": { en: "Brain Training", es: "Entrenamiento cerebral", ht: "Antrennman sèvo", fr: "Entraînement cérébral", ru: "Тренировка мозга" },
  "nav.admin": { en: "Admin", es: "Admin", ht: "Admin", fr: "Admin", ru: "Админ" },
  "nav.reminders": { en: "Reminders", es: "Recordatorios", ht: "Rapèl", fr: "Rappels", ru: "Напоминания" },
  "nav.settings": { en: "Profile & Zones", es: "Perfil y zonas", ht: "Pwofil ak zòn", fr: "Profil et zones", ru: "Профиль и зоны" },
  "nav.science": { en: "Science Guides", es: "Guías científicas", ht: "Gid syans", fr: "Guides scientifiques", ru: "Научные гиды" },
  "nav.more": { en: "More", es: "Más", ht: "Plis", fr: "Plus", ru: "Ещё" },

  // ---- recovery techniques (name + instructions) ----
  "rec.box.name": { en: "Box Breathing", es: "Respiración de caja", ht: "Respirasyon kare", fr: "Respiration carrée", ru: "Квадратное дыхание" },
  "rec.box.instr": { en: "Inhale 4s → hold 4s → exhale 4s → hold 4s, 5 min seated.", es: "Inhala 4s → sostén 4s → exhala 4s → sostén 4s, 5 min sentado.", ht: "Respire 4s → kenbe 4s → soti 4s → kenbe 4s, 5 min chita.", fr: "Inspire 4s → retenez 4s → expirez 4s → retenez 4s, 5 min assis.", ru: "Вдох 4с → задержка 4с → выдох 4с → задержка 4с, 5 мин сидя." },
  "rec.sigh.name": { en: "Physiological Sigh", es: "Suspiro fisiológico", ht: "Soupi fizyolojik", fr: "Soupir physiologique", ru: "Физиологический вздох" },
  "rec.sigh.instr": { en: "Two short inhales, then one long slow exhale. 5-8 rounds.", es: "Dos inhalaciones cortas, luego una exhalación larga y lenta. 5-8 rondas.", ht: "De ti rale kout, apre yon lontan ekspirasyon dousman. 5-8 fwa.", fr: "Deux inspirations courtes, puis une longue expiration lente. 5-8 fois.", ru: "Два коротких вдоха, затем один длинный медленный выдох. 5-8 раз." },
  "rec.478.name": { en: "4-7-8 Breathing", es: "Respiración 4-7-8", ht: "Respirasyon 4-7-8", fr: "Respiration 4-7-8", ru: "Дыхание 4-7-8" },
  "rec.478.instr": { en: "Inhale 4s → hold 7s → exhale 8s. 4-6 rounds.", es: "Inhala 4s → sostén 7s → exhala 8s. 4-6 rondas.", ht: "Respire 4s → kenbe 7s → soti 8s. 4-6 fwa.", fr: "Inspire 4s → retenez 7s → expirez 8s. 4-6 fois.", ru: "Вдох 4с → задержка 7с → выдох 8с. 4-6 раз." },
  "rec.resonance.name": { en: "Resonance Breathing", es: "Respiración resonante", ht: "Respirasyon rezonans", fr: "Respiration en résonance", ru: "Резонансное дыхание" },
  "rec.resonance.instr": { en: "~5.5 breaths/min (5.5s in, 5.5s out), 10 min.", es: "~5.5 respiraciones/min (5.5s in, 5.5s out), 10 min.", ht: "~5.5 souf/min (5.5s antre, 5.5s soti), 10 min.", fr: "~5.5 respirations/min (5.5s in, 5.5s out), 10 min.", ru: "~5.5 вдоха/мин (5.5с вдох, 5.5с выдох), 10 мин." },
  "rec.nadi.name": { en: "Alternate-Nostril Breathing", es: "Respiración alternada", ht: "Respirasyon altène nan nen", fr: "Respiration alternée", ru: "Попеременное дыхание ноздрями" },
  "rec.nadi.instr": { en: "Close right nostril, inhale left; close left, exhale right. 5 min.", es: "Cierra la fosa derecha, inhala por la izquierda; cierra la izquierda, exhala por la derecha. 5 min.", ht: "Fèmen twou nen dwat, respire nan goch; fèmen goch, soti nan dwat. 5 min.", fr: "Fermez la narine droite, inspirez à gauche ; fermez la gauche, expirez à droite. 5 min.", ru: "Закройте правую ноздрю, вдох левой; закройте левую, выдох правой. 5 мин." },
  "rec.pmr.name": { en: "Progressive Muscle Relaxation", es: "Relajación muscular progresiva", ht: "Relaksasyon miskilè pwogresif", fr: "Relaxation musculaire progressive", ru: "Прогрессивная мышечная релаксация" },
  "rec.pmr.instr": { en: "Tense each muscle 5s then release 10s, feet → face.", es: "Tensa cada músculo 5s y suelta 10s, de pies a cara.", ht: "Sere chak misk 5s epi lage 10s, depi pye rive figi.", fr: "Contractez chaque muscle 5s puis relâchez 10s, des pieds au visage.", ru: "Напрягайте мышцы 5с, расслабляйте 10с, от стоп к лицу." },
  "rec.dive.name": { en: "Cold Face Immersion", es: "Inmersión facial fría", ht: "Imèsyon figi frèt", fr: "Immersion faciale froide", ru: "Холодное погружение лица" },
  "rec.dive.instr": { en: "Cold water on face 15-30s, 3 rounds.", es: "Agua fría en la cara 15-30s, 3 rondas.", ht: "Dlo frèt sou figi 15-30s, 3 fwa.", fr: "Eau froide sur le visage 15-30s, 3 fois.", ru: "Холодная вода на лицо 15-30с, 3 раза." },
  "rec.legs.name": { en: "Legs-Up-The-Wall", es: "Piernas contra la pared", ht: "Janm kont miray la", fr: "Jambes contre le mur", ru: "Ноги на стене" },
  "rec.legs.instr": { en: "Lie on back, legs vertical against a wall. 10 min.", es: "Acuéstate boca arriba, piernas verticales contra la pared. 10 min.", ht: "Kouche sou do, janm vètikal kont miray. 10 min.", fr: "Allongé sur le dos, jambes à la verticale contre un mur. 10 min.", ru: "Лёжа на спине, ноги вертикально на стене. 10 мин." },
  "rec.exhale.name": { en: "Extended Exhale (2:1)", es: "Exhalación prolongada (2:1)", ht: "Ekspirasyon pwolonje (2:1)", fr: "Expiration prolongée (2:1)", ru: "Удлинённый выдох (2:1)" },
  "rec.exhale.instr": { en: "Inhale 3s, exhale 6s. 5 min.", es: "Inhala 3s, exhala 6s. 5 min.", ht: "Respire 3s, soti 6s. 5 min.", fr: "Inspire 3s, expire 6s. 5 min.", ru: "Вдох 3с, выдох 6с. 5 мин." },

  // ---- adaptation verdicts + messages ----
  "adapt.full": { en: "FULL", es: "COMPLETO", ht: "KOMPLÈ", fr: "COMPLET", ru: "ПОЛНАЯ" },
  "adapt.trim": { en: "TRIM", es: "RECORTAR", ht: "REDWI", fr: "RÉDUIRE", ru: "СОКРАТИТЬ" },
  "adapt.easy": { en: "EASY", es: "SUAVE", ht: "FASIL", fr: "LÉGER", ru: "ЛЁГКАЯ" },
  "adapt.rest": { en: "REST", es: "DESCANSO", ht: "REPO", fr: "REPOS", ru: "ОТДЫХ" },
  "adapt.full.msg": { en: "Green to go. Take the key session by the horns — chase the quality.", es: "Luz verde. Aprovecha la sesión clave y busca la calidad.", ht: "Limyè vèt. Pran sesyon kle a epi chase kalite.", fr: "Feu vert. Attaquez la séance clé — cherchez la qualité.", ru: "Зелёный свет. Возьми ключевую тренировку и работай на качество." },
  "adapt.trim.msg": { en: "Trim the last interval set. Do the main work, cap intensity at threshold, extend the warm-up.", es: "Recorta la última serie. Haz el trabajo principal, limita la intensidad y alarga el calentamiento.", ht: "Redwi dènye seri a. Fè travay prensipal la, limite entansite, pwolonje chofaj la.", fr: "Coupez la dernière série. Faites le travail principal, plafonnez l'intensité, allongez l'échauffement.", ru: "Убери последнюю серию. Сделай основную работу, ограничь интенсивность, удлини разминку." },
  "adapt.easy.msg": { en: "Easy day. Keep the habit but drop intensity to Z2 and ~60% duration. Sleep is the priority tonight.", es: "Día suave. Mantén el hábito pero baja a Z2 y ~60% de duración. Prioriza el sueño esta noche.", ht: "Jou fasil. Kenbe abitid la men desann nan Z2 ak ~60% dire. Dòmi se priyorite aswè a.", fr: "Journée légère. Gardez l'habitude mais descendez en Z2 et ~60% de durée. Le sommeil est la priorité.", ru: "Лёгкий день. Сохрани привычку, но снизь до Z2 и ~60% длительности. Сон — приоритет." },
  "adapt.rest.msg": { en: "Full rest or a 20-min Z1 flush. Training now would dig a deeper hole — protect the block.", es: "Descanso total o 20 min en Z1. Entrenar ahora cavaría un hoyo más hondo: protege el bloque.", ht: "Repo total oswa 20 min Z1. Antrennman kounye a ta fouye yon twou pi fon — pwoteje blòk la.", fr: "Repos total ou 20 min en Z1. S'entraîner maintenant creuserait un trou plus profond — protégez le bloc.", ru: "Полный отдых или 20 мин в Z1. Тренировка сейчас выкопает яму глубже — защити блок." },

  // ---- fuel + ergo labels ----
  "fuel.carbs": { en: "Carbs", es: "Carbohidratos", ht: "Kaboyidrat", fr: "Glucides", ru: "Углеводы" },
  "fuel.sodium": { en: "Sodium", es: "Sodio", ht: "Sodyòm", fr: "Sodium", ru: "Натрий" },
  "fuel.fluid": { en: "Fluid", es: "Líquido", ht: "Likid", fr: "Liquide", ru: "Жидкость" },
  "fuel.caffeine": { en: "Caffeine", es: "Cafeína", ht: "Kafeyin", fr: "Caféine", ru: "Кофеин" },
  "fuel.ergos": { en: "Ergogenic Aids", es: "Ayudas ergogénicas", ht: "Èd èrgojenik", fr: "Aides ergogènes", ru: "Эргогенные средства" },
  "fuel.brands": { en: "Best Fuel Brands", es: "Mejores marcas de combustible", ht: "Pi bon mak gaz", fr: "Meilleures marques de carburant", ru: "Лучшие бренды питания" },
  "ergo.caffeine": { en: "Caffeine", es: "Cafeína", ht: "Kafeyin", fr: "Caféine", ru: "Кофеин" },
  "ergo.citrulline": { en: "L-Citrulline Malate", es: "Citrulina Malato", ht: "Sitrulin Malat", fr: "Citrulline Malate", ru: "Цитруллин малат" },
  "ergo.nitrate": { en: "Beetroot / Nitrate", es: "Remolacha / Nitrato", ht: "Bètrav / Nitrat", fr: "Betterave / Nitrate", ru: "Свёкла / Нитрат" },
  "ergo.creatine": { en: "Creatine Monohydrate", es: "Creatina monohidrato", ht: "Kreatin monoidrat", fr: "Créatine monohydrate", ru: "Креатин моногидрат" },
  "ergo.betaAlanine": { en: "Beta-Alanine", es: "Beta-alanina", ht: "Beta-alanin", fr: "Bêta-alanine", ru: "Бета-аланин" },
  "ergo.bicarb": { en: "Sodium Bicarbonate", es: "Bicarbonato de sodio", ht: "Bikabonat sodyòm", fr: "Bicarbonate de sodium", ru: "Бикарбонат натрия" },
  "ergo.phosphate": { en: "Sodium Phosphate", es: "Fosfato de sodio", ht: "Fosfat sodyòm", fr: "Phosphate de sodium", ru: "Фосфат натрия" },

  // ---- common ----
  "common.today": { en: "Today's Training", es: "Entrenamiento de hoy", ht: "Antrennman jodi a", fr: "Entraînement du jour", ru: "Сегодняшняя тренировка" },
  "common.recovery": { en: "Recovery", es: "Recuperación", ht: "Rekiperasyon", fr: "Récupération", ru: "Восстановление" },

  // ---- dashboard ----
  "dash.greeting": { en: "Good morning, {name} ☀️", es: "Buenos días, {name} ☀️" },
  "dash.athlete": { en: "Athlete", es: "Atleta" },
  "dash.motivation": { en: "Today is a brick in the wall. Lay it well.", es: "Hoy es un ladrillo en la pared. Colócalo bien." },
  "dash.coachJas": { en: "JASAI", es: "JASAI" },
  "dash.ruleBased": { en: "rule-based", es: "basado en reglas" },
  "dash.adaptation": { en: "Adaptation:", es: "Adaptación:" },
  "dash.setupProfile": { en: "Set up your athlete profile", es: "Configura tu perfil de atleta" },
  "dash.setupProfileSub": { en: "Age, weight, VO2max or LTHR → we build YOUR zones.", es: "Edad, peso, VO2max o LTHR → construimos TUS zonas." },
  "dash.genPlan": { en: "Generate your training plan", es: "Genera tu plan de entrenamiento" },
  "dash.genPlanSub": { en: "Base → Build → Peak → Taper, periodized for your race.", es: "Base → Construcción → Pico → Reducción, periodizado para tu carrera." },
  "dash.todayTraining": { en: "Today's Training", es: "Entrenamiento de hoy" },
  "dash.calendar": { en: "Calendar", es: "Calendario" },
  "dash.noSessions": { en: "No sessions planned today — log a workout or add one on the calendar.", es: "No hay sesiones planificadas hoy — registra un entrenamiento o añade uno en el calendario." },
  "dash.completed": { en: "Completed ✓", es: "Completado ✓" },
  "dash.markDone": { en: "Mark done", es: "Marcar hecho" },
  "dash.hrvToday": { en: "HRV (today)", es: "VFC (hoy)" },
  "dash.logVia": { en: "Log via Whoop / Oura / manual", es: "Registra vía Whoop / Oura / manual" },
  "dash.sleep7d": { en: "Sleep (7d avg)", es: "Sueño (prom. 7d)" },
  "dash.targetSleep": { en: "Target 7-9h", es: "Objetivo 7-9h" },
  "dash.weekLoad": { en: "Week load", es: "Carga semanal" },
  "dash.sessionsDone": { en: "{a}/{b} sessions done", es: "{a}/{b} sesiones hechas" },
  "dash.hydration": { en: "Hydration", es: "Hidratación" },
  "dash.targetHydration": { en: "Target ~3L", es: "Objetivo ~3L" },
  "dash.trainingPlan": { en: "Training Plan", es: "Plan de entrenamiento" },
  "dash.open": { en: "Open", es: "Abrir" },
  "dash.planGoal": { en: "Goal: {d} · {w} weeks · {l}", es: "Objetivo: {d} · {w} semanas · {l}" },
  "dash.completionPct": { en: "{p}% of planned sessions completed this week", es: "{p}% de las sesiones planificadas completadas esta semana" },
  "dash.noPlan": { en: "No plan yet. Generate your periodized Base → Build → Peak → Taper plan in the Training section.", es: "Aún no hay plan. Genera tu plan periodizado Base → Construcción → Pico → Reducción en la sección Entrenamiento." },
  "dash.quickActions": { en: "Quick Actions", es: "Acciones rápidas" },
  "dash.logHrv": { en: "Log HRV / recovery", es: "Registrar VFC / recuperación" },
  "dash.logFood": { en: "Log food & water", es: "Registrar comida y agua" },
  "dash.addBlood": { en: "Add blood panel", es: "Añadir análisis de sangre" },
  "dash.uploadDna": { en: "Upload DNA", es: "Subir ADN" },
  "dash.connectDevices": { en: "Connect devices", es: "Conectar dispositivos" },

  // ---- sleep ----
  "sleep.title": { en: "Sleep", es: "Sueño" },
  "sleep.30dAvg": { en: "30-day avg", es: "Promedio 30 días" },
  "sleep.nights7h": { en: "nights ≥7h", es: "noches ≥7h" },
  "sleep.avgQuality": { en: "avg quality", es: "calidad promedio" },
  "sleep.logLastNight": { en: "Log Last Night", es: "Registrar anoche" },
  "sleep.date": { en: "Date", es: "Fecha" },
  "sleep.hours": { en: "Hours", es: "Horas" },
  "sleep.quality": { en: "Quality 1-10", es: "Calidad 1-10" },
  "sleep.deep": { en: "Deep (h)", es: "Profundo (h)" },
  "sleep.save": { en: "Save Sleep", es: "Guardar Sueño" },
  "sleep.saved": { en: "✓ Saved", es: "✓ Guardado" },
  "sleep.history": { en: "History", es: "Historial" },
  "sleep.coachNote": { en: "Coach note:", es: "Nota del coach:" },

  // ---- labs ----
  "labs.title": { en: "Field-Test Labs", es: "Laboratorios de prueba de campo" },
  "labs.subtitle": { en: "Test, save, and your zones update across the whole app.", es: "Haz la prueba, guárdala, y tus zonas se actualizan en toda la app.", ht: "Fè tès la, sove l, e zòn ou yo mete ajou nan tout app la.", fr: "Faites le test, enregistrez, et vos zones se mettent à jour dans toute l'app.", ru: "Сделайте тест, сохраните — и ваши зоны обновятся во всём приложении." },
  "labs.vdot": { en: "VDOT — Running Paces", es: "VDOT — Ritmos de carrera" },
  "labs.raceDistance": { en: "Race distance", es: "Distancia de carrera" },
  "labs.calcPaces": { en: "Calc paces", es: "Calcular ritmos" },
  "labs.ftp": { en: "FTP — Power Zones", es: "FTP — Zonas de potencia" },
  "labs.ftpTest": { en: "20-min test avg power (W)", es: "Potencia media prueba 20 min (W)" },
  "labs.buildZones": { en: "Build zones", es: "Construir zonas" },
  "labs.saveFtp": { en: "Save FTP to profile", es: "Guardar FTP en perfil" },
  "labs.lthr": { en: "LTHR — HR Zones", es: "LTHR — Zonas de FC" },
  "labs.lthrTest": { en: "30-min TT avg HR (last 20 min)", es: "FC media TT 30 min (últimos 20 min)" },
  "labs.saveLthr": { en: "Save LTHR to profile", es: "Guardar LTHR en perfil" },
  "labs.css": { en: "CSS — Swim Threshold", es: "CSS — Umbral de natación" },
  "labs.css400": { en: "400m time", es: "Tiempo 400m" },
  "labs.css200": { en: "200m time", es: "Tiempo 200m" },
  "labs.calcCss": { en: "Calc CSS", es: "Calcular CSS" },
  "labs.fuel": { en: "Fuel Targets", es: "Objetivos de combustible" },
  "labs.bodyWeight": { en: "Body weight (kg)", es: "Peso corporal (kg)" },
  "labs.savedMsg": { en: "Saved", es: "Guardado" },

  // ---- dna ----
  "dna.title": { en: "DNA Analysis", es: "Análisis de ADN" },
  "dna.upload": { en: "Upload Raw DNA", es: "Subir ADN crudo" },
  "dna.provider": { en: "Provider", es: "Proveedor" },
  "dna.analyzed": { en: "✓ DNA analyzed!", es: "✓ ADN analizado!" },
  "dna.scienceHonesty": { en: "Science honesty:", es: "Honestidad científica:" },
  "dna.noDna": { en: "No DNA uploaded yet", es: "Aún no hay ADN subido" },
  "dna.chooseFile": { en: "Choose your raw DNA file first.", es: "Elige primero tu archivo de ADN crudo." },
  "dna.uploadFailed": { en: "Upload failed", es: "Error al subir" },
  "dna.analyze": { en: "Analyze DNA", es: "Analizar ADN" },

  // ---- connectors ----
  "conn.title": { en: "Connectors & Import", es: "Conectores e importación" },
  "conn.connected": { en: "Connected", es: "Conectado" },
  "conn.disconnected": { en: "Disconnected", es: "Desconectado" },
  "conn.connectStrava": { en: "Connect Strava", es: "Conectar Strava" },
  "conn.oura": { en: "Oura OAuth ready — set up in dev environment.", es: "Oura OAuth listo — configúralo en el entorno de desarrollo." },
  "conn.which": { en: "Which should I use?", es: "¿Cuál debería usar?" },
  "conn.importFailed": { en: "Import failed", es: "Error de importación" },
  "conn.import": { en: "Import", es: "Importar" },
  "conn.howTo": { en: "How to connect", es: "Cómo conectar", ht: "Kijan pou konekte", fr: "Comment connecter", ru: "Как подключить" },

  // ---- reminders ----
  "rem.title": { en: "Training Reminders", es: "Recordatorios de entrenamiento" },
  "rem.saved": { en: "✓ Preferences saved", es: "✓ Preferencias guardadas" },
  "rem.channels": { en: "Channels", es: "Canales" },
  "rem.email": { en: "Email", es: "Correo" },
  "rem.telegram": { en: "Telegram", es: "Telegram" },
  "rem.chatId": { en: "Chat ID:", es: "ID de chat:" },
  "rem.telegramToken": { en: "Add TELEGRAM_BOT_TOKEN to the server to enable", es: "Añade TELEGRAM_BOT_TOKEN al servidor para habilitar" },
  "rem.telegramChatId": { en: "Telegram chat ID", es: "ID de chat de Telegram" },
  "rem.schedule": { en: "Schedule", es: "Horario" },
  "rem.dailyHour": { en: "Daily plan hour (0-23)", es: "Hora diaria del plan (0-23)" },
  "rem.leadTime": { en: "Lead time (min)", es: "Tiempo de aviso (min)" },
  "rem.savePrefs": { en: "Save Preferences", es: "Guardar preferencias" },
  "rem.sendNow": { en: "Want today's reminder right now?", es: "¿Quieres el recordatorio de hoy ahora mismo?" },
  "rem.sendNowBtn": { en: "Send Now", es: "Enviar ahora" },

  // ---- race forecast ----
  "fc.title": { en: "AdvanzedRacing", es: "AdvanzedRacing", ht: "AdvanzedRacing", fr: "AdvanzedRacing", ru: "AdvanzedRacing" },
  "fc.subtitle": { en: "Fitness-based race prediction: your thresholds + training load (PMC) + the course you'll actually race on.", es: "Predicción de carrera basada en tu forma física: tus umbrales + carga de entrenamiento (PMC) + el recorrido real.", ht: "Prediksyon kous sou baz fòm ou: papòt ou yo + chaj antrennman (PMC) + kou w ap kouri a.", fr: "Prédiction de course basée sur la forme : vos seuils + charge d'entraînement (PMC) + le parcours réel.", ru: "Прогноз гонки на основе формы: ваши пороги + нагрузка (PMC) + реальная трасса." },
  "fc.savedRace": { en: "Saved race", es: "Carrera guardada", ht: "Kous sove", fr: "Course enregistrée", ru: "Сохранённая гонка" },
  "fc.orDistance": { en: "Or forecast a distance", es: "O pronostica una distancia", ht: "Oswa pwevwa yon distans", fr: "Ou prévoir une distance", ru: "Или прогноз дистанции" },
  "fc.forecast": { en: "Forecast", es: "Pronosticar", ht: "Pwevwa", fr: "Prévoir", ru: "Прогноз" },
  "fc.pickRace": { en: "— pick a saved race —", es: "— elige una carrera guardada —", ht: "— chwazi yon kous sove —", fr: "— choisir une course —", ru: "— выберите сохранённую гонку —" },
  "fc.noForecast": { en: "No forecastable race", es: "No hay carrera pronosticable", ht: "Pa gen kous pwevwa", fr: "Aucune course prévisible", ru: "Нет прогнозируемой гонки" },
  "fc.notForecastable": { en: "This event (HYROX / boxing / unknown) isn't a timed endurance distance we can predict yet. Pick a triathlon, run, bike or swim distance above.", es: "Este evento (HYROX / boxeo / desconocido) no es una distancia de resistencia que podamos predecir aún. Elige una distancia de triatlón, carrera, bici o natación arriba.", ht: "Evènman sa a (HYROX / boksè / enkoni) pa yon distans andirans nou ka pwevwa ankò. Chwazi yon distans triyatlon, kous, bisiklèt oswa naje pi wo a.", fr: "Cet événement (HYROX / boxe / inconnu) n'est pas une distance d'endurance prévisible pour le moment. Choisissez une distance triathlon, course, vélo ou natation ci-dessus.", ru: "Это событие (HYROX / бокс / неизвестно) — не прогнозируемая дистанция. Выберите триатлон, бег, вело или плавание выше." },
  "fc.predictedFinish": { en: "Predicted finish", es: "Llegada prevista", ht: "Arive prevwa", fr: "Arrivée prévue", ru: "Прогнозируемый финиш" },
  "fc.baseline": { en: "baseline", es: "línea base", ht: "baz", fr: "base", ru: "базовый" },
  "fc.beforeAdjust": { en: "before course + fitness adjustments", es: "antes de los ajustes de recorrido + forma", ht: "anvan ajisteman kou + fòm", fr: "avant les ajustements parcours + forme", ru: "до поправок на трассу + форму" },
  "fc.slowerThanGoal": { en: "slower than goal", es: "más lento que el objetivo", ht: "pi dousman pase objektif", fr: "plus lent que l'objectif", ru: "медленнее цели" },
  "fc.fasterThanGoal": { en: "faster than goal", es: "más rápido que el objetivo", ht: "pi vit pase objektif", fr: "plus rapide que l'objectif", ru: "быстрее цели" },
  "fc.whyMoved": { en: "Why the number moved", es: "Por qué cambió el número", ht: "Poukisa nimewo a chanje", fr: "Pourquoi le chiffre a bougé", ru: "Почему изменилось число" },
  "fc.fuelPerLeg": { en: "Race-day fueling, leg by leg", es: "Combustible de carrera, por disciplina", ht: "Gaz jou kous, pa disiplin", fr: "Carburant de course, discipline par discipline", ru: "Питание на гонке по этапам" },
  "fc.tighten": { en: "To tighten this forecast", es: "Para afinar este pronóstico", ht: "Pou pi byen pwevwa", fr: "Pour affiner cette prévision", ru: "Чтобы уточнить прогноз" },
  "fc.noWorkouts": { en: "No completed workouts yet — log sessions so fitness (CTL/TSB) is real.", es: "Aún no hay entrenamientos completados — registra sesiones para que la forma (CTL/TSB) sea real.", ht: "Pa gen antrennman fini ankò — anrejistre sesyon pou fòm (CTL/TSB) vin reyèl.", fr: "Aucun entraînement terminé — enregistrez des séances pour que la forme (CTL/TSB) soit réelle.", ru: "Пока нет завершённых тренировок — записывайте их, чтобы форма (CTL/TSB) была реальной." },
  "fc.disclaimer": { en: "Heuristics grounded in post-2000 sports science (Rothfusz heat index; Bärtsch & Saltin altitude; Ely 2007 heat pacing; TrainingPeaks PMC; Thomas 2016 fueling). Re-run after each benchmark test.", es: "Heurísticas basadas en ciencia del deporte posterior a 2000 (índice de calor Rothfusz; altitud Bärtsch y Saltin; ritmo en calor Ely 2007; PMC de TrainingPeaks; combustible Thomas 2016). Repite tras cada test de referencia.", ht: "Ewistik ki baze sou syans espò apre 2000 (endèks chalè Rothfusz; altitid Bärtsch & Saltin; Ely 2007; PMC TrainingPeaks; Thomas 2016). Refè apre chak tès referans.", fr: "Heuristiques fondées sur la science du sport post-2000 (indice de chaleur Rothfusz ; altitude Bärtsch & Saltin ; Ely 2007 ; PMC TrainingPeaks ; Thomas 2016). Refaites après chaque test de référence.", ru: "Эвристики на основе спортивной науки после 2000 (индекс жары Ротфуша; высота Бэртш и Салтин; Ely 2007; PMC TrainingPeaks; Thomas 2016). Повторяйте после каждого теста." },
  "fc.pace": { en: "Pace", es: "Ritmo", ht: "Ritim", fr: "Allure", ru: "Темп" },
  "fc.speed": { en: "Speed", es: "Velocidad", ht: "Vitès", fr: "Vitesse", ru: "Скорость" },
  "fc.power": { en: "Power", es: "Potencia", ht: "Pouvwa", fr: "Puissance", ru: "Мощность" },
  "fc.hr": { en: "HR", es: "FC", ht: "FC", fr: "FC", ru: "ЧСС" },
  "fc.transitions": { en: "transitions", es: "transiciones", ht: "tranzisyon", fr: "transitions", ru: "транзиты" },
  "fc.confidence.high": { en: "High confidence", es: "Confianza alta", ht: "Konfyans wo", fr: "Confiance élevée", ru: "Высокая уверенность" },
  "fc.confidence.medium": { en: "Medium confidence", es: "Confianza media", ht: "Konfyans mwayen", fr: "Confiance moyenne", ru: "Средняя уверенность" },
  "fc.confidence.low": { en: "Low confidence", es: "Confianza baja", ht: "Konfyans ba", fr: "Confiance faible", ru: "Низкая уверенность" },
  "fc.addRaceFirst": { en: "Add a race with a forecastable distance or choose one from the dropdown.", es: "Añade una carrera con una distancia pronosticable o elige una del menú.", ht: "Ajoute yon kous ak yon distans pwevwa oswa chwazi youn nan meni a.", fr: "Ajoutez une course prévisible ou choisissez-en une dans le menu.", ru: "Добавьте гонку с прогнозируемой дистанцией или выберите из списка." },
  "fc.Swim": { en: "Swim", es: "Natación", ht: "Naje", fr: "Natation", ru: "Плавание" },
  "fc.Bike": { en: "Bike", es: "Bici", ht: "Bisiklèt", fr: "Vélo", ru: "Вело" },
  "fc.Run": { en: "Run", es: "Carrera", ht: "Kouri", fr: "Course", ru: "Бег" },
  "fc.Swim-note": { en: "Swim", es: "Natación", ht: "Naje", fr: "Natation", ru: "Плавание" },

  // ---- public site ----
  "pub.science": { en: "The Science", es: "La ciencia", ht: "Syans lan", ru: "Наука" },
  "pub.howItWorks": { en: "How It Works", es: "Cómo funciona", ht: "Kijan li mache", ru: "Как это работает" },
  "pub.dashboard": { en: "Dashboard", es: "Panel", ht: "Tablodbò", ru: "Панель" },
  "pub.startFree": { en: "Start free", es: "Empezar gratis", ht: "Kòmanse gratis", ru: "Начать бесплатно" },
  "pub.onboarding": { en: "Onboarding", es: "Introducción", ht: "Antre", ru: "Введение" },
  "pub.footerBuilt": { en: "Built on post-2000 human-performance research · Miami, FL", es: "Basado en investigación de rendimiento humano post-2000 · Miami, FL", ht: "Baze sou rechèch pèfòmans imen apre 2000 · Miami, FL", ru: "Основано на исследованиях после 2000 года · Майами, Флорида" },
  "pub.kicker": { en: "Post-2000 sports medicine · HRV-driven · Periodized", es: "Medicina del deporte post-2000 · guiado por VFC · periodizado", ht: "Medsin espò apre 2000 · VFC · peryodize", ru: "Спортивная медицина после 2000 · ВСР · периодизация" },
  "pub.hero": { en: "Training that reads {your} body, not your ego.", es: "Entrenamiento que lee {your} cuerpo, no tu ego.", ht: "Antrennman ki li {your} kò, pa ewo ou.", ru: "Тренировки, которые читают {your} тело, а не эго." },
  "pub.deck": { en: "JasMiamiMethod is the science-backed endurance coach: a two-minute morning check-in becomes today's exact session, fuel plan and recovery — grounded in post-2000 human-performance research, not folklore.", es: "JasMiamiMethod es el coach de resistencia respaldado por la ciencia: un chequeo matutino de dos minutos se convierte en la sesión exacta de hoy, el plan de combustible y la recuperación — basado en investigación post-2000, no en folklore.", ht: "JasMiamiMethod se antrenè andirans ki baze sou syans: yon tcheke maten de minit vin sesyon egzak jodi a, plan gaz ak rekiperasyon — baze sou rechèch apre 2000, pa sou sipèstisyon.", ru: "JasMiamiMethod — научно обоснованный тренер по выносливости: двухминутный утренний чек-ин превращается в точную тренировку, план питания и восстановление — на исследованиях, а не на мифах." },
  "pub.readScience": { en: "Read the science", es: "Lee la ciencia", ht: "Li syans lan", ru: "Читать науку" },
  "pub.learnMore": { en: "See the full step-by-step", es: "Ver el paso a paso completo", ht: "Wè etap pa etap konplè", ru: "Смотреть пошагово" },
  "pub.openGuide": { en: "Open guide", es: "Abrir guía", ht: "Louvri gid", ru: "Открыть руководство" },
  "pub.allGuides": { en: "All five guides", es: "Las cinco guías", ht: "Senk gid yo", ru: "Все пять руководств" },
  "pub.allGuidesSub": { en: "Supplements, ergogenic aids, sleep, nutrition and race fuel — one evidence index.", es: "Suplementos, ayudas ergogénicas, sueño, nutrición y combustible de carrera — un índice de evidencia.", ht: "Sipleman, èd èrgojenik, dòmi, nitrisyon ak gaz kous — yon endèks prèv.", ru: "Добавки, эргогенные средства, сон, питание и топливо для гонки — единый индекс доказательств." },
  "pub.scienceIndex": { en: "The science index", es: "El índice de ciencia", ht: "Endèks syans la", ru: "Индекс науки" },
  "pub.functions": { en: "The functions", es: "Las funciones", ht: "Fonksyon yo", ru: "Функции" },
  "pub.howWorks": { en: "How it works", es: "Cómo funciona", ht: "Kijan li mache", ru: "Как это работает" },
  "pub.fieldGuides": { en: "The field guides", es: "Las guías de campo", ht: "Gid teren yo", ru: "Полевые руководства" },
  "pub.getStarted": { en: "Get started", es: "Empieza", ht: "Kòmanse", ru: "Начать" },
  "pub.freeTitle": { en: "Free for athletes. Your data stays yours.", es: "Gratis para atletas. Tus datos son tuyos.", ht: "Gratis pou atlèt. Done ou rete pa ou.", ru: "Бесплатно для спортсменов. Ваши данные — ваши." },
  "pub.freeDeck": { en: "Sign in or register in under a minute. Blood, DNA and training records are private — you can delete them at any time.", es: "Inicia sesión o regístrate en menos de un minuto. Tus registros de sangre, ADN y entrenamiento son privados — puedes borrarlos cuando quieras.", ht: "Konekte oswa enskri nan mwens pase yon minit. Rejis san, ADN ak antrennman yo prive — ou ka efase yo nenpòt lè.", ru: "Войдите или зарегистрируйтесь меньше чем за минуту. Данные крови, ДНК и тренировок — приватны, их можно удалить в любой момент." },
  "pub.li1": { en: "No credit card, no device required to start.", es: "Sin tarjeta, sin dispositivo para empezar.", ht: "Pa gen kat kredi, pa gen aparèy pou kòmanse.", ru: "Без карты и устройства для старта." },
  "pub.li2": { en: "Connect Garmin, Strava, Oura, Whoop or COROS later.", es: "Conecta Garmin, Strava, Oura, Whoop o COROS más tarde.", ht: "Konekte Garmin, Strava, Oura, Whoop oswa COROS pita.", ru: "Подключите Garmin, Strava, Oura, Whoop или COROS позже." },
  "pub.li3": { en: "Backed by cited post-2000 research on every recommendation.", es: "Respaldado por investigación post-2000 citada en cada recomendación.", ht: "Sipòte pa rechèch apre 2000 site nan chak rekòmandasyon.", ru: "Каждая рекомендация подкреплена исследованиями после 2000 года." },

  // ---- landing: hero parts (Venezuelan Spanish default) ----
  "pub.hero.pre": { en: "Training that reads", es: "Entrenamiento que lee", ht: "Antrennman ki li", ru: "Тренировки, которые читают" },
  "pub.hero.span": { en: "your body", es: "tu cuerpo", ht: "kò ou", ru: "ваше тело" },
  "pub.hero.post": { en: ", not your ego.", es: ", no tu ego.", ht: ", pa ewo ou.", ru: ", а не эго." },
  "pub.slogan": { en: "Data, not ego.", es: "Datos, no ego.", ht: "Done, pa ewo.", ru: "Данные, а не эго." },

  // ---- landing: sport showcase ----
  "pub.sports.kicker": { en: "One method, six engines", es: "Un método, seis motores", ht: "Yon metòd, sis motè", ru: "Один метод, шесть двигателей" },
  "pub.sports.title": { en: "Built for the sports you actually train", es: "Hecho para los deportes que de verdad entrenas", ht: "Fèt pou espò ou vrèman antrene yo", ru: "Создано для видов спорта, которые вы тренируете" },
  "pub.sports.sub": { en: "Triathlon, HYROX, swim, bike, run and boxing — every session is periodized from your physiology and your daily check-in, never a one-size template.", es: "Triatlón, HYROX, natación, ciclismo, carrera y boxeo — cada sesión se periodiza desde tu fisiología y tu chequeo diario, nunca desde una plantilla genérica.", ht: "Triyatlon, HYROX, naje, bisiklèt, kouri ak boksè — chak sesyon peryodize apati fizyoloji ou ak tcheke chak jou ou, pa janm nan yon modèl jenerik.", ru: "Триатлон, HYROX, плавание, вело, бег и бокс — каждая тренировка периодизируется от вашей физиологии и чек-ина, а не по шаблону." },

  "pub.sport.triathlon.name": { en: "Triathlon", es: "Triatlón", ht: "Triyatlon", ru: "Триатлон" },
  "pub.sport.triathlon.desc": { en: "Swim, bike and run in one race — periodized as a single engine with bricks and race-day pacing.", es: "Natación, ciclismo y carrera en una sola prueba — periodizado como un solo motor con bricks y ritmo de carrera.", ht: "Naje, bisiklèt ak kouri nan yon sèl kous — peryodize kòm yon sèl motè ak brik ak ritm kous.", ru: "Плавание, вело и бег в одной гонке — периодизация как единый движок с бриками и темпом." },
  "pub.sport.hyrox.name": { en: "HYROX", es: "HYROX", ht: "HYROX", ru: "HYROX" },
  "pub.sport.hyrox.desc": { en: "Functional fitness racing — run-engine plus strength stations, periodized into blocks.", es: "Carrera de fitness funcional — motor de carrera más estaciones de fuerza, periodizado en bloques.", ht: "Kous fitness fonksyonèl — motè kouri plis estasyon fòs, peryodize an blòk.", ru: "Функциональные гонки — беговой движок плюс силовые станции, по блокам." },
  "pub.sport.swim.name": { en: "Swim", es: "Natación", ht: "Naje", ru: "Плавание" },
  "pub.sport.swim.desc": { en: "Pool, lake or ocean — CSS threshold pacing plus open-water strategy.", es: "Piscina, lago o mar — ritmo de umbral CSS más estrategia en aguas abiertas.", ht: "Pisin, lak oswa lanmè — ritm papòt CSS plis estrateji dlo louvri.", ru: "Бассейн, озеро или море — пороговый темп CSS плюс стратегия открытой воды." },
  "pub.sport.bike.name": { en: "Bike", es: "Ciclismo", ht: "Bisiklèt", ru: "Велосипед" },
  "pub.sport.bike.desc": { en: "FTP-driven power zones and course-specific pacing for every terrain.", es: "Zonas de potencia basadas en FTP y ritmo específico del recorrido para cada terreno.", ht: "Zòn pouvwa ki baze sou FTP ak ritm espesifik kous pou chak tèren.", ru: "Зоны мощности на основе FTP и темп под конкретную трассу." },
  "pub.sport.run.name": { en: "Run", es: "Carrera", ht: "Kouri", ru: "Бег" },
  "pub.sport.run.desc": { en: "VDOT pace zones plus PMC load so the taper lands on race day.", es: "Zonas de ritmo VDOT más carga PMC para que la puesta a punto caiga justo el día de carrera.", ht: "Zòn ritm VDOT plis chaj PMC pou taper la tonbe jou kous la.", ru: "Темповые зоны VDOT плюс нагрузка PMC, чтобы тапер попал в гонку." },
  "pub.sport.boxing.name": { en: "Boxing", es: "Boxeo", ht: "Boksè", ru: "Бокс" },
  "pub.sport.boxing.desc": { en: "Conditioning, power and recovery built around rounds — no guesswork on rest.", es: "Acondicionamiento, potencia y recuperación construidos alrededor de los rounds — sin adivinar el descanso.", ht: "Kondisyone, puisans ak rekiperasyon bati alantou round yo — san devine repo a.", ru: "Кондиция, мощность и восстановление по раундам — без угадывания отдыха." },

  // ---- landing: functions (6) ----
  "pub.fn1.title": { en: "Daily readiness check-in", es: "Chequeo diario de disposición", ht: "Tcheke preparasyon chak jou", ru: "Ежедневный чек-ин готовности" },
  "pub.fn1.text": { en: "Five quick questions plus resting heart rate and weight. Two minutes every morning — typed or spoken — scored into one 0–100 readiness number.", es: "Cinco preguntas rápidas más frecuencia cardíaca en reposo y peso. Dos minutos cada mañana — escritas o por voz — se convierten en un número de disposición de 0 a 100.", ht: "Senk kesyon rapid plis batman kè repo ak pwa. De minit chak maten — ekri oswa pale — vin yon nimewo preparasyon 0–100.", ru: "Пять быстрых вопросов плюс пульс покоя и вес. Две минуты утром — текстом или голосом — в число готовности 0–100." },
  "pub.fn2.title": { en: "Adaptive coach + prescription", es: "Coach adaptativo + prescripción", ht: "Antrenè adaptatif + preskripsyon", ru: "Адаптивный тренер + назначение" },
  "pub.fn2.text": { en: "Your check-in scales today's exact session: duration, intensity cap and fuel. The AI coach (Gemini) writes the plain-English reasoning behind it.", es: "Tu chequeo ajusta la sesión exacta de hoy: duración, límite de intensidad y combustible. El coach de IA (Gemini) escribe el razonamiento en lenguaje claro.", ht: "Tcheke ou ajuste sesyon egzak jodi a: dire, limit entansite ak gaz. Antrenè IA (Gemini) ekri rezonman an nan langaj klè.", ru: "Чек-ин масштабирует сегодняшнюю тренировку: длительность, потолок интенсивности и питание. AI-тренер (Gemini) объясняет понятным языком." },
  "pub.fn3.title": { en: "Periodized plans + AdvanzedRacing", es: "Planes periodizados + AdvanzedRacing", ht: "Plan kous peryodize", ru: "Периодизированные планы гонок" },
  "pub.fn3.text": { en: "Triathlon, HYROX, cycling, running, swimming or lifting — 6-week blocks that grow ~5–8% as you complete weeks and back off when life gets busy.", es: "Triatlón, HYROX, ciclismo, carrera, natación o fuerza — bloques de 6 semanas que crecen ~5–8% al completar semanas y ceden cuando la vida se complica.", ht: "Triyatlon, HYROX, bisiklèt, kouri, naje oswa fòs — blòk 6 semèn ki grandi ~5–8% lè ou fini semèn yo epi kile lè lavi a vin okipe.", ru: "Триатлон, HYROX, вело, бег, плавание или силовые — блоки по 6 недель, +5–8% по мере выполнения, и откат при занятости." },
  "pub.fn4.title": { en: "Sleep & recovery", es: "Sueño y recuperación", ht: "Dòmi ak rekiperasyon", ru: "Сон и восстановление" },
  "pub.fn4.text": { en: "Wearable sync (Garmin, Oura, Whoop, COROS, Strava) pulls sleep, HRV and workouts automatically — no watch needed for the core flow.", es: "La sincronización de wearables (Garmin, Oura, Whoop, COROS, Strava) trae sueño, VFC y entrenamientos automáticamente — sin reloj para el flujo base.", ht: "Sikwonizasyon aparèy (Garmin, Oura, Whoop, COROS, Strava) rale dòmi, VFC ak antrennman otomatikman — pa bezwen mont pou koule debaz la.", ru: "Синхронизация носимых устройств (Garmin, Oura, Whoop, COROS, Strava) тянет сон, ВСР и тренировки — для базового потока часы не нужны." },
  "pub.fn5.title": { en: "Blood & DNA panels", es: "Análisis de sangre y ADN", ht: "Tès san ak ADN", ru: "Анализы крови и ДНК" },
  "pub.fn5.text": { en: "Store panels and get flags against athlete-adjusted ranges (endurance ferritin, vitamin D, B12), plus DNA trait highlights that change training.", es: "Guarda tus paneles y recibe alertas contra rangos ajustados al atleta (ferritina de resistencia, vitamina D, B12), más rasgos de ADN que cambian el entrenamiento.", ht: "Sere panno yo epi resevwa alèt kont ranje ajiste pou atlèt (feritin andirans, vitamin D, B12), plis karakteristik ADN ki chanje antrennman.", ru: "Храните панели и получайте флаги по спортивным диапазонам (ферритин, витамин D, B12), плюс ДНК-черты, меняющие тренировки." },
  "pub.fn6.title": { en: "Nutrition, fuel & ergogenics", es: "Nutrición, combustible y ergogénicos", ht: "Nitrisyon, gaz ak èrgojenik", ru: "Питание, топливо и эргогеники" },
  "pub.fn6.text": { en: "Personal protein targets, race-day fueling and evidence-graded ergogenic picks — de-duplicated so you're never told to take caffeine twice.", es: "Objetivos personales de proteína, combustible para el día de carrera y ayudas ergogénicas calificadas por evidencia — sin duplicados, para que nunca te digan dos veces que tomes cafeína.", ht: "Objektif pwoteyin pèsonèl, gaz jou kous ak èrgojenik klase pa prèv — san doublon, pou yo pa janm di ou pran kafeyin de fwa.", ru: "Личные нормы белка, топливо на гонку и эргогеники по доказательности — без дублей, чтобы не советовали кофеин дважды." },
  "pub.fn7.title": { en: "Your watch, your chat", es: "Tu reloj, tu chat", ht: "Mont ou, chat ou", fr: "Ta montre, ton chat", ru: "Твои часы, твой чат" },
  "pub.fn7.text": { en: "Connect Garmin, COROS, Strava, Whoop or Apple Health — data syncs daily and today's session ships to your watch (.FIT) and your Telegram the moment you want it.", es: "Conecta Garmin, COROS, Strava, Whoop o Apple Health — los datos se sincronizan a diario y la sesión de hoy va a tu reloj (.FIT) y a tu Telegram cuando la quieras.", ht: "Konekte Garmin, COROS, Strava, Whoop oswa Apple Health — done yo senkronize chak jou e pi seans jodi a ale nan mont ou (.FIT) ak Telegram ou.", fr: "Connectez Garmin, COROS, Strava, Whoop ou Apple Health — les données se synchronisent chaque jour et la séance du jour part vers votre montre (.FIT) et votre Telegram.", ru: "Подключите Garmin, COROS, Strava, Whoop или Apple Health — данные синхронизируются ежедневно, а тренировка дня уходит на часы (.FIT) и в Telegram." },

  // ---- landing: glance + how-it-works steps ----
  "pub.glance.dailyCheckin": { en: "Daily check-in", es: "Chequeo diario", ht: "Tcheke chak jou", ru: "Ежедневный чек-ин" },
  "pub.glance.readiness": { en: "Readiness verdict", es: "Veredicto de disposición", ht: "Vèdik preparasyon", ru: "Вердикт готовности" },
  "pub.glance.modes": { en: "Full · Trim · Easy · Rest", es: "Completo · Recortar · Suave · Descanso", ht: "Konplè · Redwi · Fasil · Repo", ru: "Полная · Сократить · Лёгкая · Отдых" },
  "pub.glance.guides": { en: "Evidence field guides", es: "Guías de campo de evidencia", ht: "Gid teren prèv", ru: "Полевые руководства" },
  "pub.step1.title": { en: "Check in", es: "Chequéate", ht: "Tcheke", ru: "Чек-ин" },
  "pub.step1.text": { en: "Two minutes: sleep, soreness, energy, motivation, stress — plus resting HR and weight when you have them.", es: "Dos minutos: sueño, dolor muscular, energía, motivación, estrés — más FC en reposo y peso cuando los tengas.", ht: "De minit: dòmi, doulè, enèji, motivasyon, estrès — plis FC repo ak pwa lè ou gen yo.", ru: "Две минуты: сон, боль, энергия, мотивация, стресс — плюс пульс покоя и вес, если есть." },
  "pub.step2.title": { en: "Get scored", es: "Recibe tu puntaje", ht: "Resevwa nòt ou", ru: "Получите оценку" },
  "pub.step2.text": { en: "Your answers combine into a 0–100 readiness score and one of four verdicts that scales today's session.", es: "Tus respuestas se combinan en un puntaje de disposición de 0 a 100 y uno de cuatro veredictos que ajusta la sesión de hoy.", ht: "Repons ou konbine nan yon nòt preparasyon 0–100 ak youn nan kat vèdik ki ajuste sesyon jodi a.", ru: "Ответы складываются в оценку 0–100 и один из четырёх вердиктов, масштабирующих тренировку." },
  "pub.step3.title": { en: "Execute", es: "Ejecuta", ht: "Egzekite", ru: "Выполняйте" },
  "pub.step3.text": { en: "The coach returns the exact session, fuel plan and recovery drill. You don't think — you go.", es: "El coach devuelve la sesión exacta, el plan de combustible y el ejercicio de recuperación. No piensas — solo vas.", ht: "Antrenè a retounen sesyon egzak la, plan gaz la ak egzèsis rekiperasyon an. Ou pa panse — ou ale.", ru: "Тренер возвращает точную тренировку, план питания и восстановление. Не думаешь — идёшь." },

  // ---- dashboard countdown ----
  "dash.countdown.title": { en: "Countdown to what matters", es: "Cuenta regresiva a lo que importa", ht: "Konte a sa ki enpòtan", ru: "Отсчёт до важного" },
  "dash.countdown.days": { en: "{n} days", es: "{n} días", ht: "{n} jou", ru: "{n} дн." },
  "dash.countdown.oneDay": { en: "Tomorrow", es: "Mañana", ht: "Demen", ru: "Завтра" },
  "dash.countdown.today": { en: "Today", es: "Hoy", ht: "Jodi a", ru: "Сегодня" },
  "dash.countdown.goal": { en: "Next goal", es: "Próxima meta", ht: "Pwochen objektif", ru: "Следующая цель" },
  "dash.countdown.race": { en: "Next race", es: "Próxima carrera", ht: "Pwochen kous", ru: "Следующая гонка" },
  "dash.countdown.baseline": { en: "Next baseline test", es: "Próxima prueba de línea base", ht: "Pwochen tès debaz", ru: "Следующий базовый тест" },
  "dash.countdown.noGoal": { en: "Set a goal date", es: "Fija una fecha objetivo", ht: "Mete yon dat objektif", ru: "Установите дату цели" },
  "dash.countdown.noRace": { en: "Add a race", es: "Añade una carrera", ht: "Ajoute yon kous", ru: "Добавьте гонку" },
  "dash.countdown.noBaseline": { en: "Schedule a test", es: "Programa una prueba", ht: "Pwograme yon tès", ru: "Запланируйте тест" },

  // ---- settings: integrated modules hub ----
  "settings.modulesTitle": { en: "Integrated modules", es: "Módulos integrados", ht: "Modil entegre", ru: "Интегрированные модули" },
  "settings.modulesSub": { en: "Everything that feeds your training lives here — live status and shortcuts.", es: "Todo lo que alimenta tu entrenamiento vive aquí — estado en vivo y accesos directos.", ht: "Tout sa ki nouri antrennman ou rete isit la — eta an dirèk ak rakoursi.", ru: "Всё, что питает тренировки, здесь — статус и ярлыки." },
  "settings.mod.connectors": { en: "Conectores", es: "Conectores", ht: "Konektè", ru: "Подключения" },
  "settings.mod.connectorsDesc": { en: "Garmin, Strava, Oura, Whoop, COROS, Apple Health", es: "Garmin, Strava, Oura, Whoop, COROS, Apple Health", ht: "Garmin, Strava, Oura, Whoop, COROS, Apple Health", ru: "Garmin, Strava, Oura, Whoop, COROS, Apple Health" },
  "settings.mod.dna": { en: "ADN Smart Training", es: "ADN Smart Training", ht: "ADN Smart Training", ru: "ADN Smart Training" },
  "settings.mod.dnaDesc": { en: "DNA SNPs that guide your training", es: "SNPs de ADN que guían tu entrenamiento", ht: "SNP ADN ki gide antrennman ou", ru: "SNP ДНК, направляющие тренировки" },
  "settings.mod.gear": { en: "Laboratorio de equipamiento", es: "Laboratorio de equipamiento", ht: "Laboratwa ekipman", ru: "Лаборатория снаряжения" },
  "settings.mod.gearDesc": { en: "What gear you own → what to measure next", es: "Qué equipamiento tienes → qué medir después", ht: "Ki ekipman ou genyen → kisa pou mezire apre", ru: "Какое снаряжение есть → что мерить дальше" },
  "settings.mod.blood": { en: "Análisis de sangre", es: "Análisis de sangre", ht: "Analiz san", ru: "Анализ крови" },
  "settings.mod.bloodDesc": { en: "Panels → nutrition & supplementation flags", es: "Paneles → alertas de nutrición y suplementación", ht: "Panno → alèt nitrisyon ak sipleman", ru: "Панели → флаги питания и добавок" },
  "settings.mod.open": { en: "Open", es: "Abrir", ht: "Louvri", ru: "Открыть" },
  "settings.mod.notSetUp": { en: "Not set up yet", es: "Aún sin configurar", ht: "Pa konfigire ankò", ru: "Пока не настроено" },
  "settings.mod.connected": { en: "{n} connected", es: "{n} conectados", ht: "{n} konekte", ru: "{n} подключено" },
  "settings.mod.traits": { en: "{n} traits analyzed", es: "{n} rasgos analizados", ht: "{n} karakteristik analize", ru: "{n} черт проанализировано" },
  "settings.mod.gearCount": { en: "{n} devices tracked", es: "{n} dispositivos registrados", ht: "{n} aparèy anrejistre", ru: "{n} устройств учтено" },
  "settings.mod.panels": { en: "{n} panels · {f} flags", es: "{n} paneles · {f} alertas", ht: "{n} panno · {f} alèt", ru: "{n} панелей · {f} флагов" },
};

// Locale per language for Intl numeric/date formatting.
const LOCALE: Record<Lang, string> = {
  en: "en-US", // 1,234.56
  es: "es-ES", // 1.234,56
  fr: "fr-FR", // 1 234,56
  ht: "fr-FR", // Haitian Creole follows French numeric convention
  ru: "ru-RU", // 1 234,56
};

// Locale-aware number formatting — the "numeric system" follows the language
// (decimal comma vs dot, thousands separator). Decimals default to auto (0-2).
export function fmtNum(n: number | null | undefined, lang?: Lang | string | null, decimals?: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const locale = LOCALE[(lang as Lang) || "es"] || "es-ES";
  const opts = decimals === undefined
    ? { maximumFractionDigits: 2 }
    : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  return new Intl.NumberFormat(locale, opts).format(n);
}

export function t(lang: Lang | string | undefined | null, key: string): string {
  const l = (lang || "es") as Lang;
  return S[key]?.[l] || S[key]?.es || S[key]?.en || key;
}
