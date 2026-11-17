/* Revisa tu propuesta · Estado X
   La parte que piensa, sin tocar la página: leer los criterios pegados, sumar los puntajes
   y armar el texto para llevar a una IA. Todo pasa en el navegador. */
(function (raiz) {
  'use strict';

  var NUM = '(\\d{1,4}(?:[.,]\\d{1,2})?)';
  var UNIDAD = '(?:puntos?|ptos?\\.?|pts?\\.?|%)';
  var ANTES = '(?:(?:hasta|m[aá]ximo|m[aá]x\\.?)\\s+)?';
  var TOPE = 1000; // un número más grande casi nunca es un puntaje (suele ser un año o un valor)

  var RE_CELDA_NUM = new RegExp('^[(\\[]?\\s*' + ANTES + NUM + '\\s*' + UNIDAD + '?\\s*[)\\]]?$', 'i');
  var RE_CON_UNIDAD = new RegExp('[(\\[]?\\s*' + ANTES + NUM + '\\s*(' + UNIDAD + ')(?![a-záéíóúñ])\\s*[)\\]]?', 'i');
  var RE_AL_FINAL = new RegExp('^(.*[a-záéíóúñ)\\]].*?)[\\s:.\\-–—…(\\[]+' + NUM + '\\s*[)\\]]?\\.?$', 'i');
  var RE_NUMERACION = /^\(?(?:\d{1,2}(?:\.\d{1,2})*|[a-z]|[ivxl]{1,4})[.)]\s+|^\d{1,2}(?:\.\d{1,2})+\s+(?=[a-záéíóúñ])/i;
  // «Total», «Total puntos», «Puntaje total», «Puntaje máximo total», «Suma»…
  var RE_TOTAL = /^(?:(?:puntaje|puntos)\s+)?(?:m[aá]ximo\s+)?(?:total|sumatoria|suma)\b|^(?:gran|puntaje|puntos|m[aá]ximo|suma)\b.*\btotal$/i;

  function aNumero(s) {
    if (typeof s === 'number') return isFinite(s) ? s : null;
    var t = String(s == null ? '' : s).trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(t)) return null;
    return parseFloat(t);
  }

  function fmt(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n);
  }

  function limpiarNombre(s) {
    var t = String(s).replace(/\.{3,}|…+|_{3,}/g, ' ').replace(/[(\[]\s*[)\]]/g, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(RE_NUMERACION, '');
    var antes;
    do {
      antes = t;
      t = t.replace(/[\s:;,.\-–—(\[]+$/, '').replace(/^[\s:;,.\-–—)\]]+/, '');
      t = t.replace(/\s(?:hasta|m[aá]ximo|m[aá]x\.?|puntaje(?:\s+m[aá]ximo)?)$/i, '');
    } while (t !== antes);
    return t;
  }

  function esEncabezado(t) {
    return !/\d/.test(t) &&
      /\b(?:puntajes?|puntos|ponderaci[oó]n|peso|calificaci[oó]n|valor)\b/i.test(t) &&
      /\b(?:criterios?|aspectos?|factor(?:es)?|[ií]tems?|descripci[oó]n|componentes?)\b/i.test(t);
  }

  function deTexto(t) {
    // Se miran todas las cifras con unidad. Manda la última que diga «puntos»; un «%» solo vale
    // como puntaje si no hay ninguna con puntos y va entre paréntesis o al final de la línea
    // (así «al menos el 20% del valor total: 10 puntos» conserva su 20% y puntúa 10).
    var re = new RegExp(RE_CON_UNIDAD.source, 'gi');
    var m, conPuntos = null, conPorcentaje = null;
    while ((m = re.exec(t)) !== null) {
      var p = aNumero(m[1]);
      if (p === null || p > TOPE) continue;
      if (m[2] === '%') {
        var trozo = m[0].trim();
        var entreParentesis = /^[(\[]/.test(trozo) && /[)\]]$/.test(trozo);
        var alFinal = /^[\s.;,:]*$/.test(t.slice(m.index + m[0].length));
        if (entreParentesis || alFinal) conPorcentaje = m;
      } else {
        conPuntos = m;
      }
    }
    m = conPuntos || conPorcentaje;
    if (m) return { criterio: limpiarNombre(t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)), puntaje: aNumero(m[1]) };
    var sinNum = t.replace(RE_NUMERACION, '');
    m = RE_AL_FINAL.exec(sinNum);
    if (m) {
      var q = aNumero(m[2]);
      if (q !== null && q <= TOPE) return { criterio: limpiarNombre(m[1]), puntaje: q };
    }
    return { criterio: limpiarNombre(t), puntaje: null };
  }

  /* Una línea → { criterio, puntaje } · { total } · null (línea vacía o encabezado) */
  function parsearLinea(linea) {
    var t = String(linea).split(String.fromCharCode(160)).join(' ').replace(/^[\s•·▪■□◦●○*>\-–—]+(?=\S)/, '').trim();
    if (!t || !/[a-záéíóúñ]/i.test(t)) return null;
    if (esEncabezado(t)) return null;
    var celdas = t.split(/\t+|\s*\|\s*|\s{3,}/).map(function (c) { return c.trim(); }).filter(Boolean);
    var r;
    if (celdas.length > 1) {
      var textos = [], puntaje = null;
      celdas.forEach(function (c) {
        var m = RE_CELDA_NUM.exec(c);
        if (m) { var p = aNumero(m[1]); if (p !== null && p <= TOPE) { puntaje = p; return; } }
        if (/[a-záéíóúñ]/i.test(c)) textos.push(c);
      });
      if (!textos.length) return null;
      r = puntaje === null ? deTexto(textos.join(' · ')) : { criterio: limpiarNombre(textos.join(' · ')), puntaje: puntaje };
    } else {
      r = deTexto(t);
    }
    if (!r.criterio) return null;
    if (RE_TOTAL.test(r.criterio)) return { total: r.puntaje };
    return r;
  }

  /* Texto pegado → { criterios: [{ criterio, puntaje }], totalDeclarado } */
  function parsear(texto) {
    var criterios = [], totalDeclarado = null;
    String(texto == null ? '' : texto).split(/\r\n|\r|\n/).forEach(function (linea) {
      var r = parsearLinea(linea);
      if (!r) return;
      if ('total' in r) { if (r.total !== null) totalDeclarado = r.total; return; }
      criterios.push(r);
    });
    return { criterios: criterios, totalDeclarado: totalDeclarado };
  }

  function sumar(criterios) {
    var s = 0;
    criterios.forEach(function (c) { if (typeof c.puntaje === 'number' && isFinite(c.puntaje)) s += c.puntaje; });
    return Math.round(s * 100) / 100;
  }

  function unaLinea(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  /* El texto para llevar a una IA. criterios: [{ criterio, puntaje, donde, evidencia }] */
  function armarPrompt(criterios) {
    var total = sumar(criterios);
    var L = [];
    L.push('Vas a leer una propuesta como la leería quien la evalúa en una convocatoria. No eres el autor ni el editor: eres quien califica.');
    L.push('');
    L.push('La propuesta va adjunta o pegada después de este mensaje. Si no la ves, pídemela antes de seguir. Si también te entrego los términos de referencia, úsalos; si no, trabaja solo con los criterios de abajo.');
    L.push('');
    L.push('CRITERIOS DE EVALUACIÓN (copiados de los términos de referencia)');
    criterios.forEach(function (c, i) {
      var p = typeof c.puntaje === 'number' && isFinite(c.puntaje);
      L.push((i + 1) + '. ' + unaLinea(c.criterio) + ' — ' + (p ? 'máximo ' + fmt(c.puntaje) + (c.puntaje === 1 ? ' punto' : ' puntos') : 'sin puntaje máximo indicado'));
      if (unaLinea(c.donde)) L.push('   Según el equipo que postula, se cubre en: ' + unaLinea(c.donde));
      if (unaLinea(c.evidencia)) L.push('   Evidencia que el equipo dice tener: ' + unaLinea(c.evidencia));
    });
    if (total > 0) L.push('Total: ' + fmt(total) + (total === 1 ? ' punto' : ' puntos'));
    L.push('');
    L.push('QUÉ TE PIDO');
    L.push('1. Recorre los criterios uno por uno, en el mismo orden. A cada uno ponle un puntaje provisional (entre 0 y su máximo) y justifícalo en dos o tres frases, citando la sección y la página de la propuesta donde está el sustento.');
    L.push('2. En cada criterio, di qué evidencia falta para sostener el puntaje máximo: datos, fuentes, anexos, cartas, cifras de línea de base, cronograma, presupuesto.');
    L.push('3. Lista las afirmaciones sin respaldo: frases de la propuesta que aseguran algo sin dato, fuente ni anexo. Cítalas tal como están escritas, con su sección y página.');
    L.push('4. Lista los requisitos habilitantes que no aparecen en lo que te entregué (formatos, firmas, anexos, certificados, límites de extensión). Si no tienes los términos de referencia, dilo y no los supongas.');
    L.push('5. Si el equipo indicó dónde se cubre un criterio y ahí no lo encuentras, dilo.');
    L.push('');
    L.push('REGLAS');
    L.push('- No reescribas la propuesta ni redactes párrafos nuevos. Solo señala.');
    L.push('- No inventes contenido, cifras, páginas ni citas. Lo que no esté en la propuesta va como «No aparece».');
    L.push('- Si no puedes ver el número de página, dilo y cita solo la sección o el título.');
    L.push('- Califica lo que está escrito, no lo que el equipo quiso decir.');
    L.push('- El puntaje es provisional: es tu estimación, no la de quien evalúa de verdad.');
    L.push('- Si un criterio es ambiguo, di cómo lo interpretaste.');
    L.push('');
    L.push('CÓMO ENTREGARLO');
    L.push('Primero, una tabla con una fila por criterio y estas columnas:');
    L.push('Criterio | Puntaje máximo | Dónde lo cubre (sección/página) | Evidencia | Qué falta | Puntaje estimado');
    L.push('Después de la tabla, tres listas cortas: «Afirmaciones sin respaldo», «Requisitos habilitantes que no aparecen» y «Dudas sobre los criterios».');
    L.push(total > 0 ? 'Cierra con la suma del puntaje estimado sobre ' + fmt(total) + '.' : 'Cierra con la suma del puntaje estimado.');
    return L.join('\n');
  }

  var EJEMPLO = [
    'Criterio | Puntaje máximo',
    'Pertinencia técnica y coherencia con la convocatoria | 30',
    'Metodología y plan de trabajo | 25',
    'Experiencia del equipo y de los aliados | 20',
    'Sostenibilidad de los resultados | 15',
    'Presupuesto y relación entre costo y resultados | 10',
    'Total | 100'
  ].join('\n');
  // Dos filas del ejemplo llegan con sus campos llenos, para mostrar cómo se usan.
  var EJEMPLO_CAMPOS = [
    { donde: 'Sección 2, págs. 4 a 6', evidencia: 'Diagnóstico con cifras del municipio (anexo 1)' },
    { donde: 'Sección 3, págs. 7 a 11', evidencia: 'Cronograma por meses y marco lógico (anexo 2)' }
  ];

  var ANTES_DE_ENVIAR = [
    'Formatos oficiales de la convocatoria, completos y en la versión vigente.',
    'Firmas donde las piden: representante legal, aliados, contador o revisor fiscal.',
    'Anexos completos, con el nombre y el orden que piden los términos.',
    'Límite de páginas o de palabras, tipo y tamaño de letra.',
    'Tipo y tamaño de los archivos que acepta la plataforma o el correo.',
    'Fecha y hora de cierre, con la zona horaria de quien convoca.',
    'Canal de envío confirmado, y cómo vas a guardar la constancia de recibido.'
  ];

  var Criterios = {
    parsear: parsear, parsearLinea: parsearLinea, sumar: sumar, aNumero: aNumero, fmt: fmt,
    armarPrompt: armarPrompt, EJEMPLO: EJEMPLO, EJEMPLO_CAMPOS: EJEMPLO_CAMPOS, ANTES_DE_ENVIAR: ANTES_DE_ENVIAR
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Criterios;
  else raiz.Criterios = Criterios;
})(this);
