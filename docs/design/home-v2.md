# Home v2: what to do for my skin today (TD-47, G28)

Status: built on `feat/home-v2`. This note covers layout and data only. Colours, type and components come from
[system.md](system.md), unchanged.

## Layout

| Width | Layout |
|---|---|
| Phone, under 640 | One column in this order: greeting, next check, latest check, today's routine, weather and air today, your record, Ask Echo, new-check banner. |
| Tablet, 640–1279 | The same single column, at full content width. The side rail takes 88px, and at 1024 the sidebar takes 240px, so two columns would squeeze the routine card. Nothing scrolls sideways. |
| Desktop, 1280 and up | Main column (8 of 12): latest check; then your record and today's routine side by side; then the banner. Right column (4 of 12): weather and air, next check, Ask Echo. |

Two things kept from the old Home, because owner decisions name them:
- The TD-33 "answer the questions" card stays under the latest check, while a check's questions are waiting.
- The TD-46 tappable face areas stay on the drawing.

The H14 privacy card moves to Account only, where it already is.

**Names.** The D-12 word checks ban "progress" and "conditions" (TD-47 agent note), so the cards are titled
"Your record" and "Weather and air today". "View full results" becomes "Open full check", because "results" is on
the same list.

## Cards: where the data comes from, and every state

| Card | Data | States |
|---|---|---|
| Greeting | First word of `answers.name` on the newest check; the browser's clock and time zone | Morning before 12:00, afternoon before 17:00, evening after; no name: "Good morning" alone |
| Next check | Newest check with a reading (`deriveDashboard`); `CHECK_INTERVAL_RULE` (7 days, provisional, lib/home/schedule.ts); starting checks from `startingCheckCount` (lib/longitudinal) | No check ("Take your first check"); "Next check in X days"; "Due today"; "Overdue by X days". The button is primary when due or overdue, otherwise secondary. |
| Latest check | `deriveDashboard().current` (readings), `Thumb` (kept photo, via the server) or `FaceDrawing`, `photoCheck`, the fixed `KnownAndNotKnown` | Loading; no check; analysing (newest check has no reading yet, under 10 min old); no reading (old, failed or questions-only); reading |
| Today's routine | `useRoutine()` → GET /api/routine/events (no new data model). "Mark done" = the existing `usage` event, `status: "used"`. | Loading; error; no routine (set one up); nothing due today; steps with "X of Y done", a progress bar and the streak |
| Weather and air today | The `settings/home` doc (city) → POST /api/home/weather → Open-Meteo (server only) | Switched off (card hidden); loading; no city (why, "Use my location", "Type my city"); location blocked (how to turn it on, plus "Type my city"); ready; unavailable (the last value with its time from this device, else a quiet line) |
| Your record | Routine days logged in the last 7 days, checks taken (history length), starting checks, the existing trend line | Loading; no checks; building; set. A comparison view would go in its own section here later (not built). |
| Ask Echo | `pickStarters` (same pool, same rotation, product questions hidden while suggestions are off); tapping one opens `/echo?ask=<question>` and Echo sends it only if it is an exact pool question | Echo off (card hidden); no reading (take a check); questions not answered (no starters, just "Chat with Echo") |
| New-check banner | None | Always shown when a check exists (the empty state already offers the first check) |

**Streak.** The number of calendar days in a row, in the user's time zone, each with at least one usage event
(used or skipped). The run ends today, or yesterday when today has nothing logged yet, so it does not break before
the day is over. Days are the event's `effectiveDate` (the user's local date when it was logged), so midnight and
time zone changes are settled by data that already exists. Tested in tests/home-v2.test.ts.

**UV advice (fixed rules, UV category only, WHO categories):**

| UV index | Category | Line |
|---|---|---|
| 0–2 | Low | If you are outdoors for long, sunscreen still helps. |
| 3–5 | Moderate | Wear sunscreen when you go outdoors, and seek shade around midday. |
| 6–7 | High | Wear sunscreen outdoors and reapply every two hours. Seek shade around midday. |
| 8–10 | Very high | Wear sunscreen, a hat and sunglasses outdoors. Stay in the shade around midday. |
| 11+ | Extreme | Stay out of the midday sun if you can. Outdoors, wear sunscreen, a hat and sunglasses. |

Air quality uses the US AQI and its categories:
- Good, 0–50
- Moderate, 51–100
- Unhealthy for sensitive groups, 101–150
- Unhealthy, 151–200
- Very unhealthy, 201–300
- Hazardous, over 300

The tile names the scale. No tile has a colour scale; everything is ink on a neutral surface. No line names the skin
or a reading.

## New data

| Path | Writer | Fields |
|---|---|---|
| `users/{uid}/settings/home` | The owner's client (rules: owner only, not erased, not under 18, exact keys) | `location`, `reminders`: `allowed` \| `not_now` \| `refused` \| `unsupported`; `city`: null or `{name, region, country, latE1, lonE1, source: device\|typed}`, where `latE1` and `lonE1` are integer tenths of a degree (about 11 km), so a precise position cannot be stored; `askedAt`: server time |
| `users/{uid}/pushSubscriptions/{sha256(endpoint)}` | Server only (POST /api/home/reminders) | `endpoint` (allow-listed push hosts), `timeZone`, `createdAt`, `lastSentOn` |

Both sit under `users/{uid}`, so account erase (`recursiveDelete`) removes them. Neither is read by the Echo or
Gemini code.

**Location path.**
1. The browser rounds the position to tenths inside the geolocation callback and drops it.
2. The rounded value goes to POST /api/home/place (body, never the URL).
3. The server rounds again and finds the nearest place in lib/home/cities.json (GeoNames, offline). No outside
   service sees a position or a typed city.
4. POST /api/home/weather sends only the rounded coordinates to Open-Meteo, with a 30-minute shared cache per
   coordinate.

## Order of screens after a check

1. Results.
2. When the results render, the page sets a session flag (`home-v2:after-check`).
3. When Home opens and that flag is set, and `settings/home` has no `askedAt`, Home shows the permissions screen
   first.
4. The user lands on Home after either choice.

Without the flag (sign-in, a link, the nav), the screen never shows. When both features are switched off it is
skipped.

## Switches (all off by default)

| Setting | Effect |
|---|---|
| `CONDITIONS_SWITCH=on` | The weather card and the location question. They also need `OPEN_METEO_API_KEY`; without the key the card shows "not available". |
| `PUSH_SWITCH=on` | The reminders question and push sending. They also need `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. |

Without them, Home shows the next-check card, which is the reminder.
