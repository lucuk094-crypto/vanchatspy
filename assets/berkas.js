/* ══════════════════════════════════════════════════════════════════════
   Van Chat.SPY — pembaca berkas (tanpa pustaka luar, tanpa server)
   • ZIP  : daftar isi + baca satu entri (inflate memakai DecompressionStream)
   • DOCX : teks paragraf dari word/document.xml
   • XLSX : tabel dari xl/sharedStrings.xml + xl/worksheets/*.xml
   • PPTX : teks per slide dari ppt/slides/slideN.xml
   • PDF  : teks dasar dari aliran teks (Tj/TJ) — cukup untuk banyak PDF biasa
   • Teks/kode/CSV/JSON/SVG : dibaca apa adanya
   Semua terjadi di browser pengguna; berkas tidak pernah dikirim ke server
   hanya untuk dibaca.
   ══════════════════════════════════════════════════════════════════════ */
window.BERKAS = (function () {
  'use strict';

  var dekoder = new TextDecoder('utf-8');
  function teksDari(bytes) { return dekoder.decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); }

  async function inflate(bytes, mentah) {
    var bentuk = mentah ? 'deflate-raw' : 'deflate';
    if (typeof DecompressionStream !== 'function') throw new Error('browser belum mendukung DecompressionStream');
    var ds = new DecompressionStream(bentuk);
    var aliran = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(aliran).arrayBuffer());
  }

  /* ── 1. ZIP ────────────────────────────────────────────────────────── */
  async function bukaZip(arrayBuffer) {
    var d = new DataView(arrayBuffer), u = new Uint8Array(arrayBuffer);
    /* cari End Of Central Directory */
    var eocd = -1;
    for (var i = arrayBuffer.byteLength - 22; i >= Math.max(0, arrayBuffer.byteLength - 66000); i--) {
      if (d.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('bukan berkas ZIP yang sah');
    var jumlah = d.getUint16(eocd + 10, true);
    var mulai = d.getUint32(eocd + 16, true);
    var daftar = [], pos = mulai;
    for (var n = 0; n < jumlah; n++) {
      if (d.getUint32(pos, true) !== 0x02014b50) break;
      var metode = d.getUint16(pos + 10, true);
      var ukuranK = d.getUint32(pos + 20, true);
      var ukuranA = d.getUint32(pos + 24, true);
      var panjangNama = d.getUint16(pos + 28, true);
      var panjangEkstra = d.getUint16(pos + 30, true);
      var panjangKomentar = d.getUint16(pos + 32, true);
      var offset = d.getUint32(pos + 42, true);
      var nama = teksDari(u.subarray(pos + 46, pos + 46 + panjangNama));
      daftar.push({ nama: nama, metode: metode, ukuran: ukuranA, ukuranTerkompresi: ukuranK, offset: offset });
      pos += 46 + panjangNama + panjangEkstra + panjangKomentar;
    }
    async function baca(nama) {
      var e = daftar.filter(function (x) { return x.nama === nama; })[0];
      if (!e) return null;
      var p = e.offset;
      if (d.getUint32(p, true) !== 0x04034b50) throw new Error('entri ZIP rusak: ' + nama);
      var panjangNamaE = d.getUint16(p + 26, true);
      var panjangEkstraE = d.getUint16(p + 28, true);
      var awal = p + 30 + panjangNamaE + panjangEkstraE;
      var isi = u.subarray(awal, awal + e.ukuranTerkompresi);
      if (e.metode === 0) return isi;
      if (e.metode === 8) return await inflate(isi, true);
      throw new Error('metode kompresi ZIP tidak didukung (' + e.metode + ')');
    }
    return { daftar: daftar, baca: baca };
  }

  /* ── 2. bantu XML ──────────────────────────────────────────────────── */
  function tanpaTag(s) {
    return String(s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); })
      .replace(/&amp;/g, '&');
  }
  function rapikan(s) {
    return String(s).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* ── 3. DOCX ───────────────────────────────────────────────────────── */
  async function bacaDocx(zip) {
    var b = await zip.baca('word/document.xml');
    if (!b) throw new Error('struktur DOCX tidak dikenal');
    var xml = teksDari(b);
    var keluar = xml
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '');
    return rapikan(tanpaTag(keluar));
  }

  /* ── 4. XLSX ───────────────────────────────────────────────────────── */
  async function bacaXlsx(zip) {
    var bersama = [];
    var sb = await zip.baca('xl/sharedStrings.xml');
    if (sb) {
      var xmlS = teksDari(sb);
      var potong = xmlS.split(/<si[ >]/).slice(1);
      bersama = potong.map(function (bagian) {
        var teks = (bagian.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(function (t) { return tanpaTag(t.replace(/<[^>]+>/g, '')); });
        return teks.join('');
      });
    }
    /* nama sheet + urutan */
    var namaSheet = {}, urut = [];
    var wb = await zip.baca('xl/workbook.xml');
    var rel = await zip.baca('xl/_rels/workbook.xml.rels');
    if (wb && rel) {
      var petaRel = {};
      (teksDari(rel).match(/<Relationship[^>]*>/g) || []).forEach(function (r) {
        var id = (r.match(/Id="([^"]+)"/) || [])[1];
        var target = (r.match(/Target="([^"]+)"/) || [])[1];
        if (id && target) petaRel[id] = target.replace(/^\/?xl\//, '').replace(/^\//, '');
      });
      (teksDari(wb).match(/<sheet[^>]*>/g) || []).forEach(function (s) {
        var nm = (s.match(/name="([^"]*)"/) || [])[1] || 'Sheet';
        var rid = (s.match(/r:id="([^"]+)"/) || [])[1];
        urut.push({ nama: tanpaTag(nm), berkas: petaRel[rid] || '' });
      });
    }
    if (!urut.length) {
      urut = zip.daftar.filter(function (e) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(e.nama); })
        .map(function (e) { return { nama: e.nama.replace(/^.*\//, ''), berkas: e.nama }; });
    }
    var bagian = [];
    for (var i = 0; i < urut.length; i++) {
      var entri = urut[i];
      if (!entri.berkas) continue;
      var b = await zip.baca('xl/' + entri.berkas.replace(/^xl\//, ''));
      if (!b) continue;
      var xml = teksDari(b);
      var baris = xml.split(/<row[ >]/).slice(1).map(function (r) {
        return (r.match(/<c[^>]*>[\s\S]*?<\/c>|<c[^>]*\/>/g) || []).map(function (c) {
          var nilai = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          var inline = (c.match(/<is>[\s\S]*?<\/is>/) || [])[0];
          if (inline) return tanpaTag(inline.replace(/<[^>]+>/g, ''));
          if (nilai == null) return '';
          if (/t="s"/.test(c)) return bersama[+nilai] != null ? bersama[+nilai] : nilai;
          return tanpaTag(nilai);
        }).join('\t');
      }).filter(function (r) { return r.replace(/\t/g, '').trim() !== ''; });
      bagian.push('== ' + entri.nama + ' ==\n' + baris.join('\n'));
    }
    return rapikan(bagian.join('\n\n'));
  }

  /* ── 5. PPTX ───────────────────────────────────────────────────────── */
  async function bacaPptx(zip) {
    var slide = zip.daftar.filter(function (e) { return /^ppt\/slides\/slide\d+\.xml$/.test(e.nama); })
      .sort(function (a, b) { return (+a.nama.match(/(\d+)/)[1]) - (+b.nama.match(/(\d+)/)[1]); });
    var bagian = [];
    for (var i = 0; i < slide.length; i++) {
      var b = await zip.baca(slide[i].nama);
      if (!b) continue;
      var xml = teksDari(b);
      var teks = (xml.match(/<a:t>[\s\S]*?<\/a:t>/g) || []).map(function (t) { return tanpaTag(t.replace(/<[^>]+>/g, '')); });
      if (teks.length) bagian.push('— Slide ' + (i + 1) + ' —\n' + teks.join('\n'));
    }
    return rapikan(bagian.join('\n\n'));
  }

  /* ── 6. PDF (versi dasar) ──────────────────────────────────────────── */
  async function bacaPdf(bytes) {
    var mentah = '';
    var b = bytes;
    for (var i = 0; i < b.length; i++) mentah += String.fromCharCode(b[i]);   /* latin1 */
    var kumpulan = [];
    var re = /\bstream\r?\n/g, m;   /* \b agar "endstream" tidak ikut cocok */
    while ((m = re.exec(mentah))) {
      var awal = m.index + m[0].length;
      var akhir = mentah.indexOf('endstream', awal);
      if (akhir < 0) break;
      var kamus = mentah.slice(Math.max(0, m.index - 400), m.index);
      var isi = mentah.slice(awal, akhir).replace(/[\r\n]+$/, '');
      var arr = new Uint8Array(isi.length);
      for (var k = 0; k < isi.length; k++) arr[k] = isi.charCodeAt(k) & 255;
      kumpulan.push({ arr: arr, flate: /\/FlateDecode/.test(kamus) });
      re.lastIndex = akhir;
    }
    var teksSemua = [];
    for (var n = 0; n < kumpulan.length; n++) {
      var aliran = kumpulan[n].arr;
      if (kumpulan[n].flate) {
        var pilihan = [false, true];
        /* kalau ada byte sampah di depan, cari tajuk zlib (0x78 …) */
        for (var s0 = 0; s0 < aliran.length - 2; s0++) {
          if (aliran[s0] === 0x78 && (aliran[s0 + 1] === 0x01 || aliran[s0 + 1] === 0x5e || aliran[s0 + 1] === 0x9c || aliran[s0 + 1] === 0xda)) {
            if (s0) aliran = aliran.subarray(s0);
            break;
          }
        }
        var sukses = null;
        for (var pi = 0; pi < pilihan.length && !sukses; pi++) {
          try { sukses = await inflate(aliran, pilihan[pi]); } catch (e) { sukses = null; }
        }
        aliran = sukses;
      }
      if (!aliran) continue;
      var s = teksDari(aliran);
      if (!/(Tj|TJ)/.test(s)) continue;
      var keluar = '';
      var r2 = /\((?:\\.|[^\\()])*\)|\bT[dD*]|\bTJ|\bTj/g, t;
      while ((t = r2.exec(s))) {
        var piece = t[0];
        if (piece.charAt(0) === '(') {
          keluar += piece.slice(1, -1)
            .replace(/\\([()\\])/g, '$1')
            .replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\t/g, '\t')
            .replace(/\\(\d{1,3})/g, function (mm, o) { return String.fromCharCode(parseInt(o, 8)); });
        } else if (/^T[dD*]$/.test(piece)) {
          keluar += '\n';
        }
      }
      teksSemua.push(rapikan(keluar.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')));
    }
    var hasil = rapikan(teksSemua.join('\n\n'));
    if (!hasil) throw new Error('teks PDF tidak bisa dibaca (mungkin hasil pemindaian/gambar)');
    return hasil;
  }

  /* ── 7. pintu masuk ────────────────────────────────────────────────── */
  var EKSTENSI_ZIP = ['docx', 'xlsx', 'pptx', 'zip', 'odt', 'ods', 'epub', 'jar', 'apk'];
  var EKSTENSI_TEKS = ['txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx',
    'py', 'rb', 'go', 'rs', 'java', 'php', 'c', 'h', 'cpp', 'cs', 'sh', 'bash', 'sql', 'yml', 'yaml', 'xml', 'svg', 'log', 'ini', 'env', 'toml'];

  function ekstensi(nama) {
    var e = String(nama || '').toLowerCase().split('.').pop();
    return e === nama ? '' : e;
  }

  async function baca(berkas) {
    var nama = berkas.name || 'berkas';
    var ext = ekstensi(nama);
    var buf = await berkas.arrayBuffer();
    var u = new Uint8Array(buf);
    var hasil = { nama: nama, ukuran: berkas.size, format: ext, teks: '', catatan: '' };

    try {
      if (ext === 'pdf') {
        hasil.teks = await bacaPdf(u);
      } else if (EKSTENSI_ZIP.indexOf(ext) >= 0 && u[0] === 0x50 && u[1] === 0x4b) {
        var zip = await bukaZip(buf);
        if (ext === 'docx') hasil.teks = await bacaDocx(zip);
        else if (ext === 'xlsx') hasil.teks = await bacaXlsx(zip);
        else if (ext === 'pptx') hasil.teks = await bacaPptx(zip);
        else {
          var isiTeks = [];
          var daftarTeks = [];
          for (var i = 0; i < zip.daftar.length && daftarTeks.length < 12; i++) {
            var e = zip.daftar[i];
            if (e.nama.slice(-1) === '/') continue;
            daftarTeks.push(e.nama);
            var ex = ekstensi(e.nama);
            if (e.ukuran > 0 && e.ukuran < 200000 && EKSTENSI_TEKS.indexOf(ex) >= 0) {
              var isi = await zip.baca(e.nama);
              if (isi) isiTeks.push('--- ' + e.nama + ' ---\n' + teksDari(isi).slice(0, 8000));
            }
          }
          hasil.teks = 'Isi arsip (' + zip.daftar.length + ' berkas):\n' + daftarTeks.map(function (n) { return '• ' + n; }).join('\n')
            + (isiTeks.length ? '\n\n' + isiTeks.join('\n\n') : '');
          hasil.catatan = 'Arsip dibaca daftar isinya; berkas teks di dalamnya ikut dibaca.';
        }
      } else if (EKSTENSI_TEKS.indexOf(ext) >= 0 || /^text\//.test(berkas.type || '')) {
        hasil.teks = teksDari(u);
      } else {
        hasil.catatan = 'Isi berkas biner tidak dibaca; hanya nama & ukuran yang dikirim.';
      }
    } catch (e) {
      hasil.catatan = 'Gagal membaca isi: ' + String((e && e.message) || e);
    }
    if (hasil.teks.length > 60000) {
      hasil.teks = hasil.teks.slice(0, 60000);
      hasil.catatan = (hasil.catatan ? hasil.catatan + ' ' : '') + 'Isi dipotong pada 60.000 karakter pertama.';
    }
    return hasil;
  }

  return { baca: baca, bukaZip: bukaZip, ekstensi: ekstensi, EKSTENSI_TEKS: EKSTENSI_TEKS, EKSTENSI_ZIP: EKSTENSI_ZIP };
})();
