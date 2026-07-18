/* App version & changelog.
   Bump the version and add a changelog entry with every update.
   Each released version is also tagged in git (tag = "v" + version),
   so any previous version can be restored on request. */
(function (global) {
  'use strict';

  global.APP = {
    version: '1.7.0',
    changelog: [
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
