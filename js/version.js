/* App version & changelog.
   Bump the version and add a changelog entry with every update.
   Each released version is also tagged in git (tag = "v" + version),
   so any previous version can be restored on request. */
(function (global) {
  'use strict';

  global.APP = {
    version: '1.10.0',
    changelog: [
      {
        version: '1.10.0',
        date: '2026-07-19',
        notes: [
          'Back up all data (Settings): every sheet, photo, layout plan and both registries saved to a single file via the share sheet',
          'Restore backup: import that file on the same or another device — existing sheets are kept, duplicates skipped',
          'Also works as a device-to-device transfer'
        ]
      },
      {
        version: '1.9.7',
        date: '2026-07-19',
        notes: [
          'Default operative marker simplified to just "default" in small letters under the name'
        ]
      },
      {
        version: '1.9.6',
        date: '2026-07-19',
        notes: [
          'Default operative marker changed to a small text line under the name — the tag was squeezing the name field'
        ]
      },
      {
        version: '1.9.5',
        date: '2026-07-19',
        notes: [
          'The selected operative now shows a gold "Default" tag so it is clear whose name pre-fills new sheets'
        ]
      },
      {
        version: '1.9.4',
        date: '2026-07-19',
        notes: [
          'Sheets are titled company-style: job number first, then project name — on the sheets list, sheet header, exports and export file names'
        ]
      },
      {
        version: '1.9.3',
        date: '2026-07-19',
        notes: [
          'Equipment settings icon changed to a speaker symbol — the fader icon read as a cross at a glance'
        ]
      },
      {
        version: '1.9.2',
        date: '2026-07-19',
        notes: [
          'Robust updates: the app compares its version against the server directly and refreshes itself if newer — no longer relies on browser update quirks',
          'Update check runs at launch and every time the app returns to the foreground',
          'Manual "Check for updates" row added in Settings'
        ]
      },
      {
        version: '1.9.1',
        date: '2026-07-18',
        notes: [
          'Fixed the G button not opening from the home-screen app (iOS blocks window.open in standalone mode)',
          'Google Satellite Preview panel on the Map tab — live Google imagery of the current map view, inside the app',
          'Google links now route to the Google Maps app when installed'
        ]
      },
      {
        version: '1.9.0',
        date: '2026-07-18',
        notes: [
          'Google Maps hand-off: G button opens Google satellite at the current map view; each position and marker popup links to its spot in Google Maps',
          'Paste coordinates copied from Google Maps (press-and-hold a spot there) to drop a position here',
          'True Google basemap in-app remains possible later with a Google API key'
        ]
      },
      {
        version: '1.8.0',
        date: '2026-07-18',
        notes: [
          'Site plan can now be zoomed (pinch or +/− buttons, up to 6x) and panned by dragging',
          'Positions are only added on a deliberate tap — dragging or pinching never places one',
          'Position markers and numbering on the plan are much bigger, in-app and on exports'
        ]
      },
      {
        version: '1.7.1',
        date: '2026-07-18',
        notes: [
          'Updates now apply on the first launch — the app refreshes itself when a new version downloads (previously it took two opens)'
        ]
      },
      {
        version: '1.7.0',
        date: '2026-07-18',
        notes: [
          'Dedicated Settings screen (opened from a single row on the home screen)',
          'Operatives list in Settings — mark yourself as default and every new sheet pre-fills your name',
          'Site Operative is now a dropdown fed from the operatives list',
          'Equipment row given a level-slider icon'
        ]
      },
      {
        version: '1.6.0',
        date: '2026-07-18',
        notes: [
          'New Settings section on the home screen (Equipment, Appearance, Version)',
          'Clean branded header restored',
          'App version shown in-app and on PDF report footers',
          'Change history viewable under Settings → Version'
        ]
      },
      {
        version: '1.5.0',
        date: '2026-07-18',
        notes: [
          'Dark mode: follows the iPhone setting, manual dark/light/auto override',
          'Native pickers and controls render dark; exports stay light'
        ]
      },
      {
        version: '1.4.0',
        date: '2026-07-18',
        notes: [
          'Editable company equipment register feeding the meter/vibration pickers',
          'Sheets keep their saved kit even if it is later removed from the register'
        ]
      },
      {
        version: '1.3.0',
        date: '2026-07-18',
        notes: [
          'Tap-to-add numbered measurement positions on the site layout plan (map-style)',
          'Noise Climate fields: predominant source(s) and residual noise description',
          'Log entries fully editable, including assigning a missed location',
          'Photos can be annotated with drawings and text notes'
        ]
      },
      {
        version: '1.2.1',
        date: '2026-07-18',
        notes: [
          'App icon matched to the official signature (burgundy disc, white mark)',
          'Light lockup used on Word export headers'
        ]
      },
      {
        version: '1.2.0',
        date: '2026-07-18',
        notes: [
          'Full ACL rebrand: burgundy/amber/cream palette from company presentation',
          'Real ACL logo in the header and on PDF titles; icons re-rendered'
        ]
      },
      {
        version: '1.1.0',
        date: '2026-07-17',
        notes: [
          'First logo and complete iOS home-screen icon set',
          'iPhone install instructions'
        ]
      },
      {
        version: '1.0.0',
        date: '2026-07-17',
        notes: [
          'Initial app: monitoring sheets, map with OS grid references, live log with photos,',
          'layout markup, weather auto-fill, PDF/Word/Excel/email exports, offline PWA'
        ]
      }
    ]
  };
})(window);
