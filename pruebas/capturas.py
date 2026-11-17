"""Vuelve a hacer las dos imágenes de docs/: la captura del README y la tarjeta para compartir.

    python pruebas/capturas.py

docs/captura.png   · la página real a 1280 px, con el ejemplo ficticio cargado.
docs/compartir.png · tarjeta de 1200 × 630 para cuando se comparte el enlace.
"""
import pathlib

from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DOCS = RAIZ / "docs"

TARJETA = """<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><style>
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; color: #2a231f;
  font: 400 26px/1.4 "Neue Haas Grotesk Text", "Neue Haas Grotesk Text Pro", "Helvetica Neue", Helvetica, Arial, sans-serif;
  background: radial-gradient(110% 95% at 100% 0%, #e5cbb8 0%, rgba(229,203,184,0) 58%), linear-gradient(180deg, #faf6ec 0%, #f2ebdc 100%); }
.in { display: grid; grid-template-columns: 1fr 350px; column-gap: 56px; height: 100%; padding: 64px 72px 60px; }
.izq { display: flex; flex-direction: column; min-width: 0; }
.kicker { font: 600 16px/1.3 "Helvetica Neue", Helvetica, Arial, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #9c5635; }
h1 { font: 300 124px/.98 "Neue Haas Grotesk Display", "Neue Haas Grotesk Display Pro", "Helvetica Neue", Helvetica, Arial, sans-serif; letter-spacing: -.02em; color: #603338; margin-top: 30px; }
h1 span { color: #9c5635; display: block; }
.bajada { margin-top: 34px; max-width: 22.5em; }
.gratis { margin-top: auto; font-size: 19px; color: #6e6456; }
.der { align-self: center; border-left: 1px solid #cbc2ac; padding-left: 36px; }
.der p { font: 600 13.5px/1.3 "Helvetica Neue", Helvetica, Arial, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #7e4329; padding-bottom: 12px; }
.der li { list-style: none; display: grid; grid-template-columns: 1fr auto; column-gap: 16px; align-items: baseline; padding: 13px 0; border-top: 1px solid #cbc2ac; font-size: 20px; line-height: 1.25; }
.der li b { font: 300 32px/1 "Neue Haas Grotesk Display", "Neue Haas Grotesk Display Pro", "Helvetica Neue", Helvetica, Arial, sans-serif; color: #603338; font-variant-numeric: tabular-nums; }
.der li.total { border-top: 2px solid #603338; font-weight: 600; }
.der li.total b { color: #9c5635; font-size: 44px; }
</style></head><body><div class="in">
<div class="izq">
  <p class="kicker">Herramienta abierta · Consultorio X de Estado X</p>
  <h1>Revisa tu <span>propuesta</span></h1>
  <p class="bajada">Tu propuesta, leída como la lee quien evalúa: criterio por criterio.</p>
  <p class="gratis">Gratis · todo pasa en tu navegador</p>
</div>
<ul class="der">
  <p>Ejemplo ficticio</p>
  <li>Pertinencia técnica <b>30</b></li>
  <li>Metodología <b>25</b></li>
  <li>Experiencia del equipo <b>20</b></li>
  <li>Sostenibilidad <b>15</b></li>
  <li>Presupuesto <b>10</b></li>
  <li class="total">Puntos en total <b>100</b></li>
</ul>
</div></body></html>"""


def main():
    DOCS.mkdir(exist_ok=True)
    with sync_playwright() as p:
        nav = p.chromium.launch()
        pag = nav.new_page(viewport={"width": 1280, "height": 1400}, locale="es-CO")
        pag.goto((RAIZ / "index.html").as_uri())
        pag.click("#ejemplo")
        pag.mouse.move(640, 5)
        pag.evaluate("document.activeElement.blur(); document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0)")
        pag.screenshot(path=str(DOCS / "captura.png"))

        tarjeta = nav.new_page(viewport={"width": 1200, "height": 630})
        tarjeta.set_content(TARJETA)
        tarjeta.screenshot(path=str(DOCS / "compartir.png"))
        nav.close()
    print("Listo: docs/captura.png y docs/compartir.png")


if __name__ == "__main__":
    main()
