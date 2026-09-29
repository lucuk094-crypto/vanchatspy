#!/usr/bin/env python3
"""buat-logo.py — mengubah gambar logo (JPG latar hitam) menjadi PNG berkanal
alpha yang rapi untuk dipakai di web (hero, lencana merek, favicon, ikon app).

Cara pakai:
    python3 tools/buat-logo.py "/path/logo.jpg"

Keluaran (di assets/):
    logo.png        512×512 (dipakai di halaman)
    logo-192.png    192×192 (ikon Android/manifest)
    logo-1024.png   1024×1024 (cadangan, ikon app)
    favicon-64.png   64×64
"""
import sys
import pathlib
import numpy as np
from PIL import Image

AKAR = pathlib.Path(__file__).resolve().parent.parent
sumber = sys.argv[1] if len(sys.argv) > 1 else str(pathlib.Path.home() / 'uploads' / 'Asta0001 Lnk_Bio · link in bio.jpg')

im = Image.open(sumber).convert('RGB')
a = np.asarray(im).astype(np.float32)
mx = a.max(axis=2)                      # latar hitam → kecerahan = kepekatan tinta
puncak = float(np.percentile(mx, 99.5)) or 1.0

# ambil warna dari piksel paling pekat (garis logo)
terang = mx > 0.85 * mx.max()
warna = a[terang].mean(axis=0)
warna = np.clip(warna, 0, 255)

# alfa dengan sedikit penajaman supaya tepi garis tetap halus
alfa = np.clip(mx / puncak, 0, 1) ** 0.85
alfa[mx < 18] = 0                        # buang bintik latar

keluar = np.zeros((*mx.shape, 4), dtype=np.uint8)
keluar[..., 0], keluar[..., 1], keluar[..., 2] = warna.astype(np.uint8)
keluar[..., 3] = (alfa * 255).astype(np.uint8)
img = Image.fromarray(keluar, 'RGBA')

# potong ke isi, lalu jadikan persegi dengan sedikit ruang tepi
kotak = img.getchannel('A').point(lambda v: 255 if v > 14 else 0).getbbox()
img = img.crop(kotak)
sisi = max(img.size)
kanvas = Image.new('RGBA', (int(sisi * 1.06), int(sisi * 1.06)), (0, 0, 0, 0))
kanvas.paste(img, ((kanvas.width - img.width) // 2, (kanvas.height - img.height) // 2), img)

tujuan = AKAR / 'assets'
tujuan.mkdir(exist_ok=True)
# disimpan sebagai PNG berpalet (32 warna) — tampak sama tapi jauh lebih ringan
for nama, ukuran, warna in [('logo.png', 512, 32), ('logo-192.png', 192, 32), ('logo-1024.png', 1024, 24), ('favicon-64.png', 64, 16)]:
    kanvas.resize((ukuran, ukuran), Image.LANCZOS).quantize(colors=warna, method=Image.FASTOCTREE).save(tujuan / nama, optimize=True)

print('warna garis  :', '#%02x%02x%02x' % tuple(warna.astype(int)))
print('ukuran asli  :', im.size, '→ persegi', kanvas.size)
for nama in ['logo.png', 'logo-192.png', 'logo-1024.png', 'favicon-64.png']:
    print('  %-16s %6.1f KB' % (nama, (tujuan / nama).stat().st_size / 1024))
