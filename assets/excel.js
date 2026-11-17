/* Arma un .xlsx real (Office Open XML) sin librerías: unas pocas partes XML dentro de un .zip.
   Los puntajes van como números, para que Excel pueda sumar.
   Viene de Estado-X/facturas-colombia (assets/excel.js, licencia MIT, Copyright (c) 2026 Estado X):
   https://github.com/Estado-X/facturas-colombia
   Aquí se conservan el escape, las celdas y la hoja (con la protección contra fórmulas en el texto)
   y se cambia el contenido: la matriz de evaluación y la lista «Antes de enviar». */
(function (raiz) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function columna(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

  // Estilos: 0 normal · 1 encabezado · 2 texto con ajuste de línea · 3 número · 4 total (negrilla sobre crema)
  //          5 texto literal (quotePrefix) con ajuste de línea
  var ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF2EBDC"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" quotePrefix="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function celda(ref, v, estilo) {
    if (v && typeof v === 'object' && v.f) {
      return '<c r="' + ref + '" s="' + (estilo || 0) + '"><f>' + esc(v.f) + '</f>' + (v.v != null ? '<v>' + v.v + '</v>' : '') + '</c>';
    }
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + (estilo ? ' s="' + estilo + '"' : '') + '><v>' + v + '</v></c>';
    if (v === null || v === undefined || v === '') return estilo ? '<c r="' + ref + '" s="' + estilo + '"/>' : '';
    // Texto que empieza como fórmula: se marca como texto literal para que Excel nunca lo calcule.
    if (/^[=+\-@\t\r]/.test(String(v)) && estilo !== 1 && estilo !== 4) estilo = 5;
    return '<c r="' + ref + '" t="inlineStr"' + (estilo ? ' s="' + estilo + '"' : '') + '><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  /* filas: [[valor, ...]] · anchos: ancho por columna · estilosCol: estilo por columna para las filas de datos
     op: { fijar: true, estilosFila: { i: estilo } } · la primera fila siempre es el encabezado */
  function hoja(filas, anchos, estilosCol, op) {
    op = op || {};
    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    if (op.fijar) x += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    x += '<cols>' + anchos.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols><sheetData>';
    filas.forEach(function (fila, r) {
      x += '<row r="' + (r + 1) + '">';
      fila.forEach(function (v, c) {
        var est = r === 0 ? 1 : (op.estilosFila && op.estilosFila[r] != null ? op.estilosFila[r] : (estilosCol ? estilosCol[c] : 0));
        x += celda(columna(c) + (r + 1), v, est);
      });
      x += '</row>';
    });
    return x + '</sheetData></worksheet>';
  }

  var COLUMNAS = [
    ['Criterio', 38], ['Puntaje máximo', 16], ['Dónde lo cubre (sección/página)', 30], ['Evidencia', 40],
    ['Qué falta', 40], ['Puntaje estimado', 17], ['Lo que vas a cambiar', 40]
  ];
  var COL_MAXIMO = 1, COL_ESTIMADO = 5;

  /* criterios: [{ criterio, puntaje (número o null), donde, evidencia }]
     lista: [{ texto, listo }] (la lista «Antes de enviar») · devuelve el Uint8Array del .xlsx */
  function crear(criterios, lista, Zip, fechaZip) {
    Zip = Zip || raiz.Zip;
    var filas = [COLUMNAS.map(function (c) { return c[0]; })];
    var suma = 0;
    criterios.forEach(function (c) {
      var p = typeof c.puntaje === 'number' && isFinite(c.puntaje) ? c.puntaje : '';
      if (p !== '') suma += p;
      filas.push([c.criterio || '', p, c.donde || '', c.evidencia || '', '', '', '']);
    });
    var estilosFila = {};
    if (criterios.length) {
      var ultima = criterios.length + 1;
      var total = ['Total', '', '', '', '', '', ''];
      var M = columna(COL_MAXIMO), E = columna(COL_ESTIMADO);
      total[COL_MAXIMO] = { f: 'SUM(' + M + '2:' + M + ultima + ')', v: Math.round(suma * 100) / 100 };
      total[COL_ESTIMADO] = { f: 'SUM(' + E + '2:' + E + ultima + ')', v: 0 };
      estilosFila[filas.length] = 4;
      filas.push(total);
    }
    var estilosCol = COLUMNAS.map(function (c, i) { return i === COL_MAXIMO || i === COL_ESTIMADO ? 3 : 2; });
    var h1 = hoja(filas, COLUMNAS.map(function (c) { return c[1]; }), estilosCol, { fijar: true, estilosFila: estilosFila });

    var antes = [['Antes de enviar', '¿Listo?']];
    (lista || []).forEach(function (i) { antes.push([i.texto, i.listo ? 'Sí' : '']); });
    var h2 = hoja(antes, [90, 12], [2, 2]);

    var archivos = [
      { nombre: '[Content_Types].xml', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>' },
      { nombre: '_rels/.rels', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>' },
      { nombre: 'xl/workbook.xml', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Matriz" sheetId="1" r:id="rId1"/><sheet name="Antes de enviar" sheetId="2" r:id="rId2"/></sheets>' +
        '<calcPr fullCalcOnLoad="1"/>' +
        '</workbook>' },
      { nombre: 'xl/_rels/workbook.xml.rels', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>' },
      { nombre: 'xl/worksheets/sheet1.xml', datos: h1 },
      { nombre: 'xl/worksheets/sheet2.xml', datos: h2 },
      { nombre: 'xl/styles.xml', datos: ESTILOS }
    ];
    return Zip.crear(archivos, fechaZip);
  }

  var Excel = { crear: crear, columna: columna, COLUMNAS: COLUMNAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Excel;
  else raiz.Excel = Excel;
})(this);
