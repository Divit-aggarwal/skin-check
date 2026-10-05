# Page map

Every page, how the user reaches it, and where they can go next. No page is a
dead end. The app shell (system.md §6) is on every signed-in page, so the six
main places can always be reached from it. The "Next" column lists the
in-page ways forward in addition to the shell.

## Main places (in the shell)

| Place | Route | Reached from | Next (in page) |
|---|---|---|---|
| **Home** (dashboard) | `/dashboard` | After sign-in (TD-24 (3)); `/` when signed in; shell; results screen; every "Back" link | Latest check → that check; trend card; today's routine (used / skipped in place) → Routine; latest timeline items → Timeline; Ask Echo → Echo; New check |
| **Checks** (history) | `/checks` | Shell; Home "All checks" | A check row → Check; Timeline tab; New check |
| **Check** (one opened) | `/checks/[scanId]` | Checks list; Home latest check; Timeline check item | Back to Checks; Ask Echo (newest reading only); New check |
| **Timeline** | `/checks?view=timeline` (a tab on Checks) | Checks tab; Home "See full timeline" | A check item → Check; a routine item → Routine |
| **New check** | `/skin-check` | Shell (centre button on phones); Home; Checks; empty states | Questions → photo → more questions → Results |
| **Results** | `/skin-check` when finished | End of the check flow | Home; this check → Check; Echo; New check |
| **Routine** | `/routine` | Shell; Home routine card; Timeline routine item | Add, swap, stop, mark used or skipped; Home |
| **Echo** | `/echo` | Shell; Home; Check (newest); Results | Chat; back to Home. With no reading yet: an empty state that leads to New check |
| **Account** | `/account` | Shell (phone: header icon); sign-in links | Sign in → Home; consent status and withdraw; Delete account → confirm → signed-out start |

## Signed-out pages

| Page | Route | Next |
|---|---|---|
| Start | `/` → `/skin-check` | Begin the check; "Sign in" (top bar) → Account |
| Sign in | `/account` (signed out) | Phone and code → Home |
| Any signed-in route while signed out | `/dashboard`, `/checks`, `/routine`, `/echo` | A designed "Sign in to see …" card with Sign in → Account, and Start a check → `/skin-check` |
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

- Skip link, then the main nav, then the page `<main>` with one `<h1>`.
- Every list row is a single link with a full name, for example "Open the
  check from 3 Oct 2026".
- Echo's message list is `role="log"` with `aria-live="polite"`.
- The used and skipped buttons for a routine item say which product and slot
  they are for, for example "Used: Sample Gentle Cleanser, morning".
