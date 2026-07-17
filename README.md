# ACL Noise Monitoring

A web-based, iPhone-friendly **noise & vibration monitoring sheet** app. Built as a static
site (no backend) so it runs straight from GitHub Pages and can be added to the iOS home
screen as an app (Share → *Add to Home Screen*).

## Features

- **Monitoring sheets** — project, job number, date, operative, client, address,
  survey type and description. Multiple sheets stored on the device (works offline).
- **Weather conditions** — manual entry plus one-tap **auto-fill** from your GPS
  position using live Open-Meteo data (conditions, temperature, wind speed/direction).
- **Map & survey locations** — tap the map to drop measurement positions; each shows
  its **OS National Grid reference** and lat/lng (like gridreferencefinder.com).
  Address search, GPS locate, and satellite imagery toggle included. Markers are
  draggable to fine-tune positions.
- **Equipment** — noise meter (NTi XL2 1–3, XL3 1–3) and vibration kit (1–3) pickers,
  calibration check values. The lists are placeholders — edit `index.html` to load your
  company's real kit.
- **Start / finish** — one-tap *Start now* / *Finish now* with live running duration.
- **Live log** — add notes on the fly; the time is stamped automatically. Each entry can
  carry a **meter file number** (for multi-file short-sample surveys), a survey location,
  and **photos** taken with the camera (e.g. "HGV entered site").
- **Site layout markup** — load a PDF or image of the site layout and mark it up with
  pen, highlighter and text labels (multi-page PDFs supported).
- **Export** — one-tap **PDF report** (details, weather, equipment, locations with grid
  refs, full timestamped log with photos, marked-up layout pages), **Email/share** via
  the iOS share sheet, **Word (.doc)** and **Excel (.xls)**.

## Running it

It's a static site — host the repo with GitHub Pages (Settings → Pages → deploy from
branch) and open the URL in Safari on the iPhone, then *Add to Home Screen*.

For local testing: `python3 -m http.server` in the repo folder and open
`http://localhost:8000`.

## Storage & privacy

Everything is stored **on the device** (localStorage + IndexedDB). Nothing is uploaded
anywhere; the only network calls are map tiles (OpenStreetMap/Esri), address search
(Nominatim) and weather (Open-Meteo). Clearing Safari website data deletes the sheets —
export anything you need to keep.

## Stack

Plain HTML/CSS/JS (no build step) + [Leaflet](https://leafletjs.com) for the map,
[jsPDF](https://github.com/parallax/jsPDF) for PDF export and
[pdf.js](https://mozilla.github.io/pdf.js/) for layout rendering, all from CDNs and
cached by a service worker for offline use.
