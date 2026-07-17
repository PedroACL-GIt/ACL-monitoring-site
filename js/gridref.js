/* WGS84 -> OSGB36 National Grid reference conversion.
   Helmert datum transform + Airy 1830 transverse Mercator projection
   (standard OS algorithm; accuracy ~5 m, ample for survey positions). */
(function (global) {
  'use strict';

  var deg2rad = Math.PI / 180;

  // Ellipsoids
  var WGS84 = { a: 6378137.000, b: 6356752.31425 };
  var AIRY  = { a: 6377563.396, b: 6356256.909 };

  // Helmert transform WGS84 -> OSGB36
  var H = {
    tx: -446.448, ty: 125.157, tz: -542.060,
    rx: -0.1502, ry: -0.2470, rz: -0.8421, // arc-seconds
    s: 20.4894e-6
  };

  function toCartesian(lat, lon, ell) {
    var phi = lat * deg2rad, lam = lon * deg2rad;
    var sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
    var e2 = 1 - (ell.b * ell.b) / (ell.a * ell.a);
    var nu = ell.a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
    return [
      nu * cosPhi * Math.cos(lam),
      nu * cosPhi * Math.sin(lam),
      nu * (1 - e2) * sinPhi
    ];
  }

  function helmert(p) {
    var rx = H.rx / 3600 * deg2rad, ry = H.ry / 3600 * deg2rad, rz = H.rz / 3600 * deg2rad;
    var s1 = 1 + H.s;
    return [
      H.tx + s1 * (p[0] - rz * p[1] + ry * p[2]),
      H.ty + s1 * (rz * p[0] + p[1] - rx * p[2]),
      H.tz + s1 * (-ry * p[0] + rx * p[1] + p[2])
    ];
  }

  function toLatLon(p, ell) {
    var x = p[0], y = p[1], z = p[2];
    var e2 = 1 - (ell.b * ell.b) / (ell.a * ell.a);
    var pr = Math.sqrt(x * x + y * y);
    var phi = Math.atan2(z, pr * (1 - e2)), phiP;
    for (var i = 0; i < 10; i++) {
      var sinPhi = Math.sin(phi);
      var nu = ell.a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
      phiP = phi;
      phi = Math.atan2(z + e2 * nu * sinPhi, pr);
      if (Math.abs(phi - phiP) < 1e-12) break;
    }
    return { lat: phi / deg2rad, lon: Math.atan2(y, x) / deg2rad };
  }

  // OSGB36 lat/lon -> National Grid easting/northing (Airy 1830 TM)
  function latLonToEN(lat, lon) {
    var phi = lat * deg2rad, lam = lon * deg2rad;
    var a = AIRY.a, b = AIRY.b;
    var F0 = 0.9996012717;
    var phi0 = 49 * deg2rad, lam0 = -2 * deg2rad;
    var N0 = -100000, E0 = 400000;
    var e2 = 1 - (b * b) / (a * a);
    var n = (a - b) / (a + b), n2 = n * n, n3 = n * n * n;

    var cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
    var nu = a * F0 / Math.sqrt(1 - e2 * sinPhi * sinPhi);
    var rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
    var eta2 = nu / rho - 1;

    var Ma = (1 + n + (5 / 4) * n2 + (5 / 4) * n3) * (phi - phi0);
    var Mb = (3 * n + 3 * n2 + (21 / 8) * n3) * Math.sin(phi - phi0) * Math.cos(phi + phi0);
    var Mc = ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * (phi - phi0)) * Math.cos(2 * (phi + phi0));
    var Md = (35 / 24) * n3 * Math.sin(3 * (phi - phi0)) * Math.cos(3 * (phi + phi0));
    var M = b * F0 * (Ma - Mb + Mc - Md);

    var cos3 = cosPhi * cosPhi * cosPhi, cos5 = cos3 * cosPhi * cosPhi;
    var tan2 = Math.tan(phi) * Math.tan(phi), tan4 = tan2 * tan2;

    var I = M + N0;
    var II = (nu / 2) * sinPhi * cosPhi;
    var III = (nu / 24) * sinPhi * cos3 * (5 - tan2 + 9 * eta2);
    var IIIA = (nu / 720) * sinPhi * cos5 * (61 - 58 * tan2 + tan4);
    var IV = nu * cosPhi;
    var V = (nu / 6) * cos3 * (nu / rho - tan2);
    var VI = (nu / 120) * cos5 * (5 - 18 * tan2 + tan4 + 14 * eta2 - 58 * tan2 * eta2);

    var dLam = lam - lam0;
    var d2 = dLam * dLam, d3 = d2 * dLam, d4 = d3 * dLam, d5 = d4 * dLam, d6 = d5 * dLam;

    return {
      N: I + II * d2 + III * d4 + IIIA * d6,
      E: E0 + IV * dLam + V * d3 + VI * d5
    };
  }

  function enToGridRef(E, N, digits) {
    digits = digits || 8; // 8 digits => 10 m squares
    if (E < 0 || E >= 700000 || N < 0 || N >= 1300000) return null;
    var e100k = Math.floor(E / 100000), n100k = Math.floor(N / 100000);
    var l1 = (19 - n100k) - (19 - n100k) % 5 + Math.floor((e100k + 10) / 5);
    var l2 = (19 - n100k) * 5 % 25 + e100k % 5;
    if (l1 > 7) l1++; // skip 'I'
    if (l2 > 7) l2++;
    var letters = String.fromCharCode(l1 + 65) + String.fromCharCode(l2 + 65);
    var half = digits / 2;
    var eDig = Math.floor((E % 100000) / Math.pow(10, 5 - half));
    var nDig = Math.floor((N % 100000) / Math.pow(10, 5 - half));
    return letters + ' ' +
      String(eDig).padStart(half, '0') + ' ' +
      String(nDig).padStart(half, '0');
  }

  /** Convert WGS84 lat/lon (degrees) to an OS National Grid reference string,
      or null when outside the OS grid (e.g. abroad). */
  function wgs84ToOSGrid(lat, lon, digits) {
    if (lat < 49 || lat > 61.5 || lon < -9 || lon > 2.5) return null;
    var osgb = toLatLon(helmert(toCartesian(lat, lon, WGS84)), AIRY);
    var en = latLonToEN(osgb.lat, osgb.lon);
    return enToGridRef(en.E, en.N, digits);
  }

  global.GridRef = { wgs84ToOSGrid: wgs84ToOSGrid };
})(window);
