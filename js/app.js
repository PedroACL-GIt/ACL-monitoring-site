/* ACL Noise Monitoring — main app logic */
(function () {
  'use strict';

  /* ================= State ================= */

  var sheets = Store.loadSheets();
  // migrate sheets created before the noise-climate fields existed
  sheets.forEach(function (s) { if (!s.noise) s.noise = { sources: '', residual: '' }; });
  var sheet = null;          // currently open sheet object (reference into sheets[])
  var pendingPhotos = [];    // photo ids staged in the composer
  var editingEntryId = null;         // entry currently loaded in the composer for editing
  var editingOriginalPhotos = [];    // its photo ids at edit start (for orphan cleanup)
  var saveTimer = null;
  var durationTimer = null;

  /* ================= Utilities ================= */

  function $(id) { return document.getElementById(id); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.add('hidden'); }, ms || 2200);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function nowLocalInput() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ================= Sheet model ================= */

  /** Company-style label: job number first, then project name. */
  function sheetLabel(s) {
    var t = [s.jobNo, s.project].filter(Boolean).join(' — ');
    return t || 'Untitled sheet';
  }

  function newSheet() {
    return {
      id: uid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      project: '', jobNo: '', client: '', address: '',
      date: new Date().toISOString().slice(0, 10),
      operative: people.defaultName || '', surveyType: '', description: '',
      weather: { cond: '', temp: '', wind: '', windDir: '', notes: '' },
      noise: { sources: '', residual: '' },
      equipment: { meter: '', vibKit: '', calStart: '', calEnd: '', notes: '' },
      times: { start: '', finish: '' },
      locations: [],   // {id, name, params, lat?, lng?, gridRef?, plan?: {page,x,y}}
      entries: [],     // {id, ts, text, meterFile, locationId, photoIds[]}
      layout: { blobId: null, isPdf: false, name: '', pages: {} } // pages[n] = [shape,...]
    };
  }

  function persist() {
    if (sheet) sheet.updatedAt = new Date().toISOString();
    Store.saveSheets(sheets);
    var si = $('save-indicator');
    if (si) si.textContent = 'Saved ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    var si = $('save-indicator');
    if (si) si.textContent = 'Saving…';
    saveTimer = setTimeout(function () {
      readDetailsForm();
      persist();
    }, 400);
  }

  /* ================= Theme ================= */

  var THEME_KEY = 'acl_nms_theme';

  function applyTheme() {
    var pref = localStorage.getItem(THEME_KEY);
    if (pref === 'dark' || pref === 'light') document.documentElement.dataset.theme = pref;
    else delete document.documentElement.dataset.theme;
  }

  function themeLabel() {
    var pref = localStorage.getItem(THEME_KEY);
    return pref === 'dark' ? 'Dark' : pref === 'light' ? 'Light' : 'Automatic';
  }

  function updateThemeLabel() {
    var el = $('theme-value');
    if (el) el.textContent = themeLabel();
  }

  function cycleTheme() {
    var pref = localStorage.getItem(THEME_KEY);
    var next = pref === 'dark' ? 'light' : pref === 'light' ? 'auto' : 'dark';
    if (next === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
    applyTheme();
    updateThemeLabel();
    toast('Appearance: ' + (next === 'auto' ? 'automatic (follows iPhone setting)' : next));
  }

  /** Compare our version against the server's (bypassing every cache).
      On mismatch: wipe the app cache and reload — deterministic update
      that doesn't depend on browser service-worker update quirks. */
  function checkForUpdates(manual) {
    fetch('js/version.js?nocache=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); })
      .then(function (txt) {
        var m = txt.match(/version:\s*'([0-9.]+)'/);
        if (!m) throw new Error('no version');
        if (m[1] === APP.version) {
          if (manual) toast('Up to date — v' + APP.version);
          return;
        }
        var last = +(localStorage.getItem('acl_nms_upd_ts') || 0);
        if (!manual && Date.now() - last < 120000) return; // reload-loop guard
        localStorage.setItem('acl_nms_upd_ts', String(Date.now()));
        toast('Updating to v' + m[1] + '…');
        var wipe = ('caches' in window)
          ? caches.keys().then(function (ks) {
              return Promise.all(ks.map(function (k) { return caches.delete(k); }));
            })
          : Promise.resolve();
        wipe.then(function () {
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(function (reg) {
              if (reg) reg.update().catch(function () {});
            });
          }
          setTimeout(function () { location.reload(); }, 400);
        });
      })
      .catch(function () {
        if (manual) toast('Could not check — are you online?');
      });
  }

  function renderChangelog() {
    $('about-version-line').textContent = 'Version ' + APP.version;
    var wrap = $('changelog-list');
    wrap.innerHTML = '';
    APP.changelog.forEach(function (rel) {
      var card = document.createElement('div');
      card.className = 'card';
      card.innerHTML =
        '<div class="card-title-row"><h3 class="card-title">v' + esc(rel.version) + '</h3>' +
        '<span class="muted">' + esc(rel.date) + '</span></div>' +
        '<ul class="changelog-notes">' +
        rel.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') +
        '</ul>';
      wrap.appendChild(card);
    });
  }

  /* ================= Equipment registry ================= */
  /* Company-wide kit list (device-stored), editable under ⚙ Equipment.
     Placeholder names until the real fleet is entered. */

  var EQUIP_KEY = 'acl_nms_equipment_v1';

  function loadEquipment() {
    try {
      var e = JSON.parse(localStorage.getItem(EQUIP_KEY));
      if (e && Array.isArray(e.meters) && Array.isArray(e.vibKits)) return e;
    } catch (err) { /* fall through to defaults */ }
    return {
      meters: ['NTi XL2 — 1', 'NTi XL2 — 2', 'NTi XL2 — 3', 'NTi XL3 — 1', 'NTi XL3 — 2', 'NTi XL3 — 3'],
      vibKits: ['Vibration Kit 1', 'Vibration Kit 2', 'Vibration Kit 3']
    };
  }

  var equipment = loadEquipment();

  function saveEquipment() {
    localStorage.setItem(EQUIP_KEY, JSON.stringify(equipment));
    populateRegistrySelects();
  }

  /* People (operatives) registry — one can be marked as the default,
     which pre-fills the Site Operative picker on every new sheet. */

  var PEOPLE_KEY = 'acl_nms_people_v1';

  function loadPeople() {
    try {
      var p = JSON.parse(localStorage.getItem(PEOPLE_KEY));
      if (p && Array.isArray(p.names)) return p;
    } catch (err) { /* fall through */ }
    return { names: [], defaultName: '' };
  }

  var people = loadPeople();

  function savePeople() {
    localStorage.setItem(PEOPLE_KEY, JSON.stringify(people));
    populateRegistrySelects();
    updateOperativeLabel();
  }

  function updateOperativeLabel() {
    var el = $('operative-default-label');
    if (el) el.textContent = (people.defaultName || 'None set') + ' ›';
  }

  function renderOperativesScreen() {
    var wrap = $('operative-list');
    wrap.innerHTML = '';
    people.names.forEach(function (name, i) {
      var el = document.createElement('div');
      el.className = 'equip-item';
      el.innerHTML =
        '<input type="radio" class="op-radio" name="op-default" title="Pre-fill new sheets with this name"' +
        (name && people.defaultName === name ? ' checked' : '') + '>' +
        '<input class="op-name" value="' + esc(name) + '" placeholder="Full name">' +
        '<button class="equip-del" title="Remove">✕</button>';
      el.querySelector('.op-radio').addEventListener('change', function () {
        people.defaultName = people.names[i];
        savePeople();
        toast((people.defaultName || 'This name') + ' will be pre-filled on new sheets');
      });
      el.querySelector('.op-name').addEventListener('input', function (e) {
        var wasDefault = people.defaultName && people.defaultName === people.names[i];
        people.names[i] = e.target.value;
        if (wasDefault) people.defaultName = e.target.value;
        savePeople();
      });
      el.querySelector('.equip-del').addEventListener('click', function () {
        if (!confirm('Remove "' + (people.names[i] || 'this name') + '"? Existing sheets keep their saved operative.')) return;
        if (people.defaultName === people.names[i]) people.defaultName = '';
        people.names.splice(i, 1);
        savePeople();
        renderOperativesScreen();
      });
      wrap.appendChild(el);
    });
    $('operative-empty').classList.toggle('hidden', people.names.length > 0);
  }

  function populateRegistrySelects() {
    fillSelect($('f-meter'), 'Select…', equipment.meters, sheet && sheet.equipment.meter, true);
    fillSelect($('f-vibkit'), 'None', equipment.vibKits, sheet && sheet.equipment.vibKit, true);
    fillSelect($('f-operative'), '—', people.names, sheet && sheet.operative, false);
  }

  function fillSelect(sel, blankLabel, items, currentValue, includeOther) {
    if (!sel) return;
    sel.innerHTML = '';
    var o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = blankLabel;
    sel.appendChild(o0);
    items.forEach(function (name) {
      if (!name.trim()) return;
      var o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      sel.appendChild(o);
    });
    if (includeOther) {
      var other = document.createElement('option');
      other.value = 'Other (see notes)';
      other.textContent = 'Other (see notes)';
      sel.appendChild(other);
    }
    // keep a value saved on the sheet selectable even if removed from the registry
    if (currentValue && !Array.prototype.some.call(sel.options, function (o) { return o.value === currentValue; })) {
      var keep = document.createElement('option');
      keep.value = currentValue;
      keep.textContent = currentValue;
      sel.appendChild(keep);
    }
  }

  function renderEquipList(wrap, arr) {
    wrap.innerHTML = '';
    arr.forEach(function (name, i) {
      var el = document.createElement('div');
      el.className = 'equip-item';
      el.innerHTML =
        '<input value="' + esc(name) + '" placeholder="Name / ID, e.g. NTi XL2 — SN A2B-12345">' +
        '<button class="equip-del" title="Remove">✕</button>';
      el.querySelector('input').addEventListener('input', function (e) {
        arr[i] = e.target.value;
        saveEquipment();
      });
      el.querySelector('.equip-del').addEventListener('click', function () {
        if (!confirm('Remove "' + (arr[i] || 'this item') + '" from the list? Sheets already using it keep their saved value.')) return;
        arr.splice(i, 1);
        saveEquipment();
        renderEquipScreen();
      });
      wrap.appendChild(el);
    });
  }

  function renderEquipScreen() {
    renderEquipList($('meter-list'), equipment.meters);
    renderEquipList($('vibkit-list'), equipment.vibKits);
  }

  /* ================= Screens & tabs ================= */

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    $('screen-' + name).classList.add('active');
    window.scrollTo(0, 0);
  }

  function showTab(name) {
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    $('tab-' + name).classList.add('active');
    window.scrollTo(0, 0);
    if (name === 'map') initMap();
    if (name === 'export') renderSummary();
  }

  /* ================= Home ================= */

  function renderHome() {
    var list = $('sheet-list');
    list.innerHTML = '';
    var sorted = sheets.slice().sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
    sorted.forEach(function (s) {
      var el = document.createElement('div');
      el.className = 'sheet-card';
      var title = sheetLabel(s);
      var subs = [fmtDate(s.date)];
      if (s.operative) subs.push(s.operative);
      subs.push(s.entries.length + ' entries');
      el.innerHTML =
        '<div class="sheet-card-icon">🔊</div>' +
        '<div class="sheet-card-body">' +
          '<div class="sheet-card-title">' + esc(title) + '</div>' +
          '<div class="sheet-card-sub">' + esc(subs.join(' · ')) + '</div>' +
        '</div>' +
        '<div class="sheet-card-chev">›</div>';
      el.addEventListener('click', function () { openSheet(s.id); });
      list.appendChild(el);
    });
    $('home-empty').classList.toggle('hidden', sheets.length > 0);
  }

  function openSheet(id) {
    sheet = sheets.find(function (s) { return s.id === id; });
    if (!sheet) return;
    pendingPhotos = [];
    editingEntryId = null;
    editingOriginalPhotos = [];
    $('composer-title').textContent = 'Add Log Entry';
    $('btn-add-entry').textContent = '＋ Add entry';
    $('btn-cancel-edit').classList.add('hidden');
    writeDetailsForm();
    renderLocationList();
    renderEntries();
    renderComposerPreviews();
    updateLocationSelect();
    updateDuration();
    resetLayoutUI();
    $('sheet-title-label').textContent = sheetLabel(sheet);
    showScreen('sheet');
    showTab('details');
    if (sheet.layout && sheet.layout.blobId) loadLayoutFromStore();
  }

  /* ================= Details form ================= */

  var fieldMap = [
    ['f-project', function (s) { return s.project; }, function (s, v) { s.project = v; }],
    ['f-jobno', function (s) { return s.jobNo; }, function (s, v) { s.jobNo = v; }],
    ['f-date', function (s) { return s.date; }, function (s, v) { s.date = v; }],
    ['f-operative', function (s) { return s.operative; }, function (s, v) { s.operative = v; }],
    ['f-client', function (s) { return s.client; }, function (s, v) { s.client = v; }],
    ['f-address', function (s) { return s.address; }, function (s, v) { s.address = v; }],
    ['f-surveytype', function (s) { return s.surveyType; }, function (s, v) { s.surveyType = v; }],
    ['f-description', function (s) { return s.description; }, function (s, v) { s.description = v; }],
    ['f-wx-cond', function (s) { return s.weather.cond; }, function (s, v) { s.weather.cond = v; }],
    ['f-wx-temp', function (s) { return s.weather.temp; }, function (s, v) { s.weather.temp = v; }],
    ['f-wx-wind', function (s) { return s.weather.wind; }, function (s, v) { s.weather.wind = v; }],
    ['f-wx-winddir', function (s) { return s.weather.windDir; }, function (s, v) { s.weather.windDir = v; }],
    ['f-wx-notes', function (s) { return s.weather.notes; }, function (s, v) { s.weather.notes = v; }],
    ['f-noise-sources', function (s) { return s.noise.sources; }, function (s, v) { s.noise.sources = v; }],
    ['f-noise-residual', function (s) { return s.noise.residual; }, function (s, v) { s.noise.residual = v; }],
    ['f-meter', function (s) { return s.equipment.meter; }, function (s, v) { s.equipment.meter = v; }],
    ['f-vibkit', function (s) { return s.equipment.vibKit; }, function (s, v) { s.equipment.vibKit = v; }],
    ['f-cal-start', function (s) { return s.equipment.calStart; }, function (s, v) { s.equipment.calStart = v; }],
    ['f-cal-end', function (s) { return s.equipment.calEnd; }, function (s, v) { s.equipment.calEnd = v; }],
    ['f-equip-notes', function (s) { return s.equipment.notes; }, function (s, v) { s.equipment.notes = v; }],
    ['f-start', function (s) { return s.times.start; }, function (s, v) { s.times.start = v; }],
    ['f-finish', function (s) { return s.times.finish; }, function (s, v) { s.times.finish = v; }]
  ];

  function writeDetailsForm() {
    populateRegistrySelects();
    fieldMap.forEach(function (f) {
      var el = $(f[0]);
      if (el) el.value = f[1](sheet) || '';
    });
  }

  function readDetailsForm() {
    if (!sheet) return;
    fieldMap.forEach(function (f) {
      var el = $(f[0]);
      if (el) f[2](sheet, el.value);
    });
    $('sheet-title-label').textContent = sheetLabel(sheet);
  }

  /* ================= Weather auto-fill ================= */

  var WMO = {
    0: 'Sunny / clear', 1: 'Partly cloudy', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog / mist', 48: 'Fog / mist',
    51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle',
    61: 'Rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Rain', 67: 'Heavy rain',
    71: 'Snow', 73: 'Snow', 75: 'Snow', 77: 'Snow',
    80: 'Rain', 81: 'Rain', 82: 'Heavy rain',
    85: 'Snow', 86: 'Snow', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm'
  };

  function windDirText(deg) {
    var dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  function fetchWeather() {
    var hint = $('weather-hint');
    hint.textContent = 'Getting your position…';
    if (!navigator.geolocation) { hint.textContent = 'Geolocation not available on this device.'; return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      hint.textContent = 'Fetching live weather…';
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pos.coords.latitude +
        '&longitude=' + pos.coords.longitude +
        '&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code&wind_speed_unit=ms';
      fetch(url).then(function (r) { return r.json(); }).then(function (j) {
        var c = j.current || {};
        $('f-wx-temp').value = c.temperature_2m != null ? Math.round(c.temperature_2m * 10) / 10 : '';
        $('f-wx-wind').value = c.wind_speed_10m != null ? Math.round(c.wind_speed_10m * 10) / 10 : '';
        $('f-wx-winddir').value = c.wind_direction_10m != null ? windDirText(c.wind_direction_10m) : '';
        var cond = WMO[c.weather_code];
        if (cond) $('f-wx-cond').value = cond;
        hint.textContent = 'Live weather filled at ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' (Open-Meteo). Adjust as observed on site.';
        scheduleSave();
      }).catch(function () { hint.textContent = 'Weather service unreachable — fill in manually.'; });
    }, function () {
      hint.textContent = 'Location permission denied — fill in manually.';
    }, { enableHighAccuracy: true, timeout: 12000 });
  }

  /* ================= Map ================= */

  var map = null, markerLayer = null, satellite = false;
  var osmLayer, satLayer;

  function initMap() {
    if (!sheet) return;
    if (!map) {
      map = L.map('map', { zoomControl: true }).setView([52.5, -1.9], 6);
      osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
      });
      satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Imagery © Esri'
      });
      osmLayer.addTo(map);
      markerLayer = L.layerGroup().addTo(map);
      map.on('click', function (e) { addLocation(e.latlng.lat, e.latlng.lng); });
    }
    setTimeout(function () { map.invalidateSize(); }, 60);
    drawMarkers();
    var pts = sheet.locations
      .filter(function (l) { return l.lat != null && l.lng != null; })
      .map(function (l) { return [l.lat, l.lng]; });
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3));
  }

  function googleMapsUrl(lat, lng) {
    // satellite view centred on the point
    return 'https://www.google.com/maps/@' + lat.toFixed(6) + ',' + lng.toFixed(6) + ',150m/data=!3m1!1e3';
  }

  /** Open an external URL reliably from a home-screen web app.
      window.open() is often blocked in iOS standalone mode, so click a
      real anchor instead — this also lets iOS route Google Maps links
      to the installed Google Maps app. */
  function openExternal(url) {
    var a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); }, 100);
  }

  function popupHtml(loc) {
    return '<div class="gridref-popup">' +
      '<div class="gr">' + esc(loc.name) + '</div>' +
      (loc.gridRef ? 'OS Grid: <b>' + esc(loc.gridRef) + '</b><br>' : '') +
      'Lat: ' + loc.lat.toFixed(5) + '<br>Lng: ' + loc.lng.toFixed(5) + '<br>' +
      '<a href="' + googleMapsUrl(loc.lat, loc.lng) + '" target="_blank" rel="noopener">Open in Google Maps ↗</a>' +
      '</div>';
  }

  /** Parse "51.4545, -2.5879"-style text (as copied from Google Maps). */
  function parseLatLng(str) {
    var m = String(str || '').match(/(-?\d{1,2}\.\d+)[,;\s]+(-?\d{1,3}\.\d+)/);
    if (!m) return null;
    var lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat: lat, lng: lng };
  }

  function drawMarkers() {
    if (!markerLayer) return;
    markerLayer.clearLayers();
    sheet.locations.forEach(function (loc, i) {
      if (loc.lat == null || loc.lng == null) return; // plan-only position
      var m = L.marker([loc.lat, loc.lng], { draggable: true }).addTo(markerLayer);
      m.bindPopup(popupHtml(loc));
      m.on('dragend', function () {
        var p = m.getLatLng();
        loc.lat = p.lat; loc.lng = p.lng;
        loc.gridRef = GridRef.wgs84ToOSGrid(p.lat, p.lng);
        m.setPopupContent(popupHtml(loc));
        renderLocationList();
        persist();
      });
    });
  }

  function addLocation(lat, lng) {
    var loc = {
      id: uid(),
      name: 'Position ' + (sheet.locations.length + 1),
      lat: lat, lng: lng,
      gridRef: GridRef.wgs84ToOSGrid(lat, lng),
      params: ''
    };
    sheet.locations.push(loc);
    drawMarkers();
    renderLocationList();
    updateLocationSelect();
    persist();
    toast('Added ' + loc.name + (loc.gridRef ? ' — ' + loc.gridRef : ''));
  }

  function locationCoordsText(loc) {
    var bits = [];
    if (loc.gridRef) bits.push('OS ' + loc.gridRef);
    if (loc.lat != null && loc.lng != null) bits.push(loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5));
    if (loc.plan) bits.push('Site plan — page ' + loc.plan.page);
    return bits.join(' · ') || 'No position set';
  }

  function renderLocationListInto(wrap) {
    wrap.innerHTML = '';
    sheet.locations.forEach(function (loc, idx) {
      var el = document.createElement('div');
      el.className = 'location-item';
      var gLink = (loc.lat != null && loc.lng != null)
        ? '<a class="location-google" href="' + googleMapsUrl(loc.lat, loc.lng) + '" target="_blank" rel="noopener" title="Open in Google Maps satellite">G↗</a>'
        : '';
      el.innerHTML =
        '<div class="location-pin"><span class="pos-badge">' + (idx + 1) + '</span></div>' +
        '<div class="location-body">' +
          '<input class="location-name" value="' + esc(loc.name) + '" placeholder="Position name">' +
          '<div class="location-coords">' + esc(locationCoordsText(loc)) + ' ' + gLink + '</div>' +
          '<textarea class="location-params" rows="1" placeholder="Parameters… e.g. façade 1 m, tripod 1.5 m, LAeq 15-min">' + esc(loc.params) + '</textarea>' +
        '</div>' +
        '<button class="location-del">✕</button>';
      el.querySelector('.location-name').addEventListener('input', function (e) {
        loc.name = e.target.value; updateLocationSelect(); drawMarkers(); redrawMarkup(); scheduleSave();
      });
      el.querySelector('.location-params').addEventListener('input', function (e) {
        loc.params = e.target.value; scheduleSave();
      });
      el.querySelector('.location-del').addEventListener('click', function () {
        if (!confirm('Remove ' + loc.name + '?')) return;
        sheet.locations = sheet.locations.filter(function (l) { return l.id !== loc.id; });
        drawMarkers(); renderLocationList(); updateLocationSelect(); redrawMarkup(); persist();
      });
      wrap.appendChild(el);
    });
  }

  function renderLocationList() {
    renderLocationListInto($('location-list'));
    var lw = $('layout-location-list');
    if (lw) renderLocationListInto(lw);
    var has = sheet.locations.length > 0;
    $('location-empty').classList.toggle('hidden', has);
    var le = $('layout-location-empty');
    if (le) le.classList.toggle('hidden', has);
  }

  function mapSearch() {
    var q = $('map-search').value.trim();
    if (!q) return;
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.length) { toast('No results for “' + q + '”'); return; }
        map.setView([+res[0].lat, +res[0].lon], 17);
      })
      .catch(function () { toast('Search unavailable offline'); });
  }

  function locateMe() {
    if (!navigator.geolocation) { toast('Geolocation not available'); return; }
    toast('Locating…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      map.setView([pos.coords.latitude, pos.coords.longitude], 18);
      toast('Tap the map to drop a survey position');
    }, function () { toast('Location permission denied'); }, { enableHighAccuracy: true, timeout: 12000 });
  }

  /** Point the embedded Google satellite frame at the current map view. */
  function syncGooglePreview() {
    var frame = $('gpreview');
    if (!frame || $('gpreview-wrap').classList.contains('hidden')) return;
    var c = map ? map.getCenter() : { lat: 52.5, lng: -1.9 };
    var z = map ? Math.min(20, map.getZoom() + 1) : 17;
    frame.src = 'https://maps.google.com/maps?q=' + c.lat.toFixed(6) + ',' + c.lng.toFixed(6) +
      '&t=k&z=' + z + '&output=embed';
  }

  /* ================= Log ================= */

  function updateDuration() {
    clearInterval(durationTimer);
    function tick() {
      var s = $('f-start').value, f = $('f-finish').value;
      var line = $('duration-line');
      if (!s) { line.textContent = 'Duration: —'; return; }
      var start = new Date(s);
      var end = f ? new Date(f) : new Date();
      var ms = end - start;
      if (ms < 0) { line.textContent = 'Duration: —'; return; }
      var h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), sec = Math.floor(ms % 60000 / 1000);
      line.textContent = (f ? 'Duration: ' : 'Running: ') +
        String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    }
    tick();
    if ($('f-start').value && !$('f-finish').value) durationTimer = setInterval(tick, 1000);
  }

  function updateLocationSelect() {
    var sel = $('e-location');
    var cur = sel.value;
    sel.innerHTML = '<option value="">—</option>';
    sheet.locations.forEach(function (l) {
      var o = document.createElement('option');
      o.value = l.id; o.textContent = l.name;
      sel.appendChild(o);
    });
    sel.value = cur;
  }

  /** Downscale an image file to max 1600 px JPEG and store it in IndexedDB. */
  function ingestPhoto(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var MAX = 1600;
        var scale = Math.min(1, MAX / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) {
          if (!blob) { reject(new Error('encode failed')); return; }
          var id = 'photo_' + uid();
          Store.putBlob(id, blob).then(function () { resolve(id); }, reject);
        }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('cannot read image')); };
      img.src = url;
    });
  }

  function renderComposerPreviews() {
    var strip = $('e-photo-previews');
    strip.innerHTML = '';
    pendingPhotos.forEach(function (id) {
      appendThumb(strip, id, function () {
        pendingPhotos = pendingPhotos.filter(function (p) { return p !== id; });
        // keep the blob if it belongs to the entry being edited (cleanup happens on save)
        if (editingOriginalPhotos.indexOf(id) === -1) Store.deleteBlob(id);
        renderComposerPreviews();
      });
    });
    $('e-photo-count').textContent = pendingPhotos.length ? pendingPhotos.length + ' photo' + (pendingPhotos.length > 1 ? 's' : '') : '';
  }

  function appendThumb(container, photoId, onLongPressDelete) {
    var img = document.createElement('img');
    img.className = 'photo-thumb';
    img.alt = 'Photo';
    Store.getBlob(photoId).then(function (blob) {
      if (blob) img.src = URL.createObjectURL(blob);
    });
    img.addEventListener('click', function () {
      Store.getBlob(photoId).then(function (blob) {
        if (!blob) return;
        currentPhotoId = photoId;
        closePhotoEditor();
        $('photo-modal-img').src = URL.createObjectURL(blob);
        $('photo-modal').classList.remove('hidden');
      });
    });
    if (onLongPressDelete) {
      var timer;
      img.addEventListener('touchstart', function () { timer = setTimeout(function () { if (confirm('Remove this photo?')) onLongPressDelete(); }, 650); }, { passive: true });
      img.addEventListener('touchend', function () { clearTimeout(timer); }, { passive: true });
      img.addEventListener('contextmenu', function (e) { e.preventDefault(); if (confirm('Remove this photo?')) onLongPressDelete(); });
    }
    container.appendChild(img);
  }

  function addEntry() {
    var text = $('e-text').value.trim();
    if (!text && !pendingPhotos.length) { toast('Type a note or attach a photo first'); return; }

    if (editingEntryId) {
      var en = sheet.entries.find(function (x) { return x.id === editingEntryId; });
      if (en) {
        en.text = text;
        en.meterFile = $('e-file').value.trim();
        en.locationId = $('e-location').value;
        var newIds = pendingPhotos.slice();
        // delete blobs of photos removed from the entry
        en.photoIds.forEach(function (p) { if (newIds.indexOf(p) === -1) Store.deleteBlob(p); });
        en.photoIds = newIds;
      }
      exitEditMode(false);
      renderEntries();
      persist();
      toast('Entry updated');
      return;
    }

    var entry = {
      id: uid(),
      ts: new Date().toISOString(),
      text: text,
      meterFile: $('e-file').value.trim(),
      locationId: $('e-location').value,
      photoIds: pendingPhotos.slice()
    };
    sheet.entries.push(entry);
    pendingPhotos = [];
    $('e-text').value = '';
    // keep meter file + location selected — often the next samples share them
    renderComposerPreviews();
    renderEntries();
    persist();
    toast('Entry logged at ' + fmtTime(entry.ts));
  }

  function exitEditMode(discardNewPhotos) {
    if (discardNewPhotos) {
      // remove blobs added during an abandoned edit
      pendingPhotos.forEach(function (p) {
        if (editingOriginalPhotos.indexOf(p) === -1) Store.deleteBlob(p);
      });
    }
    editingEntryId = null;
    editingOriginalPhotos = [];
    pendingPhotos = [];
    $('e-text').value = '';
    renderComposerPreviews();
    $('composer-title').textContent = 'Add Log Entry';
    $('btn-add-entry').textContent = '＋ Add entry';
    $('btn-cancel-edit').classList.add('hidden');
  }

  function locationName(id) {
    var l = sheet.locations.find(function (x) { return x.id === id; });
    return l ? l.name : '';
  }

  function renderEntries() {
    var list = $('entry-list');
    list.innerHTML = '';
    var sorted = sheet.entries.slice().sort(function (a, b) { return b.ts.localeCompare(a.ts); });
    sorted.forEach(function (en) {
      var el = document.createElement('div');
      el.className = 'entry-item';
      var head = document.createElement('div');
      head.className = 'entry-head';
      head.innerHTML = '<span class="entry-time">' + fmtTime(en.ts) + '</span>';
      if (en.meterFile) head.innerHTML += '<span class="entry-chip">File ' + esc(en.meterFile) + '</span>';
      var ln = locationName(en.locationId);
      if (ln) head.innerHTML += '<span class="entry-chip loc">' + esc(ln) + '</span>';
      var actions = document.createElement('span');
      actions.className = 'entry-actions';
      actions.innerHTML = '<button title="Edit">✎</button><button title="Delete">🗑</button>';
      actions.children[0].addEventListener('click', function () { editEntry(en); });
      actions.children[1].addEventListener('click', function () {
        if (!confirm('Delete this entry?')) return;
        if (editingEntryId === en.id) exitEditMode(false);
        en.photoIds.forEach(function (p) { Store.deleteBlob(p); });
        sheet.entries = sheet.entries.filter(function (x) { return x.id !== en.id; });
        renderEntries(); persist();
      });
      head.appendChild(actions);
      el.appendChild(head);
      if (en.text) {
        var p = document.createElement('p');
        p.className = 'entry-text';
        p.textContent = en.text;
        el.appendChild(p);
      }
      if (en.photoIds.length) {
        var strip = document.createElement('div');
        strip.className = 'entry-photos';
        en.photoIds.forEach(function (pid) { appendThumb(strip, pid); });
        el.appendChild(strip);
      }
      list.appendChild(el);
    });
    $('entry-count').textContent = sheet.entries.length || '';
    $('entry-empty').classList.toggle('hidden', sheet.entries.length > 0);
  }

  function editEntry(en) {
    if (editingEntryId && editingEntryId !== en.id) exitEditMode(true);
    editingEntryId = en.id;
    editingOriginalPhotos = en.photoIds.slice();
    pendingPhotos = en.photoIds.slice();
    $('e-text').value = en.text || '';
    $('e-file').value = en.meterFile || '';
    $('e-location').value = en.locationId || '';
    renderComposerPreviews();
    $('composer-title').textContent = 'Edit Entry — logged ' + fmtTime(en.ts);
    $('btn-add-entry').textContent = '✓ Save changes';
    $('btn-cancel-edit').classList.remove('hidden');
    $('composer-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ================= Layout markup ================= */

  var layoutState = {
    pdfDoc: null, img: null, page: 1, numPages: 1,
    tool: 'position', color: '#e11d48', drawing: false, current: null,
    zoom: 1
  };

  /** Zoom the layout view (1 = fit width, up to 6x), keeping the anchor
      point (e.g. pinch midpoint) fixed on screen. */
  function applyLayoutZoom(z, anchorClientX, anchorClientY) {
    var wrap = $('layout-canvas-wrap');
    var base = $('layout-canvas-base');
    var draw = $('layout-canvas-draw');
    z = Math.min(6, Math.max(1, z));
    var rect = wrap.getBoundingClientRect();
    var ax = anchorClientX != null ? anchorClientX - rect.left : wrap.clientWidth / 2;
    var ay = anchorClientY != null ? anchorClientY - rect.top : wrap.clientHeight / 2;
    var prev = layoutState.zoom;
    var contentX = (wrap.scrollLeft + ax) / prev;
    var contentY = (wrap.scrollTop + ay) / prev;
    layoutState.zoom = z;
    base.style.width = (z * 100) + '%';
    draw.style.width = (z * 100) + '%';
    wrap.scrollLeft = contentX * z - ax;
    wrap.scrollTop = contentY * z - ay;
    var lbl = $('zoom-label');
    if (lbl) lbl.textContent = Math.round(z * 100) + '%';
  }

  function resetLayoutUI() {
    layoutState.pdfDoc = null; layoutState.img = null; layoutState.page = 1; layoutState.numPages = 1;
    $('layout-editor').classList.add('hidden');
    $('layout-empty').classList.remove('hidden');
  }

  function loadLayoutFile(file) {
    var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    layoutState.zoom = 1;
    var blobId = 'layout_' + sheet.id;
    Store.putBlob(blobId, file).then(function () {
      sheet.layout = { blobId: blobId, isPdf: isPdf, name: file.name, pages: {} };
      persist();
      return openLayout(file, isPdf);
    }).then(function () {
      toast('Layout loaded — draw with your finger');
    }).catch(function (e) {
      toast('Could not load file: ' + e.message);
    });
  }

  function loadLayoutFromStore() {
    Store.getBlob(sheet.layout.blobId).then(function (blob) {
      if (blob) return openLayout(blob, sheet.layout.isPdf);
      resetLayoutUI();
    }).catch(function () { resetLayoutUI(); });
  }

  function openLayout(blob, isPdf) {
    $('layout-empty').classList.add('hidden');
    $('layout-editor').classList.remove('hidden');
    if (isPdf) {
      if (typeof pdfjsLib === 'undefined') return Promise.reject(new Error('PDF library offline'));
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
      return blob.arrayBuffer().then(function (buf) {
        return pdfjsLib.getDocument({ data: buf }).promise;
      }).then(function (doc) {
        layoutState.pdfDoc = doc;
        layoutState.img = null;
        layoutState.numPages = doc.numPages;
        layoutState.page = 1;
        return renderLayoutPage();
      });
    }
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        layoutState.img = img;
        layoutState.pdfDoc = null;
        layoutState.numPages = 1;
        layoutState.page = 1;
        renderLayoutPage().then(resolve, reject);
      };
      img.onerror = function () { reject(new Error('bad image')); };
      img.src = URL.createObjectURL(blob);
    });
  }

  function renderLayoutPage() {
    var base = $('layout-canvas-base');
    var draw = $('layout-canvas-draw');
    var TARGET_W = 1500;
    var done;

    $('page-label').textContent = 'Page ' + layoutState.page + ' / ' + layoutState.numPages;
    $('page-nav').style.display = layoutState.numPages > 1 ? 'flex' : 'none';

    if (layoutState.pdfDoc) {
      done = layoutState.pdfDoc.getPage(layoutState.page).then(function (page) {
        var v1 = page.getViewport({ scale: 1 });
        var scale = TARGET_W / v1.width;
        var vp = page.getViewport({ scale: scale });
        base.width = vp.width; base.height = vp.height;
        return page.render({ canvasContext: base.getContext('2d'), viewport: vp }).promise;
      });
    } else if (layoutState.img) {
      var img = layoutState.img;
      var scale = Math.min(1.5, TARGET_W / img.width);
      base.width = Math.round(img.width * scale);
      base.height = Math.round(img.height * scale);
      base.getContext('2d').drawImage(img, 0, 0, base.width, base.height);
      done = Promise.resolve();
    } else {
      return Promise.resolve();
    }

    return done.then(function () {
      draw.width = base.width;
      draw.height = base.height;
      applyLayoutZoom(layoutState.zoom);
      redrawMarkup();
    });
  }

  function pageShapes() {
    var p = String(layoutState.page);
    if (!sheet.layout.pages[p]) sheet.layout.pages[p] = [];
    return sheet.layout.pages[p];
  }

  function redrawMarkup(ctx2) {
    if (!sheet || !sheet.layout || !sheet.layout.blobId) return;
    var draw = $('layout-canvas-draw');
    if (!draw.width) return;
    var ctx = ctx2 || draw.getContext('2d');
    if (!ctx2) ctx.clearRect(0, 0, draw.width, draw.height);
    var W = draw.width, Hh = draw.height;
    pageShapes().forEach(function (sh) { drawShape(ctx, sh, W, Hh); });
    drawPlanPositions(ctx, W, Hh, layoutState.page);
  }

  /** Numbered position markers dropped on the plan (like map pins). */
  function drawPlanPositions(ctx, W, Hh, pageNo) {
    sheet.locations.forEach(function (loc, i) {
      if (!loc.plan || loc.plan.page !== pageNo) return;
      var x = loc.plan.x * W, y = loc.plan.y * Hh;
      var r = Math.max(18, W * 0.028);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = '#8f1c13';
      ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold ' + Math.round(r * 1.05) + 'px -apple-system, Helvetica, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, y + r * 0.06);
      if (loc.name) {
        ctx.font = 'bold ' + Math.round(r * 0.72) + 'px -apple-system, Helvetica, Arial';
        ctx.textAlign = 'left';
        ctx.lineWidth = Math.max(3, r * 0.28);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText(loc.name, x + r * 1.35, y);
        ctx.fillStyle = '#2a1a16';
        ctx.fillText(loc.name, x + r * 1.35, y);
      }
      ctx.restore();
    });
  }

  function drawShape(ctx, sh, W, Hh) {
    ctx.save();
    if (sh.type === 'text') {
      ctx.fillStyle = sh.color;
      ctx.font = 'bold ' + Math.round(W * 0.022) + 'px -apple-system, Helvetica, Arial';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 4;
      ctx.strokeText(sh.text, sh.x * W, sh.y * Hh);
      ctx.fillText(sh.text, sh.x * W, sh.y * Hh);
    } else {
      ctx.strokeStyle = sh.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (sh.type === 'highlight') {
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = W * 0.012;
      } else {
        ctx.lineWidth = W * 0.0035;
      }
      ctx.beginPath();
      sh.pts.forEach(function (pt, i) {
        var x = pt[0] * W, y = pt[1] * Hh;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  function canvasPoint(e) {
    var draw = $('layout-canvas-draw');
    var r = draw.getBoundingClientRect();
    var cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    var cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return [cx / r.width, cy / r.height];
  }

  function bindMarkupCanvas() {
    var draw = $('layout-canvas-draw');
    var wrap = $('layout-canvas-wrap');

    // Gesture model:
    //  - two fingers anywhere: pinch to zoom / pan (never adds anything)
    //  - 📍 or 🅰 tool: a clean TAP places; dragging one finger PANS the plan
    //  - pen/highlighter: one finger draws; a second finger cancels the stroke
    var pointers = new Map();
    var pinch = null;   // {startDist, startZoom, midX, midY}
    var tap = null;     // {startX, startY, moved, scrollL, scrollT}
    var TAP_SLOP = 10;  // px of movement before a tap becomes a pan

    function pointerXY(e) { return { x: e.clientX, y: e.clientY }; }
    function pinchDist(pts) {
      var dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      return Math.sqrt(dx * dx + dy * dy) || 1;
    }
    function pinchMid(pts) {
      return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }

    function cancelStroke() {
      if (layoutState.drawing) {
        layoutState.drawing = false;
        layoutState.current = null;
        redrawMarkup();
      }
      tap = null;
    }

    function placeAt(pt) {
      if (layoutState.tool === 'position') {
        var loc = {
          id: uid(),
          name: 'Position ' + (sheet.locations.length + 1),
          params: '',
          plan: { page: layoutState.page, x: pt[0], y: pt[1] }
        };
        sheet.locations.push(loc);
        renderLocationList();
        updateLocationSelect();
        redrawMarkup();
        persist();
        toast('Added ' + loc.name + ' — name it below, link it to log entries');
      } else if (layoutState.tool === 'text') {
        var txt = prompt('Label text (e.g. "P1 — meter position"):');
        if (txt && txt.trim()) {
          pageShapes().push({ type: 'text', text: txt.trim(), x: pt[0], y: pt[1], color: layoutState.color });
          redrawMarkup();
          persist();
        }
      }
    }

    function down(e) {
      if (!sheet || !sheet.layout.blobId) return;
      pointers.set(e.pointerId, pointerXY(e));
      if (pointers.size === 2) {
        // second finger: switch to pinch, abandon tap/stroke
        cancelStroke();
        var pts = Array.from(pointers.values());
        var mid = pinchMid(pts);
        pinch = { startDist: pinchDist(pts), startZoom: layoutState.zoom, midX: mid.x, midY: mid.y };
        e.preventDefault();
        return;
      }
      if (pointers.size > 2) return;
      e.preventDefault();
      if (layoutState.tool === 'position' || layoutState.tool === 'text') {
        tap = { startX: e.clientX, startY: e.clientY, moved: false, scrollL: wrap.scrollLeft, scrollT: wrap.scrollTop };
        return;
      }
      layoutState.drawing = true;
      layoutState.current = { type: layoutState.tool, color: layoutState.color, pts: [canvasPoint(e)] };
    }

    function move(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, pointerXY(e));
      if (pinch && pointers.size >= 2) {
        e.preventDefault();
        var pts = Array.from(pointers.values());
        var mid = pinchMid(pts);
        applyLayoutZoom(pinch.startZoom * pinchDist(pts) / pinch.startDist, mid.x, mid.y);
        // two-finger pan: follow the midpoint
        wrap.scrollLeft -= mid.x - pinch.midX;
        wrap.scrollTop -= mid.y - pinch.midY;
        pinch.midX = mid.x;
        pinch.midY = mid.y;
        return;
      }
      if (tap) {
        e.preventDefault();
        var dx = e.clientX - tap.startX, dy = e.clientY - tap.startY;
        if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) tap.moved = true;
        if (tap.moved) { // one-finger pan with the place tools
          wrap.scrollLeft = tap.scrollL - dx;
          wrap.scrollTop = tap.scrollT - dy;
        }
        return;
      }
      if (layoutState.drawing) {
        e.preventDefault();
        layoutState.current.pts.push(canvasPoint(e));
        redrawMarkup();
        drawShape(draw.getContext('2d'), layoutState.current, draw.width, draw.height);
      }
    }

    function up(e) {
      var had = pointers.delete(e.pointerId);
      if (pinch && pointers.size < 2) pinch = null;
      if (tap && had && pointers.size === 0) {
        if (!tap.moved) placeAt(canvasPoint(e));
        tap = null;
        return;
      }
      if (layoutState.drawing && pointers.size === 0) {
        layoutState.drawing = false;
        if (layoutState.current && layoutState.current.pts.length > 1) {
          pageShapes().push(layoutState.current);
          persist();
        }
        layoutState.current = null;
        redrawMarkup();
      }
    }

    draw.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    $('btn-zoom-in').addEventListener('click', function () { applyLayoutZoom(layoutState.zoom * 1.4); });
    $('btn-zoom-out').addEventListener('click', function () { applyLayoutZoom(layoutState.zoom / 1.4); });
    $('btn-zoom-fit').addEventListener('click', function () {
      applyLayoutZoom(1);
      wrap.scrollLeft = 0;
      wrap.scrollTop = 0;
    });
  }

  /** Composite base + markup of every page/image into JPEG data URLs (for exports). */
  function layoutComposites() {
    if (!sheet.layout || !sheet.layout.blobId) return Promise.resolve([]);
    return Store.getBlob(sheet.layout.blobId).then(function (blob) {
      if (!blob) return [];
      var results = [];
      if (sheet.layout.isPdf && typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
        return blob.arrayBuffer().then(function (buf) {
          return pdfjsLib.getDocument({ data: buf }).promise;
        }).then(function (doc) {
          var chain = Promise.resolve();
          for (var p = 1; p <= doc.numPages; p++) {
            (function (pageNo) {
              chain = chain.then(function () {
                return doc.getPage(pageNo).then(function (page) {
                  var v1 = page.getViewport({ scale: 1 });
                  var vp = page.getViewport({ scale: 1400 / v1.width });
                  var c = document.createElement('canvas');
                  c.width = vp.width; c.height = vp.height;
                  var ctx = c.getContext('2d');
                  ctx.fillStyle = '#fff';
                  ctx.fillRect(0, 0, c.width, c.height);
                  return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
                    (sheet.layout.pages[String(pageNo)] || []).forEach(function (sh) { drawShape(ctx, sh, c.width, c.height); });
                    drawPlanPositions(ctx, c.width, c.height, pageNo);
                    results.push({ page: pageNo, dataUrl: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height });
                  });
                });
              });
            })(p);
          }
          return chain.then(function () { return results; });
        });
      }
      // image layout
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1.5, 1400 / img.width);
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          var ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, c.width, c.height);
          (sheet.layout.pages['1'] || []).forEach(function (sh) { drawShape(ctx, sh, c.width, c.height); });
          drawPlanPositions(ctx, c.width, c.height, 1);
          resolve([{ page: 1, dataUrl: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height }]);
        };
        img.onerror = function () { resolve([]); };
        img.src = URL.createObjectURL(blob);
      });
    });
  }

  /* ================= Photo editor ================= */

  var currentPhotoId = null;
  var photoEdit = { img: null, shapes: [], color: '#e11d48', textMode: false, drawing: false, current: null };

  function openPhotoEditor() {
    if (!currentPhotoId) return;
    Store.getBlob(currentPhotoId).then(function (blob) {
      if (!blob) return;
      var img = new Image();
      img.onload = function () {
        photoEdit.img = img;
        photoEdit.shapes = [];
        photoEdit.textMode = false;
        var c = $('photo-edit-canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        redrawPhotoEditor();
        $('photo-modal-img').classList.add('hidden');
        c.classList.remove('hidden');
        $('photo-edit-bar').classList.remove('hidden');
        $('btn-photo-edit').classList.add('hidden');
        $('btn-photo-text').classList.remove('active');
      };
      img.src = URL.createObjectURL(blob);
    });
  }

  function closePhotoEditor() {
    photoEdit.img = null;
    photoEdit.shapes = [];
    photoEdit.drawing = false;
    $('photo-edit-canvas').classList.add('hidden');
    $('photo-edit-bar').classList.add('hidden');
    $('photo-modal-img').classList.remove('hidden');
    $('btn-photo-edit').classList.remove('hidden');
  }

  function redrawPhotoEditor() {
    var c = $('photo-edit-canvas');
    var ctx = c.getContext('2d');
    if (!photoEdit.img) return;
    ctx.drawImage(photoEdit.img, 0, 0, c.width, c.height);
    photoEdit.shapes.forEach(function (sh) { drawShape(ctx, sh, c.width, c.height); });
  }

  function photoCanvasPoint(e) {
    var c = $('photo-edit-canvas');
    var r = c.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  function bindPhotoEditor() {
    var c = $('photo-edit-canvas');

    c.addEventListener('pointerdown', function (e) {
      if (!photoEdit.img) return;
      e.preventDefault();
      var pt = photoCanvasPoint(e);
      if (photoEdit.textMode) {
        var txt = prompt('Note text (e.g. "HGV access point"):');
        if (txt && txt.trim()) {
          photoEdit.shapes.push({ type: 'text', text: txt.trim(), x: pt[0], y: pt[1], color: photoEdit.color });
          redrawPhotoEditor();
        }
        photoEdit.textMode = false;
        $('btn-photo-text').classList.remove('active');
        return;
      }
      photoEdit.drawing = true;
      photoEdit.current = { type: 'pen', color: photoEdit.color, pts: [pt] };
    });
    c.addEventListener('pointermove', function (e) {
      if (!photoEdit.drawing) return;
      e.preventDefault();
      photoEdit.current.pts.push(photoCanvasPoint(e));
      redrawPhotoEditor();
      drawShape(c.getContext('2d'), photoEdit.current, c.width, c.height);
    });
    window.addEventListener('pointerup', function () {
      if (!photoEdit.drawing) return;
      photoEdit.drawing = false;
      if (photoEdit.current.pts.length > 1) photoEdit.shapes.push(photoEdit.current);
      photoEdit.current = null;
      redrawPhotoEditor();
    });

    $('btn-photo-edit').addEventListener('click', openPhotoEditor);
    $('btn-photo-text').addEventListener('click', function () {
      photoEdit.textMode = !photoEdit.textMode;
      this.classList.toggle('active', photoEdit.textMode);
      if (photoEdit.textMode) toast('Tap the photo where the note should go');
    });
    $('btn-photo-undo').addEventListener('click', function () {
      photoEdit.shapes.pop();
      redrawPhotoEditor();
    });
    document.querySelectorAll('.pcolor-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.pcolor-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        photoEdit.color = b.dataset.color;
      });
    });
    $('btn-photo-save').addEventListener('click', function () {
      if (!photoEdit.img || !currentPhotoId) return;
      redrawPhotoEditor();
      $('photo-edit-canvas').toBlob(function (blob) {
        if (!blob) { toast('Could not save photo'); return; }
        Store.putBlob(currentPhotoId, blob).then(function () {
          closePhotoEditor();
          $('photo-modal').classList.add('hidden');
          renderEntries();
          renderComposerPreviews();
          toast('Photo saved with notes');
        });
      }, 'image/jpeg', 0.85);
    });
  }

  /* ================= Export ================= */

  function collectAssets() {
    // photo data URLs keyed by id, plus layout composites
    var ids = [];
    sheet.entries.forEach(function (en) { ids = ids.concat(en.photoIds); });
    var photos = {};
    var photoJobs = ids.map(function (id) {
      return Store.getBlob(id).then(function (blob) {
        if (!blob) return;
        return Store.blobToDataURL(blob).then(function (durl) {
          return new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () { photos[id] = { dataUrl: durl, w: img.width, h: img.height }; resolve(); };
            img.onerror = function () { resolve(); };
            img.src = durl;
          });
        });
      });
    });
    return Promise.all(photoJobs).then(function () {
      return layoutComposites().then(function (layouts) {
        return { photos: photos, layouts: layouts };
      });
    });
  }

  function withAssets(fn, statusMsg) {
    readDetailsForm();
    persist();
    var st = $('export-status');
    st.textContent = statusMsg || 'Preparing export…';
    collectAssets().then(function (assets) {
      return fn(sheet, assets);
    }).then(function (msg) {
      st.textContent = msg || 'Done.';
    }).catch(function (e) {
      console.error(e);
      st.textContent = 'Export failed: ' + e.message;
      toast('Export failed — ' + e.message);
    });
  }

  function renderSummary() {
    readDetailsForm();
    var s = sheet;
    var dur = '—';
    if (s.times.start && s.times.finish) {
      var ms = new Date(s.times.finish) - new Date(s.times.start);
      if (ms > 0) dur = Math.floor(ms / 3600000) + 'h ' + Math.floor(ms % 3600000 / 60000) + 'm';
    }
    var photoCount = s.entries.reduce(function (n, e) { return n + e.photoIds.length; }, 0);
    $('export-summary').innerHTML =
      '<b>' + esc(sheetLabel(s)) + '</b><br>' +
      esc(fmtDate(s.date)) + ' · ' + esc(s.operative || 'operative not set') + '<br>' +
      'Survey: ' + esc(s.surveyType || '—') + '<br>' +
      'Meter: ' + esc(s.equipment.meter || '—') + ' · Vibration: ' + esc(s.equipment.vibKit || '—') + '<br>' +
      'Duration: ' + dur + '<br>' +
      s.locations.length + ' survey location(s) · ' + s.entries.length + ' log entries · ' + photoCount + ' photos' +
      (s.layout.blobId ? '<br>Layout: ' + esc(s.layout.name) : '');
  }

  /* ================= Wire-up ================= */

  function bindEvents() {
    $('btn-new-sheet').addEventListener('click', function () {
      var s = newSheet();
      sheets.push(s);
      persist();
      openSheet(s.id);
    });

    $('btn-settings').addEventListener('click', function () {
      updateThemeLabel();
      updateOperativeLabel();
      showScreen('settings');
    });
    $('btn-settings-back').addEventListener('click', function () { showScreen('home'); });
    $('btn-theme').addEventListener('click', cycleTheme);
    $('btn-operatives').addEventListener('click', function () {
      renderOperativesScreen();
      showScreen('operatives');
    });
    $('btn-operatives-back').addEventListener('click', function () { showScreen('settings'); });
    $('btn-add-operative').addEventListener('click', function () {
      people.names.push('');
      savePeople();
      renderOperativesScreen();
      var inputs = document.querySelectorAll('#operative-list .op-name');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    $('btn-equipment').addEventListener('click', function () {
      renderEquipScreen();
      showScreen('equipment');
    });
    $('btn-equip-back').addEventListener('click', function () {
      showScreen('settings');
    });
    $('btn-about').addEventListener('click', function () {
      renderChangelog();
      showScreen('about');
    });
    $('btn-about-back').addEventListener('click', function () {
      showScreen('settings');
    });
    $('btn-check-update').addEventListener('click', function () {
      toast('Checking for updates…');
      checkForUpdates(true);
    });
    $('btn-add-meter').addEventListener('click', function () {
      equipment.meters.push('');
      saveEquipment();
      renderEquipScreen();
      var inputs = document.querySelectorAll('#meter-list input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    $('btn-add-vibkit').addEventListener('click', function () {
      equipment.vibKits.push('');
      saveEquipment();
      renderEquipScreen();
      var inputs = document.querySelectorAll('#vibkit-list input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

    $('btn-back').addEventListener('click', function () {
      readDetailsForm();
      persist();
      renderHome();
      showScreen('home');
    });

    $('btn-delete-sheet').addEventListener('click', function () {
      if (!confirm('Delete this whole sheet? This cannot be undone.')) return;
      sheet.entries.forEach(function (en) { en.photoIds.forEach(function (p) { Store.deleteBlob(p); }); });
      if (sheet.layout.blobId) Store.deleteBlob(sheet.layout.blobId);
      sheets = sheets.filter(function (s) { return s.id !== sheet.id; });
      Store.saveSheets(sheets);
      sheet = null;
      renderHome();
      showScreen('home');
    });

    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.dataset.tab); });
    });

    // autosave on any details input
    document.querySelectorAll('#tab-details input, #tab-details select, #tab-details textarea').forEach(function (el) {
      el.addEventListener('input', scheduleSave);
    });

    $('btn-fetch-weather').addEventListener('click', fetchWeather);

    // map
    $('btn-map-search').addEventListener('click', mapSearch);
    $('map-search').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); mapSearch(); } });
    $('btn-locate').addEventListener('click', locateMe);
    $('btn-layer').addEventListener('click', function () {
      satellite = !satellite;
      if (satellite) { map.removeLayer(osmLayer); satLayer.addTo(map); }
      else { map.removeLayer(satLayer); osmLayer.addTo(map); }
    });
    $('btn-google-maps').addEventListener('click', function () {
      var c = map ? map.getCenter() : { lat: 52.5, lng: -1.9 };
      openExternal(googleMapsUrl(c.lat, c.lng));
    });
    $('btn-gpreview').addEventListener('click', function () {
      var wrap = $('gpreview-wrap');
      var showing = !wrap.classList.contains('hidden');
      if (showing) {
        wrap.classList.add('hidden');
        $('gpreview').src = 'about:blank';
        this.textContent = 'Show';
      } else {
        wrap.classList.remove('hidden');
        syncGooglePreview();
        this.textContent = 'Hide';
      }
    });
    $('btn-gpreview-sync').addEventListener('click', syncGooglePreview);
    $('btn-coord-add').addEventListener('click', function () {
      var parsed = parseLatLng($('coord-input').value);
      if (!parsed) {
        toast('Could not read coordinates — paste them as "51.4545, -2.5879"');
        return;
      }
      addLocation(parsed.lat, parsed.lng);
      $('coord-input').value = '';
      if (map) map.setView([parsed.lat, parsed.lng], Math.max(map.getZoom(), 17));
    });
    $('coord-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('btn-coord-add').click(); }
    });

    // log
    $('btn-start-now').addEventListener('click', function () {
      $('f-start').value = nowLocalInput();
      scheduleSave(); updateDuration();
      toast('Monitoring started');
    });
    $('btn-finish-now').addEventListener('click', function () {
      $('f-finish').value = nowLocalInput();
      scheduleSave(); updateDuration();
      toast('Monitoring finished');
    });
    $('f-start').addEventListener('input', function () { scheduleSave(); updateDuration(); });
    $('f-finish').addEventListener('input', function () { scheduleSave(); updateDuration(); });

    $('e-photo').addEventListener('change', function (e) {
      var files = Array.from(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      toast('Adding photo…');
      var chain = Promise.resolve();
      files.forEach(function (f) {
        chain = chain.then(function () {
          return ingestPhoto(f).then(function (id) {
            pendingPhotos.push(id);
            renderComposerPreviews();
          });
        });
      });
      chain.catch(function () { toast('Could not read one of the photos'); });
    });

    $('btn-add-entry').addEventListener('click', addEntry);
    $('btn-cancel-edit').addEventListener('click', function () {
      exitEditMode(true);
      toast('Edit cancelled');
    });

    // layout
    $('layout-file').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) loadLayoutFile(f);
    });
    document.querySelectorAll('.markup-toolbar .tool-btn[data-tool]').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.tool-btn[data-tool]').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        layoutState.tool = b.dataset.tool;
      });
    });
    document.querySelectorAll('.color-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.color-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        layoutState.color = b.dataset.color;
      });
    });
    $('btn-undo').addEventListener('click', function () {
      pageShapes().pop();
      redrawMarkup();
      persist();
    });
    $('btn-clear-markup').addEventListener('click', function () {
      if (!confirm('Clear all markup on this page?')) return;
      sheet.layout.pages[String(layoutState.page)] = [];
      redrawMarkup();
      persist();
    });
    $('btn-prev-page').addEventListener('click', function () {
      if (layoutState.page > 1) { layoutState.page--; renderLayoutPage(); }
    });
    $('btn-next-page').addEventListener('click', function () {
      if (layoutState.page < layoutState.numPages) { layoutState.page++; renderLayoutPage(); }
    });
    bindMarkupCanvas();

    // export
    $('btn-export-pdf').addEventListener('click', function () {
      withAssets(function (s, a) { return Exporter.toPDF(s, a, { download: true }); }, 'Building PDF…');
    });
    $('btn-export-email').addEventListener('click', function () {
      withAssets(function (s, a) { return Exporter.shareByEmail(s, a); }, 'Building PDF for sharing…');
    });
    $('btn-export-word').addEventListener('click', function () {
      withAssets(function (s, a) { return Exporter.toWord(s, a); }, 'Building Word document…');
    });
    $('btn-export-excel').addEventListener('click', function () {
      withAssets(function (s, a) { return Exporter.toExcel(s, a); }, 'Building spreadsheet…');
    });

    // photo modal / editor
    $('photo-modal-close').addEventListener('click', function () {
      closePhotoEditor();
      $('photo-modal').classList.add('hidden');
    });
    $('photo-modal').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) {
        closePhotoEditor();
        e.currentTarget.classList.add('hidden');
      }
    });
    bindPhotoEditor();
  }

  /* ================= Boot ================= */

  function boot() {
    bindEvents();
    renderHome();
    $('app-version').textContent = 'v' + APP.version;
    updateThemeLabel();
    updateOperativeLabel();
    if ('serviceWorker' in navigator) {
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js')
        .then(function (reg) { if (reg.update) reg.update().catch(function () {}); })
        .catch(function () { /* offline shell optional */ });
      // when a new version of the app takes over, reload once so the
      // user sees it immediately instead of on the next launch
      var refreshed = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (refreshed || !hadController) return;
        refreshed = true;
        location.reload();
      });
      // iOS often resumes the app from memory instead of relaunching it,
      // so also check for updates whenever it returns to the foreground
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) checkForUpdates(false);
      });
    }
    setTimeout(function () { checkForUpdates(false); }, 3000);
  }

  boot();

  // expose a couple of helpers for the exporter
  window.AppHelpers = { locationName: locationName, fmtDate: fmtDate, fmtTime: fmtTime };
})();
