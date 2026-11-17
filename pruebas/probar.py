"""Pruebas de la página, de punta a punta, en un navegador de verdad.

Cómo correrlas (desde la raíz del repo):
    pip install playwright openpyxl
    python -m playwright install chromium
    python pruebas/probar.py

Levanta un servidor local solo para la prueba, abre la página en Chromium y revisa:
carga sin errores, lectura de criterios en varios formatos, suma, Copiar, descarga del Excel,
390 px sin desplazamiento lateral y uso con teclado. Deja capturas en pruebas/salida/.
"""
import functools
import http.server
import pathlib
import sys
import threading

sys.dont_write_bytecode = True  # que la prueba no deje __pycache__

import openpyxl
from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "pruebas" / "salida"

resultados = []


def revisar(nombre, condicion, detalle=""):
    resultados.append((nombre, bool(condicion), detalle))
    print(("  bien  " if condicion else "  FALLA ") + nombre + (f"  →  {detalle}" if detalle and not condicion else ""))


class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def servidor():
    manejador = functools.partial(Silencioso, directory=str(RAIZ))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), manejador)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


LINEAS = [
    # (línea pegada, criterio esperado, puntaje esperado)
    ("Pertinencia técnica 30 puntos", "Pertinencia técnica", 30),
    ("Sostenibilidad | 15", "Sostenibilidad", 15),
    ("1. Experiencia del equipo: 20 pts", "Experiencia del equipo", 20),
    ("a) Calidad técnica (hasta 25 puntos)", "Calidad técnica", 25),
    ("Presupuesto\t10", "Presupuesto", 10),
    ("• Innovación ........ 12,5", "Innovación", 12.5),
    ("3.1 Enfoque diferencial – máximo 5 puntos", "Enfoque diferencial", 5),
    ("- Capacidad institucional (15)", "Capacidad institucional", 15),
    ("II. Viabilidad financiera 10 puntos.", "Viabilidad financiera", 10),
    ("Impacto esperado 20 %", "Impacto esperado", 20),
    ("1 | Pertinencia | Coherencia con los objetivos | 30", "Pertinencia · Coherencia con los objetivos", 30),
    ("Objetivo 5: igualdad de género – 10 puntos", "Objetivo 5: igualdad de género", 10),
    ("Cofinanciación de al menos el 20% del valor total: 10 puntos", "Cofinanciación de al menos el 20% del valor total", 10),
    ("Contrapartida del 10% en efectivo y 20% en especie – 15 pts", "Contrapartida del 10% en efectivo y 20% en especie", 15),
    ("Cofinanciación del 20% del valor del proyecto | 10", "Cofinanciación del 20% del valor del proyecto", 10),
    ("Enfoque de género (15%)", "Enfoque de género", 15),
    ("Aporte del 30% en especie", "Aporte del 30% en especie", None),
    ("Costo total del proyecto 10 puntos", "Costo total del proyecto", 10),
    ("Alianzas y cofinanciación", "Alianzas y cofinanciación", None),
    ("Plan de trabajo a 2027", "Plan de trabajo a 2027", None),
]

