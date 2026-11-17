/* Revisa tu propuesta · Estado X
   La página: filas editables, suma, texto para la IA, lista «Antes de enviar» y descarga en Excel.
   Nada se guarda ni se envía: lo que escribes vive en esta pestaña y se va al cerrarla.
   Todo texto de la persona entra a la página por .value o .textContent, nunca como HTML. */
(function () {
  'use strict';

  var C = window.Criterios;
  var $ = function (s) { return document.querySelector(s); };
  var consecutivo = 0;
  var totalDeclarado = null;
  var relojes = {};

  function el(etiqueta, clase, texto) {
    var e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function decir(id, texto, ms) {
    var p = $(id);
    p.textContent = texto;
    clearTimeout(relojes[id]);
    if (texto && ms) relojes[id] = setTimeout(function () { p.textContent = ''; }, ms);
  }

  /* ---------- Filas ---------- */
  function campo(clase, rotulo, control, id) {
    var d = el('div', 'campo ' + clase);
    var l = el('label', 'etiqueta', rotulo);
    l.htmlFor = id;
    control.id = id;
    d.appendChild(l);
    d.appendChild(control);
    return d;
  }

  function crearFila(dato) {
    dato = dato || {};
    var n = ++consecutivo;
    var li = el('li', 'fila');
    li.appendChild(el('span', 'fila__num'));

    var criterio = el('textarea', 'c-criterio');
    criterio.rows = 2;
    criterio.value = dato.criterio || '';
    li.appendChild(campo('campo--criterio', 'Criterio', criterio, 'criterio-' + n));

    var puntaje = el('input', 'c-puntaje');
    puntaje.type = 'text';
    puntaje.inputMode = 'decimal';
    puntaje.autocomplete = 'off';
    puntaje.value = typeof dato.puntaje === 'number' ? C.fmt(dato.puntaje).replace(/\./g, '') : '';
    li.appendChild(campo('campo--puntaje', 'Puntaje máximo', puntaje, 'puntaje-' + n));

    var donde = el('input', 'c-donde');
    donde.type = 'text';
    donde.autocomplete = 'off';
    donde.placeholder = 'Opcional';
    donde.value = dato.donde || '';
    li.appendChild(campo('campo--donde', 'Dónde lo cubre tu propuesta (sección / página)', donde, 'donde-' + n));

    var evidencia = el('textarea', 'c-evidencia');
    evidencia.rows = 2;
    evidencia.placeholder = 'Opcional';
    evidencia.value = dato.evidencia || '';
    li.appendChild(campo('campo--evidencia', 'Evidencia', evidencia, 'evidencia-' + n));

    var quitar = el('button', 'quitar', 'Quitar');
    quitar.type = 'button';
    li.appendChild(quitar);
    return li;
  }

  function filas() { return Array.prototype.slice.call($('#filas').children); }

  function leer() {
    return filas().map(function (li) {
      return {
        criterio: li.querySelector('.c-criterio').value.trim(),
        puntaje: C.aNumero(li.querySelector('.c-puntaje').value),
        puntajeTexto: li.querySelector('.c-puntaje').value.trim(),
        donde: li.querySelector('.c-donde').value.trim(),
        evidencia: li.querySelector('.c-evidencia').value.trim()
      };
    });
  }

  function conContenido(datos) {
    return datos.filter(function (d) { return d.criterio || d.puntaje !== null || d.donde || d.evidencia; });
  }

  function poner(datos) {
    var ol = $('#filas');
    while (ol.firstChild) ol.removeChild(ol.firstChild);
    datos.forEach(function (d) { ol.appendChild(crearFila(d)); });
    refrescar();
  }

  /* ---------- Lo que depende de las filas ---------- */
  function refrescar() {
    var lis = filas();
    var datos = leer();
    lis.forEach(function (li, i) {
      li.querySelector('.fila__num').textContent = String(i + 1);
      var nombre = datos[i].criterio ? ': ' + datos[i].criterio.slice(0, 60) : '';
      li.querySelector('.quitar').setAttribute('aria-label', 'Quitar el criterio ' + (i + 1) + nombre);
      var p = li.querySelector('.c-puntaje');
      var malo = datos[i].puntajeTexto !== '' && datos[i].puntaje === null;
      if (malo) p.setAttribute('aria-invalid', 'true'); else p.removeAttribute('aria-invalid');
    });

    var utiles = conContenido(datos);
    var suma = C.sumar(utiles);
    var hay = utiles.length > 0;
    $('#matriz-vacia').hidden = lis.length > 0;
    $('#suma').hidden = lis.length === 0;
    $('#suma-num').textContent = C.fmt(suma);
    $('#n-criterios').textContent = hay ? String(utiles.length) : '–';
    $('#n-puntos').textContent = hay ? C.fmt(suma) : '–';

    var avisos = [];
    var sinNumero = datos.filter(function (d) { return d.puntajeTexto !== '' && d.puntaje === null; }).length;
    if (sinNumero) avisos.push(sinNumero === 1 ? 'Hay un puntaje que no es un número: escríbelo solo con cifras, por ejemplo 12,5.' : 'Hay ' + sinNumero + ' puntajes que no son números: escríbelos solo con cifras, por ejemplo 12,5.');
    if (totalDeclarado !== null && hay && Math.abs(totalDeclarado - suma) > 0.001) {
      avisos.push('Los términos que pegaste dicen que el total es ' + C.fmt(totalDeclarado) + ', pero las filas suman ' + C.fmt(suma) + '. Revisa si falta un criterio o un puntaje.');
    }
    var aviso = $('#aviso-suma');
    aviso.textContent = avisos.join(' ');
    aviso.hidden = avisos.length === 0;

    $('#prompt').value = hay ? C.armarPrompt(utiles) : '';
    $('#copiar').disabled = !hay;
    $('#descargar').disabled = !hay;
  }

  /* ---------- Acciones ---------- */
  function armar(texto, campos, ficticio) {
    var r = C.parsear(texto);
    if (!r.criterios.length) {
      decir('#estado-armar', texto.trim() ? 'No encontré criterios en ese texto. Escribe uno por línea, con su puntaje.' : 'Primero pega los criterios, uno por línea.');
      $('#pegado').focus();
      return;
    }
    // Si un criterio ya estaba en la matriz con el mismo nombre, conserva lo que la persona le escribió.
    var previos = {};
    leer().forEach(function (d) { if (d.criterio && (d.donde || d.evidencia)) previos[d.criterio.toLowerCase()] = d; });
    var datos = r.criterios.map(function (c, i) {
      var extra = campos ? campos[i] : previos[c.criterio.toLowerCase()];
      return { criterio: c.criterio, puntaje: c.puntaje, donde: extra ? extra.donde : '', evidencia: extra ? extra.evidencia : '' };
    });
    totalDeclarado = r.totalDeclarado;
    $('#aviso-ficticio').hidden = !ficticio;
    poner(datos);
    var n = datos.length;
    var sin = datos.filter(function (d) { return d.puntaje === null; }).length;
    decir('#estado-armar', (n === 1 ? 'Listo: 1 criterio en la matriz.' : 'Listo: ' + n + ' criterios en la matriz.') +
      (sin ? (sin === 1 ? ' A uno le falta el puntaje.' : ' A ' + sin + ' les falta el puntaje.') : ''));
    var t = $('#t-matriz');
    t.focus({ preventScroll: true });
    t.scrollIntoView({ block: 'start' });
  }

  function cargarEjemplo() {
    $('#pegado').value = C.EJEMPLO;
    armar(C.EJEMPLO, C.EJEMPLO_CAMPOS, true);
  }

  var borrarArmado = false;
  function desarmarBorrar() {
    borrarArmado = false;
    clearTimeout(relojes.borrar);
    $('#borrar').textContent = 'Borrar todo';
  }

  function borrarTodo() {
    // Con algo escrito, pide un segundo clic: lo borrado no se recupera.
    var hayAlgo = $('#pegado').value.trim() !== '' || conContenido(leer()).length > 0;
    if (hayAlgo && !borrarArmado) {
      borrarArmado = true;
      $('#borrar').textContent = 'Pulsa otra vez para borrar';
      decir('#estado-armar', 'Se va a borrar lo que escribiste y no se puede recuperar. Pulsa otra vez para confirmar.');
      relojes.borrar = setTimeout(function () { desarmarBorrar(); decir('#estado-armar', ''); }, 6000);
      return;
    }
    desarmarBorrar();
    $('#pegado').value = '';
    totalDeclarado = null;
    $('#aviso-ficticio').hidden = true;
    poner([]);
    Array.prototype.forEach.call(document.querySelectorAll('#lista-antes input'), function (c) { c.checked = false; });
    contarLista();
    decir('#estado-armar', 'Se borraron los criterios, la matriz y las marcas de la lista.', 6000);
    $('#pegado').focus();
  }

  function copiar() {
    var texto = $('#prompt').value;
    if (!texto) return;
    var listo = function () { decir('#estado-copiar', 'Copiado. Pégalo en tu IA y adjunta la propuesta.', 6000); };
    var aMano = function () {
      var t = $('#prompt');
      t.focus();
      t.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      if (ok) listo();
      else decir('#estado-copiar', 'No se pudo copiar solo. El texto quedó seleccionado: cópialo con Ctrl + C.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(listo, aMano);
    else aMano();
  }

  function descargar() {
    var utiles = conContenido(leer());
    if (!utiles.length) return;
    var lista = Array.prototype.map.call(document.querySelectorAll('#lista-antes input'), function (c, i) {
      return { texto: C.ANTES_DE_ENVIAR[i], listo: c.checked };
    });
    var bytes = window.Excel.crear(utiles, lista);
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'matriz-de-evaluacion.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    decir('#estado-descargar', 'Se descargó matriz-de-evaluacion.xlsx.', 6000);
  }

  /* ---------- Lista «Antes de enviar» ---------- */
  function armarLista() {
    var ul = $('#lista-antes');
    C.ANTES_DE_ENVIAR.forEach(function (texto, i) {
      var li = el('li', 'lista__item');
      var c = el('input');
      c.type = 'checkbox';
      c.id = 'antes-' + i;
      var l = el('label', null, texto);
      l.htmlFor = c.id;
      li.appendChild(c);
      li.appendChild(l);
      ul.appendChild(li);
    });
    ul.addEventListener('change', contarLista);
    contarLista();
  }

  function contarLista() {
    var todos = document.querySelectorAll('#lista-antes input');
    var listos = document.querySelectorAll('#lista-antes input:checked').length;
    $('#antes-cuenta').textContent = listos + ' de ' + todos.length + (listos === 1 ? ' revisado' : ' revisados');
  }

  /* ---------- Arranque ---------- */
  function iniciar() {
    armarLista();
    $('#armar').addEventListener('click', function () { armar($('#pegado').value, null, false); });
    $('#ejemplo').addEventListener('click', cargarEjemplo);
    $('#ejemplo-cab').addEventListener('click', cargarEjemplo);
    $('#borrar').addEventListener('click', borrarTodo);
    $('#copiar').addEventListener('click', copiar);
    $('#descargar').addEventListener('click', descargar);
    $('#agregar').addEventListener('click', function () {
      var li = crearFila();
      $('#filas').appendChild(li);
      refrescar();
      li.querySelector('.c-criterio').focus();
    });
    $('#filas').addEventListener('input', refrescar);
    $('#filas').addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('.quitar') : null;
      if (!b) return;
      var li = b.parentNode;
      var sigue = li.nextElementSibling || li.previousElementSibling;
      li.parentNode.removeChild(li);
      refrescar();
      if (sigue) sigue.querySelector('.quitar').focus(); else $('#agregar').focus();
    });
    refrescar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
