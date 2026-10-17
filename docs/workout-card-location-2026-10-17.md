# Workout execution and location update

Workout cards show each phase's target, duration/distance/repetitions, effort cue and instructions directly below the graphic. Repeated sets retain exact effort/recovery counts and expandable individual steps. The first graphical step is selected initially. The graphic defaults to a prescribed pace, power or HR view when supplied, otherwise RPE. The athlete can still change views.

Targets come from the existing canonical prescription. This update does not invent HR, watts, swimming pace or a second workout. Running power requires a running reference and sensor; cycling FTP is not applied to running. Swimming guidance uses prescribed swim pace/effort and only a supplied swim-specific HR target. HYROX and strength retain movement, repetition, load and rest details. A missing numerical reference remains visible. RPE derived from the existing zone convention is labeled a zone reference, not measured effort.

The location form asks for a city and state/region or postal code, not latitude, longitude or altitude. Authenticated search returns candidate areas from Open-Meteo/GeoNames, including timezone; the athlete chooses the correct area. It does not silently accept the first ambiguous result. Previous confirmed locations from that athlete's session records are offered and the latest is an editable suggestion when today's location is blank. A previous venue or forecast never becomes today's confirmed conditions automatically. No home address or phone GPS is inferred.

Saving a session's location uses the existing owner-scoped revision check. A new weather request requires confirming the area, indoor/outdoor setting and planned time. Coordinates and time go to the existing MET Norway provider; identity and health information do not. Forecasts are estimates for an area, not measured route conditions or clearance. Location/weather failure does not prevent viewing the workout or continuing without weather.

The existing environment revision invalidates an earlier workout approval and requires review. This update does **not** implement an automatic temperature-to-pace/power/duration correction. Such prescription changes need a separate reviewed policy, individual context, tests and a visible approval flow. No new adaptation factors or heat-clearance thresholds were introduced.

Security: search requires authenticated athlete access, same-origin JSON, rate/body limits and a fixed external host; provider responses are bounded and validated. Saved-location reads are athlete-scoped, privately cached/no-store, and reject mismatched audit evidence. No database migration, real athlete profile edit or safety-answer change is part of this release.

Provider contract: [Open-Meteo geocoding](https://open-meteo.com/en/docs/geocoding-api).
