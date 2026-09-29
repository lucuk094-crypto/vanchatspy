#!/usr/bin/env python3
"""buat-contoh-berkas.py — membuat berkas contoh untuk menguji pembaca berkas
(docx · xlsx · pptx · zip · pdf) di tools/contoh/.
Semua dibuat dari nol (tanpa pustaka luar) supaya bisa diulang kapan saja:

    python3 tools/buat-contoh-berkas.py
"""
import os
import zlib
import zipfile

AKAR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'contoh')
os.makedirs(AKAR, exist_ok=True)

CT = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      '<Default Extension="xml" ContentType="application/xml"/>'
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
      '</Types>')
RELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '</Relationships>')


def tulis(nama, berkas):
    jalur = os.path.join(AKAR, nama)
    with zipfile.ZipFile(jalur, 'w', zipfile.ZIP_DEFLATED) as z:
        for n, isi in berkas.items():
            z.writestr(n, isi)
    print('  dibuat:', nama, os.path.getsize(jalur), 'B')


print('berkas contoh →', AKAR)

# ── DOCX ─────────────────────────────────────────────────────────────────
tulis('contoh.docx', {
    '[Content_Types].xml': CT,
    '_rels/.rels': RELS,
    'word/document.xml': ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        '<w:p><w:r><w:t>Laporan Uji Van Chat</w:t></w:r></w:p>'
        '<w:p><w:r><w:t>Baris kedua dengan angka 42</w:t></w:r></w:p>'
        '<w:p><w:r><w:t>Penutup dokumen.</w:t></w:r></w:p>'
        '</w:body></w:document>'),
})

# ── XLSX ─────────────────────────────────────────────────────────────────
tulis('contoh.xlsx', {
    '[Content_Types].xml': CT,
    '_rels/.rels': ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>'),
    'xl/workbook.xml': ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Penjualan" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '</Relationships>'),
    'xl/sharedStrings.xml': ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">'
        '<si><t>Produk</t></si><si><t>Jumlah</t></si><si><t>Kopi Arabika</t></si><si><t>Teh Melati</t></si></sst>'),
    'xl/worksheets/sheet1.xml': ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>17</v></c></row>'
        '<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>9</v></c></row>'
        '</sheetData></worksheet>'),
})

# ── PPTX ─────────────────────────────────────────────────────────────────
def slide(judul, isi):
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
            'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>'
            '<p:sp><p:txBody><a:p><a:r><a:t>' + judul + '</a:t></a:r></a:p>'
            '<a:p><a:r><a:t>' + isi + '</a:t></a:r></a:p></p:txBody></p:sp>'
            '</p:spTree></p:cSld></p:sld>')

tulis('contoh.pptx', {
    '[Content_Types].xml': CT,
    '_rels/.rels': ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
        '</Relationships>'),
    'ppt/presentation.xml': ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>'),
    'ppt/slides/slide1.xml': slide('Rencana Proyek', 'Tahap pertama: riset pasar'),
    'ppt/slides/slide2.xml': slide('Anggaran', 'Total 12 juta rupiah'),
})

# ── ZIP ──────────────────────────────────────────────────────────────────
tulis('contoh.zip', {
    'satu.txt': 'Isi berkas pertama di dalam arsip.',
    'dua.md': '# Catatan arsip\n\n- poin satu\n- poin dua\n',
    'kode/app.js': 'console.log("halo dari arsip");\n',
})

# ── PDF (satu halaman, aliran teks FlateDecode) ──────────────────────────
isi = b'BT /F1 12 Tf 72 720 Td (Halo PDF Van Chat) Tj T* (Baris kedua: angka 7) Tj ET'
padat = zlib.compress(isi)
potongan = []
potongan.append(b'%PDF-1.4\n')
potongan.append(b'1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n')
potongan.append(b'2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n')
potongan.append(b'3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>endobj\n')
potongan.append(b'4 0 obj<</Length ' + str(len(padat)).encode() + b'/Filter/FlateDecode>>stream\n' + padat + b'\nendstream endobj\n')
potongan.append(b'5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n')
potongan.append(b'trailer<</Root 1 0 R/Size 6>>\n%%EOF\n')
pdf = b''.join(potongan)
jalur = os.path.join(AKAR, 'contoh.pdf')
with open(jalur, 'wb') as f:
    f.write(pdf)
print('  dibuat: contoh.pdf', os.path.getsize(jalur), 'B')
print('selesai.')
