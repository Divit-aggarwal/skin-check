# Kit requests (redesign lanes)

Lanes append here; the main session merges them in batches and marks each
row. Format: lane · what · why · screen · status.

| # | Lane | Request | Why / screen | Status |
|---|---|---|---|---|
| A1 | A checks | `PhotoTile`: pass `referrerPolicy="no-referrer"` and an `onError` (or accept a rendered `<img>` child), and a fallback when the image fails | The kept photo is a short-lived signed URL; `Thumb` sets no-referrer and drops a failed image. Until then the Photos view (12) keeps `Thumb`'s own `<img>` with the tile look (`size="tile"`) and a date pill drawn in `ChecksTabs.tsx` | open |
| A2 | A checks | `MetricTile`: optional `href` (whole tile a link, hover tint, `h-full`) | Tiles on 10 and 12 open 11 (`/checks?reading=<key>`); today `ChecksTabs.tsx` wraps the tile in a `Link` and stretches it with `[&>div]:h-full` | open |
