"""Limpia el borde inferior del logo y regenera todas las versiones.

Uso: python scripts/clean_logo.py <logo_300_original.png> <out_dir>

La fuente es el logo-icon.png de 300x300 ANTERIOR a la limpieza (logo512
era una ampliación exacta de ese). Ya no está en public/ (ahí quedó la
versión limpia, con transparencia); se recupera de git:
    git show a024e02:public/logo-icon.png > logo-300-original.png
Escribe en <out_dir> sin tocar public/; los archivos se copian a mano.
Necesita Pillow y numpy (no son dependencias de la app).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

source, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

src = Image.open(source).convert("RGB")
a = np.asarray(src, dtype=np.float64).copy()
H, W, _ = a.shape

# 1) Borde inferior: desde la fila 290 asoman los restos de las letras del
# recorte original, y desde ~272 hay una sombra gris. La línea del cuello
# termina en la fila 270, así que se rellena desde 272 hacia abajo con el
# fondo de esa fila (suavizado a lo ancho), que se aclara hacia el fondo
# general, con una costura de 8 filas.
Y0, SEAM = 272, 8
BG = np.array([245.0, 249.0, 252.0])  # fondo claro de la tarjeta
base = a[Y0 - 2 : Y0 + 1].mean(axis=0)
k = np.exp(-0.5 * (np.arange(-24, 25) / 8.0) ** 2)
k /= k.sum()
padded = np.pad(base, ((24, 24), (0, 0)), mode="edge")
base = np.stack([np.convolve(padded[:, c], k, mode="valid") for c in range(3)], axis=1)
for y in range(Y0, H):
    fade = min(1.0, (y - Y0) / 20.0)
    fill = base + (BG - base) * fade
    t = min(1.0, (y - Y0 + 1) / SEAM)
    a[y] = a[y] * (1 - t) + fill * t

clean = Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), "RGB")


def rounded_mask(size, radius_ratio=0.25, ss=4):
    """Máscara de esquinas redondeadas con antialias (supermuestreo)."""
    big = size * ss
    r = radius_ratio * big
    yy, xx = np.mgrid[0:big, 0:big] + 0.5
    cx = np.clip(xx, r, big - r)
    cy = np.clip(yy, r, big - r)
    inside = ((xx - cx) ** 2 + (yy - cy) ** 2) <= r * r
    m = Image.fromarray((inside * 255).astype(np.uint8), "L")
    return m.resize((size, size), Image.LANCZOS)


def rgba(size):
    im = clean if size == W else clean.resize((size, size), Image.LANCZOS)
    im = im.convert("RGBA")
    im.putalpha(rounded_mask(size))
    return im


rgba(300).save(out / "logo-icon.png", optimize=True)
rgba(192).save(out / "logo192.png", optimize=True)
rgba(512).save(out / "logo512.png", optimize=True)
rgba(192).save(out / "logo-icon.webp", "WEBP", quality=80, method=6)
# Mismo .ico de 16 px de ahora más los tamaños que ya declara manifest.json.
rgba(64).save(out / "favicon.ico", sizes=[(16, 16), (24, 24), (32, 32), (64, 64)])
# iOS pinta de negro lo transparente: ícono de Apple opaco, sin redondear
# (iOS aplica su propia máscara).
clean.resize((180, 180), Image.LANCZOS).save(out / "apple-touch-icon.png", optimize=True)
clean.save(out / "logo-clean-300-opaco.png")

# Comparación: original | limpio, sobre fondo claro y oscuro.
def on(bg, im):
    c = Image.new("RGBA", im.size, bg)
    c.alpha_composite(im)
    return c

orig = src.convert("RGBA")
new = rgba(300)
sheet = Image.new("RGBA", (300 * 4 + 50, 300 + 20), (128, 128, 128, 255))
for i, im in enumerate([on((255, 255, 255, 255), orig), on((255, 255, 255, 255), new),
                        on((18, 14, 40, 255), orig), on((18, 14, 40, 255), new)]):
    sheet.alpha_composite(im, (10 + i * 310, 10))
sheet.save(out / "comparacion.png")

for f in sorted(out.iterdir()):
    print(f.name, f.stat().st_size)