PEGADO = """Criterio\tPuntaje máximo
Pertinencia técnica 30 puntos
Sostenibilidad | 15
1. Experiencia del equipo: 20 pts
a) Metodología (hasta 25 puntos)

Presupuesto\t10
Total\t100
"""


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    srv = servidor()
    url = f"http://127.0.0.1:{srv.server_address[1]}/index.html"
    with sync_playwright() as p:
        nav = p.chromium.launch()
        ctx = nav.new_context(viewport={"width": 1280, "height": 900}, locale="es-CO", accept_downloads=True,
                              permissions=["clipboard-read", "clipboard-write"])
        pag = ctx.new_page()
        errores, pedidos = [], []
        pag.on("console", lambda m: errores.append(m.text) if m.type in ("error", "warning") else None)
        pag.on("pageerror", lambda e: errores.append(str(e)))
        pag.on("request", lambda r: pedidos.append(r.url))
        pag.goto(url)
        pag.wait_for_load_state("networkidle")

        print("Carga")
        revisar("sin errores ni avisos en la consola", not errores, "; ".join(errores))
        fuera = [u for u in pedidos if not u.startswith(f"http://127.0.0.1:{srv.server_address[1]}/")]
        revisar("no pide nada a internet", not fuera, ", ".join(fuera))
        revisar("charset utf-8", pag.evaluate("document.characterSet") == "UTF-8")
        revisar("idioma es", pag.evaluate("document.documentElement.lang") == "es")
        revisar("Copiar y Descargar empiezan apagados", pag.locator("#copiar").is_disabled() and pag.locator("#descargar").is_disabled())
        revisar("no guarda nada en el navegador", pag.evaluate("localStorage.length + sessionStorage.length + document.cookie.length") == 0)

        print("Lectura de criterios")
        for linea, criterio, puntaje in LINEAS:
            r = pag.evaluate("l => Criterios.parsearLinea(l)", linea)
            revisar(repr(linea), r and r.get("criterio") == criterio and r.get("puntaje") == puntaje, str(r))
        for linea in ["Criterio | Puntaje máximo", "   ", "30", "Aspecto a evaluar\tPonderación"]:
            revisar(f"se salta {linea!r}", pag.evaluate("l => Criterios.parsearLinea(l)", linea) is None)
        for linea in ["Total 100 puntos", "TOTAL | 100", "Puntaje total: 100", "Puntaje máximo total ........ 100", "Total puntos: 100", "Puntaje máximo total | 100"]:
            r = pag.evaluate("l => Criterios.parsearLinea(l)", linea)
            revisar(f"total en {linea!r}", r == {"total": 100}, str(r))

        print("Matriz y suma")
        pag.fill("#pegado", PEGADO)
        pag.click("#armar")
        revisar("5 filas", pag.locator("#filas > li").count() == 5)
        revisar("suma 100", pag.inner_text("#suma-num") == "100")
        revisar("cabecera: 5 criterios y 100 puntos", pag.inner_text("#n-criterios") == "5" and pag.inner_text("#n-puntos") == "100")
        revisar("sin aviso de suma", pag.locator("#aviso-suma").is_hidden())
        revisar("el ejemplo no está marcado", pag.locator("#aviso-ficticio").is_hidden())
        pag.locator(".c-puntaje").nth(0).fill("12,5")
        revisar("coma decimal: suma 82,5", pag.inner_text("#suma-num") == "82,5", pag.inner_text("#suma-num"))
        revisar("avisa que no cuadra con el total pegado", pag.locator("#aviso-suma").is_visible() and "82,5" in pag.inner_text("#aviso-suma"))
        pag.locator(".c-puntaje").nth(0).fill("treinta")
        revisar("puntaje que no es número queda marcado", pag.locator(".c-puntaje").nth(0).get_attribute("aria-invalid") == "true")
        pag.locator(".c-puntaje").nth(0).fill("30")
        pag.click("#agregar")
        revisar("agregar deja el foco en la fila nueva", pag.evaluate("document.activeElement.classList.contains('c-criterio')"))
        pag.keyboard.type("<img src=x onerror=\"window.__colado=1\">")
        pag.locator(".c-puntaje").nth(5).fill("5")
        revisar("6 criterios, suma 105", pag.inner_text("#n-criterios") == "6" and pag.inner_text("#suma-num") == "105")
        revisar("el texto escrito no se vuelve HTML", pag.locator("#filas img").count() == 0 and pag.evaluate("window.__colado === undefined"))
        pag.locator(".quitar").nth(5).click()
        revisar("quitar: vuelven 5 filas y suma 100", pag.locator("#filas > li").count() == 5 and pag.inner_text("#suma-num") == "100")

        print("Texto para la IA y Copiar")
        pag.locator(".c-donde").nth(0).fill("Sección 2, pág. 4")
        pag.locator(".c-evidencia").nth(0).fill("=HYPERLINK(\"http://x\")")
        texto = pag.input_value("#prompt")
        for trozo in ["1. Pertinencia técnica — máximo 30 puntos", "se cubre en: Sección 2, pág. 4", "No reescribas la propuesta",
                      "No inventes contenido", "Afirmaciones sin respaldo", "Requisitos habilitantes", "Puntaje estimado", "sobre 100"]:
            revisar(f"el texto dice «{trozo}»", trozo in texto)
        pag.click("#copiar")
        pag.wait_for_function("document.querySelector('#estado-copiar').textContent.startsWith('Copiado')")
        revisar("confirma «Copiado»", True)
        revisar("el portapapeles tiene el texto completo", pag.evaluate("navigator.clipboard.readText()").replace("\r\n", "\n") == texto)  # Windows devuelve CRLF

        print("Antes de enviar")
        revisar("7 requisitos", pag.locator("#lista-antes input").count() == 7)
        pag.locator("#lista-antes input").nth(0).check()
        pag.locator("#lista-antes input").nth(5).check()
        revisar("cuenta 2 de 7", pag.inner_text("#antes-cuenta") == "2 de 7 revisados", pag.inner_text("#antes-cuenta"))

        print("Excel")
        with pag.expect_download() as d:
            pag.click("#descargar")
        ruta = SALIDA / d.value.suggested_filename
        d.value.save_as(str(ruta))
        revisar("nombre matriz-de-evaluacion.xlsx", ruta.name == "matriz-de-evaluacion.xlsx")
        libro = openpyxl.load_workbook(str(ruta))
        revisar("dos hojas: Matriz y Antes de enviar", libro.sheetnames == ["Matriz", "Antes de enviar"], str(libro.sheetnames))
        h = libro["Matriz"]
        columnas = ["Criterio", "Puntaje máximo", "Dónde lo cubre (sección/página)", "Evidencia", "Qué falta", "Puntaje estimado", "Lo que vas a cambiar"]
        revisar("las 7 columnas, en orden", [c.value for c in h[1]] == columnas, str([c.value for c in h[1]]))
        revisar("fila 2 con el primer criterio", [c.value for c in h[2]][:4] == ["Pertinencia técnica", 30, "Sección 2, pág. 4", "=HYPERLINK(\"http://x\")"], str([c.value for c in h[2]]))
        revisar("el puntaje es número", isinstance(h["B2"].value, (int, float)))
        revisar("texto que empieza con = queda como texto, no como fórmula", h["D2"].data_type in ("s", "inlineStr") and h["D2"].quotePrefix, h["D2"].data_type)
        revisar("5 criterios y fila de total", h.max_row == 7 and h["A7"].value == "Total", str(h.max_row))
        revisar("total con fórmula de suma", h["B7"].value == "=SUM(B2:B6)" and h["F7"].value == "=SUM(F2:F6)", str(h["B7"].value))
        a = libro["Antes de enviar"]
        revisar("segunda hoja: 7 requisitos y 2 marcados", a.max_row == 8 and [a.cell(r, 2).value for r in range(2, 9)].count("Sí") == 2)
        valores = openpyxl.load_workbook(str(ruta), data_only=True)["Matriz"]
        revisar("valor guardado del total: 100", valores["B7"].value == 100, str(valores["B7"].value))

        print("Ejemplo ficticio y Borrar")
        pag.click("#ejemplo")
        revisar("el ejemplo se marca como ficticio", pag.locator("#aviso-ficticio").is_visible() and "ficticio" in pag.inner_text("#aviso-ficticio").lower())
        revisar("ejemplo: 5 criterios que suman 100", pag.locator("#filas > li").count() == 5 and pag.inner_text("#suma-num") == "100")
        pag.screenshot(path=str(SALIDA / "1280-ejemplo.png"), full_page=True)
        pag.click("#borrar")
        revisar("Borrar pide confirmar", pag.locator("#filas > li").count() == 5 and "otra vez" in pag.inner_text("#borrar"))
        pag.click("#borrar")
        revisar("Borrar deja todo en blanco", pag.locator("#filas > li").count() == 0 and pag.input_value("#pegado") == "" and pag.inner_text("#n-criterios") == "–"
                and pag.locator("#copiar").is_disabled() and pag.locator("#lista-antes input:checked").count() == 0)
        pag.fill("#pegado", "esto no trae nada útil: ???\n123")
        pag.click("#armar")
        pag.fill("#pegado", "")
        pag.click("#armar")
        revisar("sin criterios, lo dice", "pega los criterios" in pag.inner_text("#estado-armar").lower(), pag.inner_text("#estado-armar"))

        print("Teclado")
        pag.reload()
        pag.keyboard.press("Tab")
        revisar("el primer Tab llega a «Ir a pegar los criterios»", pag.evaluate("document.activeElement.className") == "saltar")
        pag.keyboard.press("Enter")
        pag.focus("#pegado")
        pag.keyboard.type("Pertinencia 60 puntos\nSostenibilidad 40 puntos")
        pag.keyboard.press("Tab")
        revisar("Tab pasa del cuadro a «Armar la matriz»", pag.evaluate("document.activeElement.id") == "armar")
        pag.keyboard.press("Enter")
        revisar("Enter arma la matriz y lleva el foco a su título", pag.locator("#filas > li").count() == 2 and pag.evaluate("document.activeElement.id") == "t-matriz")
        pag.keyboard.press("Tab")
        revisar("el siguiente Tab entra a la primera fila", pag.evaluate("document.activeElement.id").startswith("criterio-"))
        for _ in range(4):
            pag.keyboard.press("Tab")
        revisar("cuatro Tab después: «Quitar» de la fila 1", pag.evaluate("document.activeElement.getAttribute('aria-label')") == "Quitar el criterio 1: Pertinencia")
        contorno = pag.evaluate("getComputedStyle(document.activeElement).outlineStyle")
        revisar("el foco se ve", contorno not in ("none", ""), contorno)
        pag.keyboard.press("Enter")
        revisar("Enter quita la fila y el foco sigue en la matriz", pag.locator("#filas > li").count() == 1 and pag.evaluate("document.activeElement.className") == "quitar")
        pag.focus("#antes-0")
        pag.keyboard.press("Space")
        revisar("Espacio marca un requisito", pag.locator("#antes-0").is_checked())
        pag.focus("#copiar")
        pag.keyboard.press("Enter")
        pag.wait_for_function("document.querySelector('#estado-copiar').textContent.startsWith('Copiado')")
        revisar("Copiar funciona con Enter", "Sostenibilidad — máximo 40 puntos" in pag.evaluate("navigator.clipboard.readText()"))

        print("Anchos")
        for ancho, alto in [(390, 844), (320, 700), (768, 900), (1280, 900)]:
            pag.set_viewport_size({"width": ancho, "height": alto})
            pag.reload()
            desborde0 = pag.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            pag.click("#ejemplo")
            pag.locator(".c-criterio").nth(2).fill("Unapalabralarguisimasinespaciosparaverquenoseabrelapaginahacialosladosnuncajamas " * 2)
            desborde = pag.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            revisar(f"{ancho} px sin desplazamiento lateral", desborde0 <= 0 and desborde <= 0, f"{desborde0} / {desborde}")
            pag.click("#ejemplo")
            pag.evaluate("window.scrollTo(0, 0)")
            pag.screenshot(path=str(SALIDA / f"{ancho}-ejemplo.png"), full_page=True)
        revisar("a 390 px los botones se alcanzan (44 px o más)", pag.evaluate(
            "(() => { const v = [...document.querySelectorAll('.boton')].map(b => b.getBoundingClientRect().height); return Math.min(...v); })()") >= 44)

        revisar("al final, la consola sigue sin errores", not errores, "; ".join(errores))
        nav.close()
    srv.shutdown()

    fallas = [r for r in resultados if not r[1]]
    print(f"\n{len(resultados) - len(fallas)} de {len(resultados)} revisiones bien.")
    if fallas:
        print("Fallaron: " + "; ".join(f[0] for f in fallas))
        sys.exit(1)


if __name__ == "__main__":
    main()
