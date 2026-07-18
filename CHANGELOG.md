# Changelog — ACL Noise Monitoring

Each version maps to the git commit listed below, so any previous version
can be restored with `git checkout <commit>` (or by asking Claude to roll
back to it). The same history is shown in-app under **Settings → Version**.
Keep `js/version.js` in step with this file.

## v1.9.1 — commit `fa2c364` — 2026-07-18
- Fixed the G button not opening from the home-screen app (iOS blocks
  window.open in standalone mode)
- Google Satellite Preview panel on the Map tab — live Google imagery of the
  current map view, inside the app
- Google links now route to the Google Maps app when installed

## v1.9.0 — commit `7dd8d79` — 2026-07-18
- Google Maps hand-off: G button opens Google satellite at the current map
  view; each position and marker popup links to its spot in Google Maps
- Paste coordinates copied from Google Maps to drop a position in the app
- True Google basemap in-app remains possible later with a Google API key

## v1.8.0 — commit `017c263` — 2026-07-18
- Site plan can now be zoomed (pinch or +/− buttons, up to 6x) and panned by
  dragging
- Positions are only added on a deliberate tap — dragging or pinching never
  places one
- Position markers and numbering on the plan are much bigger, in-app and on
  exports

## v1.7.1 — commit `86ce598` — 2026-07-18
- Updates now apply on the first launch — the app refreshes itself when a
  new version downloads (previously it took two opens)

## v1.7.0 — commit `31f4d91` — 2026-07-18
- Dedicated Settings screen (opened from a single row on the home screen)
- Operatives list in Settings — mark yourself as default and every new sheet
  pre-fills your name
- Site Operative is now a dropdown fed from the operatives list
- Equipment row given a level-slider icon

## v1.6.0 — commit `64c9737` — 2026-07-18
- New Settings section on the home screen (Equipment, Appearance, Version)
- Clean branded header restored
- App version shown in-app and on PDF report footers
- Change history viewable under Settings → Version

## v1.5.0 — commit `595979f` — 2026-07-18
- Dark mode: follows the iPhone setting, manual dark/light/auto override
- Native pickers and controls render dark; exports stay light

## v1.4.0 — commit `4ecafab` — 2026-07-18
- Editable company equipment register feeding the meter/vibration pickers
- Sheets keep their saved kit even if it is later removed from the register

## v1.3.0 — commit `0ba5029` — 2026-07-18
- Tap-to-add numbered measurement positions on the site layout plan (map-style)
- Noise Climate fields: predominant source(s) and residual noise description
- Log entries fully editable, including assigning a missed location
- Photos can be annotated with drawings and text notes

## v1.2.1 — commit `37b6e5e` — 2026-07-18
- App icon matched to the official signature (burgundy disc, white mark)
- Light lockup used on Word export headers

## v1.2.0 — commit `54cc489` — 2026-07-18
- Full ACL rebrand: burgundy/amber/cream palette from company presentation
- Real ACL logo in the header and on PDF titles; icons re-rendered

## v1.1.0 — commit `10de161` — 2026-07-17
- First logo and complete iOS home-screen icon set
- iPhone install instructions

## v1.0.0 — commit `afd184b` — 2026-07-17
- Initial app: monitoring sheets, map with OS grid references, live log with
  photos, layout markup, weather auto-fill, PDF/Word/Excel/email exports,
  offline PWA
