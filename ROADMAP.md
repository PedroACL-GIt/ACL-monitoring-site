# Roadmap — ACL Noise Monitoring

Possible future changes, with an assessment of feasibility and effort.
Status as of app **v1.10.0** (2026-07-19). This is a planning note, not a
commitment — items are picked up when decided.

Legend: ✅ done · 🔧 feasible, self-contained · ⚠️ needs company IT / Microsoft 365

---

## ✅ Already implemented

### Fully exportable to Word / Excel
Exports to **PDF, Word, Excel and email** all exist today (since v1.0.0).

- *Caveat:* the Word (`.doc`) and Excel (`.xls`) files are **HTML-based** — they
  open correctly in Word and Excel with all data, tables and photos, but are
  not "true" native `.docx`/`.xlsx` files. Indistinguishable for everyday use;
  only relevant to the Word-templates item below.

### Pictures can be added
Photos on log entries (camera or library), on-the-fly photo annotation
(draw + text notes), and site-layout PDF/image upload with tap-to-add
measurement positions and markup. All flow through to the exports.

### Offline working where possible
Full offline PWA. Works with no signal: sheets, live log, photos, GPS
positions, OS grid references, layout markup, and PDF/Word/Excel export.
Only map imagery, address search and weather auto-fill need a connection,
and each fails gracefully. This is already at the practical limit for a
phone app.

---

## 🔧 Feasible and self-contained (no IT dependency)

### Word templates for auto-reporting  — recommended next
Upload the company's Word report template containing placeholders
(e.g. `{{jobNumber}}`, `{{operative}}`, `{{noiseSources}}`, a photo table),
and the app fills it in and produces a finished, branded `.docx` ready to
issue.

- **Value:** high — turns the app from data-capture into a report generator.
- **Effort:** medium. Replace the current HTML-Word export with a real
  `.docx` template engine; agree a placeholder convention with the template
  owner.
- **Works offline, on-device. No SharePoint or sign-in required.**
- **This is the recommended first upgrade** — biggest payoff, fully
  standalone.

---

## ⚠️ Needs company IT / Microsoft 365 (SharePoint)

These change the app's nature: it is currently 100% standalone with **no
logins**. All three require Microsoft sign-in and IT approval, and they
remove the "works for anyone, shareable with a friend" simplicity.

### Auto-save to SharePoint
Completed sheets/reports upload automatically to a SharePoint folder. Would
also solve backup centrally (data no longer only on the phone).

- **Effort:** highest on this list — mostly auth + IT coordination, not code.
- Would be "save locally offline, sync when back online", not instant.

### Linked to calibration / validation details on SharePoint
Equipment register pulls live cal details (cal date, expiry, certificate
link) from a SharePoint list instead of being typed in.

- Rides on the same connection as auto-save.

### Shared requirements & catches for all SharePoint items
- **Microsoft sign-in** in the app (Microsoft Graph API + Azure/Entra app
  registration). **Your IT admin must approve** — cannot be enabled from the
  app side alone.
- Every user signs in with their ACL Microsoft account; the app stops being
  usable by anyone outside the company.
- Auto-save depends on connectivity (offline-first sync).

---

## Suggested order

1. **Word templates** — highest value, self-contained, stays offline, no IT
   dependency.
2. **SharePoint auto-save** — solves backup centrally; foundation for #3.
3. **SharePoint cal details** — nice-to-have that rides on the #2 connection.

## Available today as a stopgap for backup
**Settings → Back up all data** exports every sheet, photo, layout and the
equipment/operatives lists to a single file (save to Files/iCloud, email, or
AirDrop to another device). **Settings → Restore backup** brings it all back.
This covers the data-safety need until (or unless) SharePoint auto-save is
built.
