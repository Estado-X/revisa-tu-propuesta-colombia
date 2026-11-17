/* Escritor de .zip mínimo, sin librerías: archivos sin comprimir (método 0) con CRC-32.
   Es lo que necesita un .xlsx.
   Viene de Estado-X/facturas-colombia (assets/zip.js, licencia MIT, Copyright (c) 2026 Estado X):
   https://github.com/Estado-X/facturas-colombia
   Aquí solo se conserva la parte que escribe; la que lee .zip no hace falta. */
(function (raiz) {
  'use strict';

  var TABLA_CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* archivos: [{ nombre, datos: Uint8Array | string }] → Uint8Array del .zip (sin comprimir). */
  function crear(archivos, fecha) {
    var enc = new TextEncoder();
    var f = fecha || new Date();
    var hora = (f.getHours() << 11) | (f.getMinutes() << 5) | (f.getSeconds() >> 1);
    var dia = ((f.getFullYear() - 1980) << 9) | ((f.getMonth() + 1) << 5) | f.getDate();
    var partes = [], central = [], desplazamiento = 0;
    archivos.forEach(function (a) {
      var nom = enc.encode(a.nombre);
      var datos = typeof a.datos === 'string' ? enc.encode(a.datos) : a.datos;
      var crc = crc32(datos);
      var cab = new Uint8Array(30 + nom.length);
      var v = new DataView(cab.buffer);
      v.setUint32(0, 0x04034B50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint16(8, 0, true);
      v.setUint16(10, hora, true); v.setUint16(12, dia, true); v.setUint32(14, crc, true);
      v.setUint32(18, datos.length, true); v.setUint32(22, datos.length, true);
      v.setUint16(26, nom.length, true); v.setUint16(28, 0, true);
      cab.set(nom, 30);
      var cen = new Uint8Array(46 + nom.length);
      var w = new DataView(cen.buffer);
      w.setUint32(0, 0x02014B50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x800, true);
      w.setUint16(10, 0, true); w.setUint16(12, hora, true); w.setUint16(14, dia, true); w.setUint32(16, crc, true);
      w.setUint32(20, datos.length, true); w.setUint32(24, datos.length, true); w.setUint16(28, nom.length, true);
      w.setUint32(42, desplazamiento, true);
      cen.set(nom, 46);
      partes.push(cab, datos); central.push(cen);
      desplazamiento += cab.length + datos.length;
    });
    var tamCentral = central.reduce(function (s, c) { return s + c.length; }, 0);
    var fin = new Uint8Array(22);
    var x = new DataView(fin.buffer);
    x.setUint32(0, 0x06054B50, true); x.setUint16(8, archivos.length, true); x.setUint16(10, archivos.length, true);
    x.setUint32(12, tamCentral, true); x.setUint32(16, desplazamiento, true);
    var todo = partes.concat(central, [fin]);
    var largo = todo.reduce(function (s, c) { return s + c.length; }, 0);
    var out = new Uint8Array(largo), o = 0;
    todo.forEach(function (c) { out.set(c, o); o += c.length; });
    return out;
  }

  var Zip = { crear: crear, crc32: crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = Zip;
  else raiz.Zip = Zip;
})(this);
