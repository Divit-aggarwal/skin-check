# Page map

Every page, how the user reaches it, and where they can go next. No page is a
dead end. The app shell (system.md §6) is on every signed-in page, so the six
main places can always be reached from it. The "Next" column lists the
in-page ways forward in addition to the shell.

## Main places (in the shell)

| Place | Route | Reached from | Next (in page) |
|---|---|---|---|
| **Home** (dashboard) | `/dashboard` | After sign-in (TD-24 (3)); `/` when signed in; shell; results screen; every "Back" link | TD-47 (docs/design/home-v2.md): next check → New check; latest check → Open full check, Check history (a face area → Echo on it, TD-46); today's routine (Mark done in place) → Routine; weather and air (city by location or typed); your record; Ask Echo starters → Echo, sending the question; new-check banner → New check. Right after a check's results, the first time only: the permissions screen (location, reminders), then Home |
| **Checks** (history) | `/checks` | Shell; Home "See full timeline" (Timeline tab) and the latest-check card | A check row → Check; Timeline tab; New check |
| **Check** (one opened) | `/checks/[scanId]` | Checks list; Home latest check; Timeline check item | Phone: Back to all checks; desktop: the list and the List/Timeline tabs stay beside it; Ask Echo (newest reading only); New check |
| **Timeline** | `/checks?view=timeline` (a tab on Checks) | Checks tab; Home "See full timeline" | A check item → Check; a routine item → Routine |
| **New check** | `/skin-check` | Shell (centre button on phones); Home; Checks; empty states | About you → About the questions (answer now or skip) → sign in → photo → questions (if answering) → Results |
| **Results** | `/skin-check` when finished | End of the check flow | Home; this check → Check; Echo; New check |
| **Routine** | `/routine` | Shell; Home routine card; Timeline routine item | Add, swap, stop, mark used or skipped; Home |
| **Echo** | `/echo` | Shell; Home; Check (newest); Results | Chat about one face area at a time (Forehead, Cheeks, Nose, Chin: each area is its own Echo thread, so there is no Whole face chip; the whole-face readings are in the side panel); Open this check; back to Home. With no reading yet: an empty state that leads to New check |
| **Questions** (answer later, TD-33) | `/questions` | Home and Account card "Your Skin Check questions" (only while a check waits); results screen after a skip; an opened skipped check; Echo's notice | Answer one part at a time, Continue / Back, Save → Ask Echo (when it is Echo's check) or Home; "Not now, go to Home"; nothing waiting → Home |
| **Account** | `/account` | Shell (phone: header icon); sign-in links | Sign in → Home; consent status and withdraw (and whether the newest photo was kept); location, city and reminders (TD-47); Delete account → confirm → signed-out start |

## Signed-out pages

| Page | Route | Next |
|---|---|---|
| Start | `/` → `/skin-check` | Begin the check; "Sign in" (top bar) → Account |
| Sign in | `/account` (signed out) | Phone and code → Home |
| Any signed-in route while signed out | `/dashboard`, `/checks`, `/checks/[id]`, `/routine`, `/echo` | A designed "Sign in to see …" card with Sign in → Account, and Start a check → `/skin-check` |
| After account deletion | `/account` | "Your account and your data have been deleted." → Start a check |

## Dead ends found in the current app, and the fix

| Today | Fix |
|---|---|
| `/echo` opened directly, or after a refresh, says "We lost your check-in" and only offers "Back to Skin Check" | Echo builds its own session from the user's newest reading, using the same helper as the dashboard's Chat with Echo (screen-loading code). With no reading, an empty state leads to New check. |
| `/account` has no way to the routine or Echo; `/routine` and `/echo` have no way back except the browser | The shell on every signed-in page |
| An opened past check offers only "Back to your dashboard" | The shell, plus Back to Checks and New check |
| The results screen links to "Your previous scans" on `/account`, a second, different history list | One history: Checks. Account keeps only account and privacy. |
| `/` always goes to the start of the check flow, even when signed in | Signed in: Home. Signed out: the check flow. |
| After sign-in on `/account` the user stays on the form page | Go to Home |

## Keyboard and screen reader paths

- Skip link, then the main nav, then the page `<main>` with one `<h1>` (in the check flow, the part of the check the user is in; on a phone's opened check, "Checks" is kept for screen readers).
- The phone header's Account button comes before the page content in the tab order.
- Buttons stay focusable while they save (aria-disabled, not disabled), so focus is never dropped.
- Every list row is a single link with a full name, for example "Open the
  check from 3 Oct 2026".
- Echo's message list is `role="log"` with `aria-live="polite"`.
- The used and skipped buttons for a routine item say which product and slot
  they are for, for example "Used: Sample Gentle Cleanser, morning".
