/* Export: PDF report (jsPDF), Word (.doc), Excel (.xls), email/share. */
(function (global) {
  'use strict';

  var M = 14;          // page margin, mm
  var PW = 210, PH = 297;

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtDT(v) {
    if (!v) return '—';
    var d = new Date(v);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function durationText(s) {
    if (!s.times.start || !s.times.finish) return '—';
    var ms = new Date(s.times.finish) - new Date(s.times.start);
    if (ms <= 0) return '—';
    return Math.floor(ms / 3600000) + 'h ' + Math.floor(ms % 3600000 / 60000) + 'm';
  }
  function locName(s, id) {
    var l = s.locations.find(function (x) { return x.id === id; });
    return l ? l.name : '';
  }
  function fileStem(s) {
    var base = (s.project || 'noise-monitoring').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
    return (base || 'noise-monitoring') + '_' + (s.date || 'sheet');
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  /* ---------------- PDF ---------------- */

  function buildPDF(s, assets) {
    if (!global.jspdf || !global.jspdf.jsPDF) throw new Error('PDF library not loaded — reload the app once online.');
    var jsPDF = global.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4' });
    var y = 0;

    function ensureSpace(h) {
      if (y + h > PH - M) { doc.addPage(); y = M; }
    }

    function heading(txt) {
      ensureSpace(14);
      doc.setFillColor(10, 37, 64);
      doc.rect(M, y, PW - 2 * M, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text(txt, M + 3, y + 5.6);
      doc.setTextColor(30, 40, 50);
      y += 12;
    }

    function kvRows(rows) {
      doc.setFontSize(9.5);
      rows.forEach(function (r) {
        if (r[1] == null || r[1] === '') r[1] = '—';
        var label = r[0], val = String(r[1]);
        var lines = doc.splitTextToSize(val, PW - 2 * M - 52);
        ensureSpace(lines.length * 4.8 + 2.2);
        doc.setFont('helvetica', 'bold');
        doc.text(label, M + 1, y + 4);
        doc.setFont('helvetica', 'normal');
        doc.text(lines, M + 52, y + 4);
        y += lines.length * 4.8 + 2.2;
      });
      y += 2;
    }

    // Title band
    doc.setFillColor(10, 37, 64);
    doc.rect(0, 0, PW, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('NOISE MONITORING SHEET', M, 13);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.text((s.project || 'Untitled survey') + (s.jobNo ? '   ·   Job ' + s.jobNo : ''), M, 21);
    doc.setTextColor(30, 40, 50);
    y = 38;

    heading('SURVEY DETAILS');
    kvRows([
      ['Date', fmtDate(s.date)],
      ['Operative', s.operative],
      ['Client', s.client],
      ['Address / location', s.address],
      ['Survey type', s.surveyType],
      ['Description', s.description]
    ]);

    heading('WEATHER CONDITIONS');
    kvRows([
      ['Conditions', s.weather.cond],
      ['Temperature', s.weather.temp !== '' ? s.weather.temp + ' °C' : ''],
      ['Wind', (s.weather.wind !== '' ? s.weather.wind + ' m/s ' : '') + (s.weather.windDir || '')],
      ['Weather notes', s.weather.notes]
    ]);

    heading('EQUIPMENT');
    kvRows([
      ['Noise meter', s.equipment.meter],
      ['Vibration kit', s.equipment.vibKit],
      ['Cal. check start', s.equipment.calStart ? s.equipment.calStart + ' dB' : ''],
      ['Cal. check end', s.equipment.calEnd ? s.equipment.calEnd + ' dB' : ''],
      ['Equipment notes', s.equipment.notes]
    ]);

    heading('MONITORING PERIOD');
    kvRows([
      ['Start', fmtDT(s.times.start)],
      ['Finish', fmtDT(s.times.finish)],
      ['Duration', durationText(s)]
    ]);

    if (s.locations.length) {
      heading('SURVEY LOCATIONS');
      doc.setFontSize(8.6);
      var cols = [M + 1, M + 34, M + 72, M + 112];
      ensureSpace(7);
      doc.setFont('helvetica', 'bold');
      doc.text('Position', cols[0], y + 4);
      doc.text('OS Grid Ref', cols[1], y + 4);
      doc.text('Lat / Lng', cols[2], y + 4);
      doc.text('Parameters', cols[3], y + 4);
      y += 6.5;
      doc.setDrawColor(200);
      doc.line(M, y, PW - M, y);
      y += 1.5;
      doc.setFont('helvetica', 'normal');
      s.locations.forEach(function (l) {
        var params = doc.splitTextToSize(l.params || '—', PW - M - cols[3] - 2);
        var name = doc.splitTextToSize(l.name || '—', cols[1] - cols[0] - 3);
        var rowH = Math.max(params.length, name.length) * 4.3 + 2.5;
        ensureSpace(rowH);
        doc.text(name, cols[0], y + 4);
        doc.text(l.gridRef || '—', cols[1], y + 4);
        doc.text(l.lat.toFixed(5) + ', ' + l.lng.toFixed(5), cols[2], y + 4);
        doc.text(params, cols[3], y + 4);
        y += rowH;
      });
      y += 3;
    }

    if (s.entries.length) {
      heading('MONITORING LOG');
      var sorted = s.entries.slice().sort(function (a, b) { return a.ts.localeCompare(b.ts); });
      sorted.forEach(function (en) {
        doc.setFontSize(9.5);
        var meta = fmtTime(en.ts);
        if (en.meterFile) meta += '   ·   Meter file: ' + en.meterFile;
        var ln = locName(s, en.locationId);
        if (ln) meta += '   ·   ' + ln;
        var textLines = en.text ? doc.splitTextToSize(en.text, PW - 2 * M - 4) : [];
        ensureSpace(8 + textLines.length * 4.6);
        doc.setFillColor(224, 242, 247);
        doc.rect(M, y, PW - 2 * M, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.text(meta, M + 2, y + 4.2);
        y += 8;
        if (textLines.length) {
          doc.setFont('helvetica', 'normal');
          doc.text(textLines, M + 2, y + 3);
          y += textLines.length * 4.6 + 2;
        }
        // photos, two per row
        var pw = (PW - 2 * M - 6) / 2;
        var x = M;
        var rowH = 0;
        en.photoIds.forEach(function (pid) {
          var ph = assets.photos[pid];
          if (!ph) return;
          var h = pw * ph.h / ph.w;
          if (h > 110) { h = 110; }
          var w = Math.min(pw, h * ph.w / ph.h);
          if (x + w > PW - M) { x = M; y += rowH + 3; rowH = 0; }
          ensureSpace(h + 4);
          try { doc.addImage(ph.dataUrl, 'JPEG', x, y, w, h); } catch (e) { /* skip bad image */ }
          x += w + 6;
          rowH = Math.max(rowH, h);
        });
        if (rowH) { y += rowH + 3; x = M; }
        y += 2;
      });
    }

    (assets.layouts || []).forEach(function (lay) {
      doc.addPage();
      y = M;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(10, 37, 64);
      doc.text('SITE LAYOUT' + (assets.layouts.length > 1 ? ' — PAGE ' + lay.page : '') +
        (s.layout.name ? '  (' + s.layout.name + ')' : ''), M, y + 4);
      doc.setTextColor(30, 40, 50);
      y += 10;
      var availW = PW - 2 * M, availH = PH - y - M;
      var scale = Math.min(availW / lay.w, availH / lay.h);
      try {
        doc.addImage(lay.dataUrl, 'JPEG', M, y, lay.w * scale, lay.h * scale);
      } catch (e) { /* skip */ }
    });

    // footer with page numbers
    var pages = doc.getNumberOfPages();
    for (var i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5);
      doc.setTextColor(130);
      doc.text('ACL Noise Monitoring — generated ' + new Date().toLocaleString('en-GB') +
        '   ·   Page ' + i + ' of ' + pages, M, PH - 6);
    }
    return doc;
  }

  function toPDF(s, assets, opts) {
    var doc = buildPDF(s, assets);
    var name = fileStem(s) + '.pdf';
    if (opts && opts.blob) return Promise.resolve({ blob: doc.output('blob'), name: name });
    doc.save(name);
    return Promise.resolve('PDF saved: ' + name);
  }

  function shareByEmail(s, assets) {
    return toPDF(s, assets, { blob: true }).then(function (out) {
      var file = new File([out.blob], out.name, { type: 'application/pdf' });
      var subject = 'Noise monitoring sheet — ' + (s.project || 'survey') + (s.jobNo ? ' (' + s.jobNo + ')' : '');
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({
          files: [file],
          title: subject,
          text: 'Noise monitoring sheet for ' + (s.project || 'site') + ', ' + fmtDate(s.date) + '.'
        }).then(function () { return 'Shared.'; })
          .catch(function (e) {
            if (e && e.name === 'AbortError') return 'Share cancelled.';
            throw e;
          });
      }
      // fallback: download the PDF and open a pre-filled email
      downloadBlob(out.blob, out.name);
      var body = 'Please find attached the noise monitoring sheet.\n\n' +
        'Project: ' + (s.project || '—') + '\nJob: ' + (s.jobNo || '—') +
        '\nDate: ' + fmtDate(s.date) + '\nOperative: ' + (s.operative || '—') +
        '\n\n(The PDF has been downloaded — attach it to this email.)';
      location.href = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      return 'PDF downloaded — attach it to the email that just opened.';
    });
  }

  /* ---------------- Word (.doc) ---------------- */

  function toWord(s, assets) {
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">' +
      '<head><meta charset="utf-8"><title>Noise Monitoring Sheet</title>' +
      '<style>' +
      'body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1c2733}' +
      'h1{background:#0a2540;color:#fff;padding:10px 12px;font-size:15pt}' +
      'h2{color:#0a2540;border-bottom:2px solid #0a2540;padding-bottom:3px;font-size:12pt;margin-top:22px}' +
      'table{border-collapse:collapse;width:100%;margin:8px 0}' +
      'td,th{border:1px solid #c6ced6;padding:5px 8px;font-size:10pt;vertical-align:top}' +
      'th{background:#e0f2f7;text-align:left}' +
      '.lbl{font-weight:bold;width:32%;background:#f2f4f7}' +
      'img{max-width:320px;margin:4px}' +
      '</style></head><body>';

    html += '<h1>NOISE MONITORING SHEET</h1>';
    html += '<p><b>' + esc(s.project || 'Untitled survey') + '</b>' + (s.jobNo ? ' — Job ' + esc(s.jobNo) : '') + '</p>';

    function kvTable(rows) {
      var t = '<table>';
      rows.forEach(function (r) {
        t += '<tr><td class="lbl">' + esc(r[0]) + '</td><td>' + (esc(r[1]) || '—').replace(/\n/g, '<br>') + '</td></tr>';
      });
      return t + '</table>';
    }

    html += '<h2>Survey Details</h2>' + kvTable([
      ['Date', fmtDate(s.date)], ['Operative', s.operative], ['Client', s.client],
      ['Address / location', s.address], ['Survey type', s.surveyType], ['Description', s.description]
    ]);
    html += '<h2>Weather Conditions</h2>' + kvTable([
      ['Conditions', s.weather.cond],
      ['Temperature', s.weather.temp !== '' ? s.weather.temp + ' °C' : ''],
      ['Wind', (s.weather.wind !== '' ? s.weather.wind + ' m/s ' : '') + (s.weather.windDir || '')],
      ['Notes', s.weather.notes]
    ]);
    html += '<h2>Equipment</h2>' + kvTable([
      ['Noise meter', s.equipment.meter], ['Vibration kit', s.equipment.vibKit],
      ['Calibration check start', s.equipment.calStart ? s.equipment.calStart + ' dB' : ''],
      ['Calibration check end', s.equipment.calEnd ? s.equipment.calEnd + ' dB' : ''],
      ['Notes', s.equipment.notes]
    ]);
    html += '<h2>Monitoring Period</h2>' + kvTable([
      ['Start', fmtDT(s.times.start)], ['Finish', fmtDT(s.times.finish)], ['Duration', durationText(s)]
    ]);

    if (s.locations.length) {
      html += '<h2>Survey Locations</h2><table><tr><th>Position</th><th>OS Grid Ref</th><th>Lat</th><th>Lng</th><th>Parameters</th></tr>';
      s.locations.forEach(function (l) {
        html += '<tr><td>' + esc(l.name) + '</td><td>' + esc(l.gridRef || '—') + '</td><td>' +
          l.lat.toFixed(5) + '</td><td>' + l.lng.toFixed(5) + '</td><td>' + esc(l.params || '—') + '</td></tr>';
      });
      html += '</table>';
    }

    if (s.entries.length) {
      html += '<h2>Monitoring Log</h2><table><tr><th>Time</th><th>Meter file</th><th>Location</th><th>Note</th></tr>';
      s.entries.slice().sort(function (a, b) { return a.ts.localeCompare(b.ts); }).forEach(function (en) {
        html += '<tr><td>' + fmtTime(en.ts) + '</td><td>' + esc(en.meterFile || '—') + '</td><td>' +
          esc(locName(s, en.locationId) || '—') + '</td><td>' + esc(en.text).replace(/\n/g, '<br>');
        en.photoIds.forEach(function (pid) {
          var ph = assets.photos[pid];
          if (ph) html += '<br><img src="' + ph.dataUrl + '">';
        });
        html += '</td></tr>';
      });
      html += '</table>';
    }

    (assets.layouts || []).forEach(function (lay) {
      html += '<h2>Site Layout' + (assets.layouts.length > 1 ? ' — page ' + lay.page : '') + '</h2>' +
        '<img style="max-width:100%" src="' + lay.dataUrl + '">';
    });

    html += '</body></html>';
    var blob = new Blob(['﻿' + html], { type: 'application/msword' });
    downloadBlob(blob, fileStem(s) + '.doc');
    return Promise.resolve('Word document saved.');
  }

  /* ---------------- Excel (.xls) ---------------- */

  function toExcel(s, assets) {
    function row(cells, header) {
      var tag = header ? 'th' : 'td';
      return '<tr>' + cells.map(function (c) { return '<' + tag + '>' + esc(c) + '</' + tag + '>'; }).join('') + '</tr>';
    }
    var html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">' +
      '<style>th{background:#0a2540;color:#fff;text-align:left}td,th{border:1px solid #b9c2cc;padding:4px 8px;font-family:Calibri,Arial;font-size:10pt}</style>' +
      '</head><body><table>';
    html += row(['NOISE MONITORING SHEET'], true);
    html += row(['Project', s.project]) + row(['Job number', s.jobNo]) + row(['Date', fmtDate(s.date)]) +
      row(['Operative', s.operative]) + row(['Client', s.client]) + row(['Address', s.address]) +
      row(['Survey type', s.surveyType]) + row(['Description', s.description]) +
      row(['Weather', [s.weather.cond, s.weather.temp !== '' ? s.weather.temp + ' °C' : '', s.weather.wind !== '' ? s.weather.wind + ' m/s' : '', s.weather.windDir, s.weather.notes].filter(Boolean).join(', ')]) +
      row(['Noise meter', s.equipment.meter]) + row(['Vibration kit', s.equipment.vibKit]) +
      row(['Cal. check start/end', (s.equipment.calStart || '—') + ' / ' + (s.equipment.calEnd || '—')]) +
      row(['Start', fmtDT(s.times.start)]) + row(['Finish', fmtDT(s.times.finish)]) + row(['Duration', durationText(s)]);
    html += row(['']);
    html += row(['SURVEY LOCATIONS'], true);
    html += row(['Position', 'OS Grid Ref', 'Lat', 'Lng', 'Parameters'], true);
    s.locations.forEach(function (l) {
      html += row([l.name, l.gridRef || '', l.lat.toFixed(6), l.lng.toFixed(6), l.params]);
    });
    html += row(['']);
    html += row(['MONITORING LOG'], true);
    html += row(['Date', 'Time', 'Meter file', 'Location', 'Note', 'Photos'], true);
    s.entries.slice().sort(function (a, b) { return a.ts.localeCompare(b.ts); }).forEach(function (en) {
      html += row([
        new Date(en.ts).toLocaleDateString('en-GB'),
        fmtTime(en.ts),
        en.meterFile, locName(s, en.locationId), en.text,
        en.photoIds.length ? en.photoIds.length + ' photo(s) — see PDF/Word export' : ''
      ]);
    });
    html += '</table></body></html>';
    var blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' });
    downloadBlob(blob, fileStem(s) + '.xls');
    return Promise.resolve('Spreadsheet saved.');
  }

  global.Exporter = {
    toPDF: toPDF,
    toWord: toWord,
    toExcel: toExcel,
    shareByEmail: shareByEmail
  };
})(window);
