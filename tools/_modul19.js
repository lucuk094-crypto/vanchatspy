  /* ═════════════════════════════════════════════════════════════════════
     19. AI BUILDER · STUDIO GAMBAR · SUARA · CARI GLOBAL · BAGIKAN
     ════════════════════════════════════════════════════════════════════ */

  /* ── 19a. alat bantu berkas builder ───────────────────────────────── */
  function bgnDaftar() { return SET.bangunan || (SET.bangunan = []); }
  function bgnAktif() { return bgnDaftar().filter(function (b) { return b.id === bgnAktifId; })[0] || null; }
  function bgnBerkas(b, path) { return (b.berkas || []).filter(function (f) { return f.path === path; })[0] || null; }
  function bgnTulis(b, path, isi) {
    var f = bgnBerkas(b, path);
    if (f) { f.isi = isi; } else { b.berkas.push({ path: path, isi: isi }); }
    b.diubah = Date.now();
    simpanSet();
  }
  function bgnHapus(b, path) {
    b.berkas = (b.berkas || []).filter(function (f) { return f.path !== path && f.path.indexOf(path.replace(/\/$/, '') + '/') !== 0; });
    simpanSet();
  }
  function bgnPohon(b) {
    var jalur = (b.berkas || []).map(function (f) { return f.path; }).sort();
    var map = {};
    jalur.forEach(function (p) {
      var bagian = p.split('/');
      var nama = bagian.pop();
      var dir = bagian.join('/');
      map[dir] = map[dir] || [];
      map[dir].push(nama);
    });
    return Object.keys(map).sort().map(function (d) {
      return '<div class="ph-dir">' + ic('folder', 13) + '<span>' + esc(d || 'akar proyek') + '</span></div>'
        + map[d].map(function (n) {
          var p = d ? d + '/' + n : n;
          var ikon = /\.(html?|css)$/i.test(n) ? 'file-code' : /\.(js|ts|tsx|jsx|py|sql)$/i.test(n) ? 'braces' : /\.(json|md|txt|yml|yaml)$/i.test(n) ? 'file-text' : /\.(png|jpe?g|svg|webp)$/i.test(n) ? 'image' : 'file';
          return '<button class="ph-it' + (p === bgnPath ? ' on' : '') + '" data-bgn-buka="' + esc(p) + '">' + ic(ikon, 13) + '<span>' + esc(n) + '</span>'
            + '<i class="ph-uk">' + kb(String(bgnBerkas(b, p) ? bgnBerkas(b, p).isi : '').length) + '</i></button>';
        }).join('');
    }).join('');
  }

  /* ── 19b. ZIP (store, tanpa kompresi) untuk ekspor/deploy ─────────── */
  function crc32(data) {
    var tabel = crc32.tabel;
    if (!tabel) {
      tabel = crc32.tabel = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        tabel[n] = c >>> 0;
      }
    }
    var crc = 0xffffffff;
    var b = data;
    for (var i = 0; i < b.length; i++) crc = tabel[(crc ^ b[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function buatZip(daftar) {
    var enc = new TextEncoder();
    var bagian = [], pusat = [], offset = 0;
    daftar.forEach(function (f) {
      var nama = enc.encode(f.path);
      var isi = enc.encode(f.isi || '');
      var crc = crc32(isi);
      var lokal = new Uint8Array(30 + nama.length);
      var dv = new DataView(lokal.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, isi.length, true); dv.setUint32(22, isi.length, true);
      dv.setUint16(26, nama.length, true); dv.setUint16(28, 0, true);
      lokal.set(nama, 30);
      bagian.push(lokal, isi);
      var pusatEntri = new Uint8Array(46 + nama.length);
      var dp = new DataView(pusatEntri.buffer);
      dp.setUint32(0, 0x02014b50, true); dp.setUint16(4, 20, true); dp.setUint16(6, 20, true);
      dp.setUint16(8, 0, true); dp.setUint16(10, 0, true); dp.setUint16(12, 0, true); dp.setUint16(14, 0, true);
      dp.setUint32(16, crc, true); dp.setUint32(20, isi.length, true); dp.setUint32(24, isi.length, true);
      dp.setUint16(28, nama.length, true); dp.setUint16(30, 0, true); dp.setUint16(32, 0, true);
      dp.setUint16(34, 0, true); dp.setUint16(36, 0, true); dp.setUint32(38, 0, true);
      dp.setUint32(42, offset, true);
      pusatEntri.set(nama, 46);
      pusat.push(pusatEntri);
      offset += lokal.length + isi.length;
    });
    var ukuranPusat = pusat.reduce(function (n, p) { return n + p.length; }, 0);
    var akhir = new Uint8Array(22);
    var da = new DataView(akhir.buffer);
    da.setUint32(0, 0x06054b50, true);
    da.setUint16(8, daftar.length, true); da.setUint16(10, daftar.length, true);
    da.setUint32(12, ukuranPusat, true); da.setUint32(16, offset, true);
    return new Blob(bagian.concat(pusat, [akhir]), { type: 'application/zip' });
  }
  function unduhBlob(nama, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nama; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  /* ── 19c. dokumen pratinjau (berkas lokal disatukan agar benar jalan) ── */
  function bgnDokumen(b, pathAwal) {
    var awal = pathAwal || 'index.html';
    var html = bgnBerkas(b, awal);
    if (!html) {
      var kandidat = (b.berkas || []).filter(function (f) { return /\.html?$/i.test(f.path); })[0];
      if (!kandidat) return { dokumen: '<!doctype html><meta charset="utf-8"><p style="font:14px system-ui;padding:20px">Proyek ini belum punya berkas HTML.</p>', catatan: ['tidak ada berkas HTML'] };
      awal = kandidat.path; html = kandidat;
    }
    var catatan = [];
    var isi = String(html.isi || '');
    var dasar = awal.indexOf('/') >= 0 ? awal.replace(/\/[^/]+$/, '/') : '';
    /* sisipkan CSS lokal */
    isi = isi.replace(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi, function (m, href) {
      var f = bgnBerkas(b, dasar + href) || bgnBerkas(b, href);
      if (!f) { catatan.push('CSS tidak ditemukan: ' + href); return m; }
      return '<style data-dari="' + esc(href) + '">' + f.isi + '</style>';
    });
    /* sisipkan JS lokal */
    isi = isi.replace(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi, function (m, src) {
      if (/^https?:/i.test(src)) return m;
      var f = bgnBerkas(b, dasar + src) || bgnBerkas(b, src);
      if (!f) { catatan.push('JS tidak ditemukan: ' + src); return m; }
      return '<script data-dari="' + esc(src) + '">' + String(f.isi).replace(/<\/script>/gi, '<\\/script>') + '<\/script>';
    });
    /* sisipkan gambar lokal sebagai data-URL */
    isi = isi.replace(/src=["']([^"']+\.(png|jpe?g|svg|webp|gif))["']/gi, function (m, src) {
      var f = bgnBerkas(b, dasar + src) || bgnBerkas(b, src);
      if (!f) return m;
      var jenis = /\.svg$/i.test(src) ? 'image/svg+xml' : /\.jpe?g$/i.test(src) ? 'image/jpeg' : /\.gif$/i.test(src) ? 'image/gif' : /\.webp$/i.test(src) ? 'image/webp' : 'image/png';
      var b64 = /\.svg$/i.test(src) ? btoa(unescape(encodeURIComponent(String(f.isi)))) : String(f.isi).replace(/^data:[^,]+,/, '');
      return 'src="data:' + jenis + ';base64,' + b64 + '"';
    });
    /* perekam konsol & jaringan di dalam pratinjau */
    var perekam = '<scr' + 'ipt>(function(){function kirim(j){try{parent.postMessage(Object.assign({jenis:"vcs-bgn"},j),"*")}catch(e){}}'
      + 'var l=console.log,w=console.warn,e=console.error;'
      + 'console.log=function(){kirim({t:"log",teks:[].map.call(arguments,String).join(" ")});l.apply(console,arguments)};'
      + 'console.warn=function(){kirim({t:"warn",teks:[].map.call(arguments,String).join(" ")});w.apply(console,arguments)};'
      + 'console.error=function(){kirim({t:"error",teks:[].map.call(arguments,String).join(" ")});e.apply(console,arguments)};'
      + 'window.addEventListener("error",function(ev){kirim({t:"runtime",teks:(ev.message||"galat")+" @"+(ev.filename||"")+":"+(ev.lineno||0)})});'
      + 'window.addEventListener("unhandledrejection",function(ev){kirim({t:"runtime",teks:"promise ditolak: "+((ev.reason&&ev.reason.message)||ev.reason)})});'
      + 'var f=window.fetch;window.fetch=function(u,o){var url=typeof u==="string"?u:(u&&u.url)||"";kirim({t:"net",teks:"fetch "+url});return f.apply(this,arguments)};'
      + 'var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){kirim({t:"net",teks:m+" "+u});return xo.apply(this,arguments)};'
      + 'window.addEventListener("load",function(){kirim({t:"siap",teks:"pratinjau siap"})});})();<\/scr' + 'ipt>';
    return { dokumen: perekam + isi, catatan: catatan };
  }

  /* ── 19d. beda baris (diff) + jendela Terima/Tolak/Batalkan ───────── */
  function bedaBaris(a, b) {
    var A = String(a == null ? '' : a).split('\n'), B = String(b == null ? '' : b).split('\n');
    var n = A.length, m = B.length;
    if (n * m > 400000) {   /* berkas besar: tampilkan sederhana */
      return { baris: A.map(function (x) { return { t: '-', x: x }; }).concat(B.map(function (x) { return { t: '+', x: x }; })), sama: 0, tambah: m, kurang: n };
    }
    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
    for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    var keluar = [], sama = 0, tambah = 0, kurang = 0; i = 0; j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { keluar.push({ t: ' ', x: A[i] }); sama++; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { keluar.push({ t: '-', x: A[i] }); kurang++; i++; }
      else { keluar.push({ t: '+', x: B[j] }); tambah++; j++; }
    }
    while (i < n) { keluar.push({ t: '-', x: A[i++] }); kurang++; }
    while (j < m) { keluar.push({ t: '+', x: B[j++] }); tambah++; }
    return { baris: keluar, sama: sama, tambah: tambah, kurang: kurang };
  }
  var diffNanti = null;
  function bukaDiff(judul, isiLama, isiBaru, saatTerima) {
    var d = bedaBaris(isiLama, isiBaru);
    diffNanti = saatTerima;
    $('diffJudul').textContent = judul;
    $('diffHitung').textContent = '+' + d.tambah + ' / −' + d.kurang + ' baris · ' + d.sama + ' sama';
    $('diffIsi').innerHTML = d.baris.map(function (x) {
      return '<div class="diff-baris ' + (x.t === '+' ? 'tambah' : x.t === '-' ? 'kurang' : '') + '">'
        + '<i>' + (x.t === ' ' ? '&nbsp;' : x.t) + '</i><code>' + esc(x.x) + '</code></div>';
    }).join('');
    $('diffModal').hidden = false;
  }
  function tutupDiff() { $('diffModal').hidden = true; diffNanti = null; }

  /* ── 19e. jalur AI Builder (10 langkah) ───────────────────────────── */
  var BGN_LANGKAH = [
    'Memahami permintaan',
    'Menganalisis kebutuhan',
    'Membuat struktur aplikasi',
    'Membuat file',
    'Membuat kode',
    'Menampilkan preview',
    'Menguji aplikasi',
    'Memperbaiki error',
    'Melakukan build',
    'Menyiapkan deployment',
  ];
  var bgnAktifId = null, bgnPath = null, bgnKonsol = [], bgnJejak = [], bgnUji = null, bgnUnduhUrl = '';
  function bgnJejakBaru() { bgnJejak = BGN_LANGKAH.map(function (t) { return { t: t, s: 'menunggu' }; }); }
  function bgnTandai(i, s) { if (bgnJejak[i]) bgnJejak[i].s = s; }
  function bgnRenderJejak() {
    var el = $('bgnJejak'); if (!el) return;
    el.innerHTML = bgnJejak.map(function (l, i) {
      return '<li class="' + (l.s === 'beres' ? 'beres' : l.s === 'kini' ? 'kini' : l.s === 'galat' ? 'galat' : '') + '">'
        + '<i>' + (l.s === 'beres' ? '✓' : l.s === 'galat' ? '!' : (i + 1)) + '</i><span>' + esc(l.t) + '</span></li>';
    }).join('');
  }
  function bgnKonsolTambah(t, teks) {
    bgnKonsol.push({ t: t, teks: String(teks).slice(0, 400), ts: Date.now() });
    if (bgnKonsol.length > 200) bgnKonsol.shift();
    bgnRenderKonsol();
  }
  function bgnRenderKonsol() {
    var el = $('bgnKonsol'); if (!el) return;
    var hitung = { log: 0, warn: 0, error: 0, runtime: 0, net: 0 };
    bgnKonsol.forEach(function (x) { hitung[x.t] = (hitung[x.t] || 0) + 1; });
    var kepala = $('bgnKonsolHitung');
    if (kepala) kepala.textContent = 'console ' + (hitung.log || 0) + ' · peringatan ' + (hitung.warn || 0) + ' · console error ' + (hitung.error || 0) + ' · runtime error ' + (hitung.runtime || 0) + ' · jaringan ' + (hitung.net || 0);
    el.innerHTML = bgnKonsol.length ? bgnKonsol.slice(-60).map(function (x) {
      return '<div class="konsol-baris ' + x.t + '"><i>' + esc(x.t) + '</i><span>' + esc(x.teks) + '</span></div>';
    }).join('') : '<p class="note">Belum ada keluaran. Tekan Jalankan untuk menguji di pratinjau.</p>';
  }
  function bgnRenderPratinjau() {
    var b = bgnAktif(); var kotak = $('bgnPratinjau'); if (!kotak || !b) return;
    var d = bgnDokumen(b, bgnPath && /\.html?$/i.test(bgnPath) ? bgnPath : 'index.html');
    d.catatan.forEach(function (c) { bgnKonsolTambah('warn', c); });
    kotak.srcdoc = d.dokumen;
    bgnStatusBuild('Pratinjau siap · ' + (b.berkas || []).length + ' berkas · ' + kb(d.dokumen.length) + ' dokumen');
  }
  function bgnStatusBuild(teks) { var el = $('bgnStatus'); if (el) el.textContent = teks; }
  var bgnLebar = 'fit';
  function bgnTerapkanLebar() {
    var el = $('bgnPratinjau'); if (!el) return;
    var peta = { fit: '100%', desktop: '1280px', tablet: '834px', mobile: '390px' };
    el.style.width = peta[bgnLebar] || '100%';
    document.querySelectorAll('#bgnLebar button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === bgnLebar); });
  }
  function bgnRenderSemua() {
    var b = bgnAktif();
    if (!b) return;
    $('bgnNama').textContent = b.nama;
    $('bgnDesk').textContent = b.deskripsi || '';
    $('bgnPohon').innerHTML = bgnPohon(b);
    var f = bgnPath ? bgnBerkas(b, bgnPath) : null;
    $('bgnKode').textContent = f ? f.isi : '(pilih berkas di kiri)';
    $('bgnPath').textContent = bgnPath || '—';
    $('bgnKodeBaris').textContent = f ? String(f.isi).split('\n').length + ' baris' : '';
    bgnRenderJejak(); bgnRenderKonsol(); bgnTerapkanLebar();
  }
  function parseProyekAI(teks) {
    var t = String(teks || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    var mulai = t.indexOf('{'), akhir = t.lastIndexOf('}');
    if (mulai < 0 || akhir < 0) throw new Error('AI tidak mengembalikan struktur proyek');
    var j = JSON.parse(t.slice(mulai, akhir + 1));
    var berkas = (j.berkas || j.files || []).map(function (f) {
      return { path: String(f.path || f.nama || '').replace(/^\.?\//, ''), isi: String(f.isi == null ? f.content || '' : f.isi) };
    }).filter(function (f) { return f.path; });
    if (!berkas.length) throw new Error('tidak ada berkas dalam jawaban AI');
    if (!berkas.some(function (f) { return /index\.html?$/i.test(f.path); })) {
      berkas.unshift({ path: 'index.html', isi: '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + (j.nama || 'Proyek') + '</title></head><body><h1>' + (j.nama || 'Proyek') + '</h1><p>Proyek ini belum punya index.html — tambahkan lewat tombol Buat file.</p></body></html>' });
    }
    return { nama: String(j.nama || 'Proyek Builder').slice(0, 60), deskripsi: String(j.deskripsi || '').slice(0, 300), berkas: berkas.slice(0, 24) };
  }
  function bgnBangun(prompt) {
    bgnJejakBaru();
    bgnKonsol = [];
    bgnTandai(0, 'kini'); bgnRenderJejak();
    bgnStatusBuild('Memahami permintaan…');
    var t0 = Date.now();
    var proyekId = SET.proyekAktif || null;
    mintaTeks('Kamu AI Builder di Van Chat.SPY. Bangun proyek web dari permintaan berikut.\n\n'
      + 'PERMINTAAN: ' + prompt + '\n\n'
      + 'Balas HANYA JSON valid (tanpa penjelasan, tanpa pagar kode) dengan bentuk:\n'
      + '{"nama":"...","deskripsi":"...","berkas":[{"path":"index.html","isi":"<!doctype html>…"},{"path":"styles.css","isi":"…"},{"path":"app.js","isi":"…"}]}\n'
      + 'Aturan: 3–8 berkas, index.html wajib dan harus bisa dibuka langsung, gunakan CSS/JS terpisah, bahasa antarmuka Indonesia, jangan memakai tautan CDN eksternal, jangan memakai emoji.', 'expert')
      .then(function (teks) {
        bgnTandai(0, 'beres'); bgnTandai(1, 'kini'); bgnRenderJejak();
        bgnStatusBuild('Menganalisis kebutuhan…');
        var p = parseProyekAI(teks);
        bgnTandai(1, 'beres'); bgnTandai(2, 'kini'); bgnRenderJejak();
        bgnStatusBuild('Membuat struktur aplikasi…');
        var b = {
          id: uid(), nama: p.nama, deskripsi: p.deskripsi, berkas: p.berkas,
          dibuat: Date.now(), diubah: Date.now(), proyekId: proyekId, prompt: prompt,
        };
        bgnDaftar().unshift(b);
        bgnAktifId = b.id; bgnPath = (p.berkas.filter(function (f) { return /index\.html?$/i.test(f.path); })[0] || p.berkas[0]).path;
        simpanSet();
        bgnTandai(2, 'beres'); bgnTandai(3, 'kini'); bgnRenderJejak();
        setTimeout(function () {
          bgnTandai(3, 'beres'); bgnTandai(4, 'beres'); bgnTandai(5, 'kini'); bgnRenderJejak();
          tampilHalaman('builder');
          bgnRenderSemua();
          bgnRenderPratinjau();
          bgnTandai(5, 'beres'); bgnTandai(6, 'kini'); bgnRenderJejak();
          bgnStatusBuild('Menguji aplikasi…');
          var hasil = bgnUjiStatik(b);
          bgnUji = hasil;
          bgnTandai(6, hasil.gagal ? 'galat' : 'beres');
          if (hasil.gagal) {
            bgnTandai(7, 'kini');
            bgnStatusBuild('Ada ' + hasil.gagal + ' masalah — tekan Perbaiki error untuk meminta AI membetulkan.');
          } else {
            bgnTandai(7, 'beres');
            bgnTandai(8, 'kini');
            bgnStatusBuild('Build: ' + (b.berkas || []).length + ' berkas · ' + kb(JSON.stringify(b.berkas).length) + ' siap');
            bgnTandai(8, 'beres');
            bgnTandai(9, 'siap');
            bgnStatusBuild('Siap deploy — unduh ZIP atau hubungkan penyedia deploy di Pengaturan.');
          }
          catat('sistem', 'AI Builder selesai membuat proyek “' + esc(b.nama) + '” (' + (b.berkas || []).length + ' berkas) dalam ' + ((Date.now() - t0) / 1000).toFixed(1) + ' detik.');
          toast('Proyek “' + b.nama + '” selesai dibangun', 'ok');
        }, 60);
      })
      .catch(function (e) {
        bgnTandai(0, 'galat'); bgnRenderJejak();
        bgnStatusBuild('Gagal membangun: ' + ((e && e.message) || e));
        toast('Builder gagal: ' + ((e && e.message) || e), 'err');
      });
  }
  function bgnUjiStatik(b) {
    var hasil = [];
    var html = (b.berkas || []).filter(function (f) { return /index\.html?$/i.test(f.path); })[0];
    hasil.push({ nama: 'index.html ada', lolos: !!html, ket: html ? html.path : 'tidak ditemukan' });
    if (html) {
      var isi = String(html.isi || '');
      hasil.push({ nama: 'index.html punya doctype', lolos: /<!doctype html>/i.test(isi) });
      hasil.push({ nama: 'punya meta viewport (ponsel)', lolos: /name=["']viewport["']/i.test(isi) });
      hasil.push({ nama: 'punya <title>', lolos: /<title>[^<]+<\/title>/i.test(isi) });
      var kurang = [];
      (isi.match(/(?:href|src)=["']([^"':]+\.(?:css|js))["']/gi) || []).forEach(function (m) {
        var rel = m.replace(/^(?:href|src)=["']/i, '').replace(/["']$/, '');
        if (!bgnBerkas(b, rel)) kurang.push(rel);
      });
      hasil.push({ nama: 'semua berkas yang dirujuk ada', lolos: !kurang.length, ket: kurang.join(', ') });
    }
    (b.berkas || []).forEach(function (f) {
      if (/\.js$/i.test(f.path)) {
        var lolos = true, pesan = '';
        try { new Function(String(f.isi)); } catch (e) { lolos = false; pesan = String(e.message).slice(0, 80); }
        hasil.push({ nama: 'sintaks JS: ' + f.path, lolos: lolos, ket: pesan });
      }
      if (/\.css$/i.test(f.path)) {
        var buka = (String(f.isi).match(/\{/g) || []).length, tutup = (String(f.isi).match(/\}/g) || []).length;
        hasil.push({ nama: 'kurung CSS seimbang: ' + f.path, lolos: buka === tutup, ket: buka + ' { vs ' + tutup + ' }' });
      }
    });
    var galatRuntime = bgnKonsol.filter(function (x) { return x.t === 'runtime'; });
    hasil.push({ nama: 'tanpa runtime error di pratinjau', lolos: !galatRuntime.length, ket: galatRuntime.length ? galatRuntime[0].teks.slice(0, 80) : '' });
    return { hasil: hasil, gagal: hasil.filter(function (h) { return !h.lolos; }).length, total: hasil.length };
  }
  function bgnRenderUji() {
    var el = $('bgnUji'); if (!el) return;
    if (!bgnUji) { el.innerHTML = '<p class="note">Belum diuji.</p>'; return; }
    el.innerHTML = '<p class="note">' + (bgnUji.gagal ? bgnUji.gagal + ' dari ' + bgnUji.total + ' pemeriksaan gagal' : 'Semua ' + bgnUji.total + ' pemeriksaan lolos') + '</p>'
      + '<div class="mini-list">' + bgnUji.hasil.map(function (h) {
        return '<div class="mini-it"><span><b>' + (h.lolos ? '✓' : '✗') + ' ' + esc(h.nama) + '</b>' + (h.ket ? '<small>' + esc(h.ket) + '</small>' : '') + '</span></div>';
      }).join('') + '</div>';
  }
  function bgnPerbaikiError() {
    var b = bgnAktif(); if (!b) return;
    var f = bgnPath ? bgnBerkas(b, bgnPath) : null;
    if (!f) { toast('Pilih berkas yang mau diperbaiki', 'err'); return; }
    var galat = bgnUji ? bgnUji.hasil.filter(function (h) { return !h.lolos; }).map(function (h) { return h.nama + (h.ket ? ' (' + h.ket + ')' : ''); }).join('\n') : '(belum ada hasil uji)';
    toast('Meminta AI memperbaiki ' + f.path + '…');
    mintaTeks('Perbaiki berkas berikut. Balas HANYA isi berkas yang sudah diperbaiki, tanpa penjelasan dan tanpa pagar kode.\n\n'
      + 'NAMA BERKAS: ' + f.path + '\nHASIL UJI YANG GAGAL:\n' + galat + '\n\nISI BERKAS SEKARANG:\n' + String(f.isi).slice(0, 12000), 'expert')
      .then(function (baru) {
        bukaDiff('Perbaikan ' + f.path, f.isi, baru, function () {
          bgnTulis(b, f.path, baru);
          bgnRenderSemua(); bgnRenderPratinjau();
          setTimeout(function () { bgnUji = bgnUjiStatik(b); bgnRenderUji(); bgnRenderSemua(); tampilHalaman('builder'); }, 600);
          toast('Perbaikan diterapkan', 'ok');
        });
      })
      .catch(function (e) { toast('Gagal memperbaiki: ' + ((e && e.message) || e), 'err'); });
  }
  function bgnRefactor() {
    var b = bgnAktif(); var f = bgnPath ? bgnBerkas(b, bgnPath) : null;
    if (!f) { toast('Pilih berkas dulu', 'err'); return; }
    toast('Meminta AI merapikan kode…');
    mintaTeks('Rapikan (refactor) berkas berikut tanpa mengubah perilaku: nama variabel jelas, buang pengulangan, tambah komentar singkat pada bagian penting. Balas HANYA isi berkas hasil, tanpa penjelasan.\n\n' + String(f.isi).slice(0, 12000), 'expert')
      .then(function (baru) { bukaDiff('Refactor ' + f.path, f.isi, baru, function () { bgnTulis(b, f.path, baru); bgnRenderSemua(); bgnRenderPratinjau(); toast('Refactor diterapkan', 'ok'); }); })
      .catch(function (e) { toast('Refactor gagal: ' + ((e && e.message) || e), 'err'); });
  }
  function bgnDebug() {
    var b = bgnAktif(); if (!b) return;
    var galat = bgnKonsol.filter(function (x) { return x.t === 'runtime' || x.t === 'error'; }).map(function (x) { return x.t + ': ' + x.teks; }).slice(0, 10).join('\n');
    if (!galat) { toast('Belum ada galat yang tercatat di konsol', 'warn'); return; }
    toast('AI sedang menelusuri galat…');
    mintaTeks('Ini galat dari pratinjau proyek web. Sebutkan penyebab paling mungkin dan cara memperbaikinya secara singkat (maksimal 6 baris, bahasa Indonesia).\n\nGALAT:\n' + galat, 'expert')
      .then(function (jawab) { catat('sistem', 'Hasil debug AI Builder:<br><pre class="pre-inline">' + esc(jawab) + '</pre>'); toast('Saran perbaikan dikirim ke percakapan', 'ok'); })
      .catch(function (e) { toast('Debug gagal: ' + ((e && e.message) || e), 'err'); });
  }
  function bgnTest() {
    var b = bgnAktif(); if (!b) return;
    bgnKonsol = [];
    bgnRenderPratinjau();
    setTimeout(function () {
      bgnUji = bgnUjiStatik(b);
      bgnRenderUji(); bgnRenderKonsol();
      bgnStatusBuild(bgnUji.gagal ? 'Uji: ' + bgnUji.gagal + ' masalah ditemukan' : 'Uji: semua ' + bgnUji.total + ' pemeriksaan lolos');
      tampilHalaman('builder');
      toast(bgnUji.gagal ? bgnUji.gagal + ' masalah ditemukan' : 'Uji selesai — semua lolos', bgnUji.gagal ? 'warn' : 'ok');
    }, 900);
  }
  function bgnBuild() {
    var b = bgnAktif(); if (!b) return;
    var urut = ['Mempersiapkan…', 'Membangun…', 'Menjalankan test…', 'Berhasil…', 'Siap deploy.'];
    var i = 0;
    (function jalan() {
      if (i >= urut.length) { bgnRenderUji(); tampilHalaman('builder'); return; }
      bgnStatusBuild(urut[i]);
      var el = $('bgnStatus'); if (el) el.textContent = urut[i];
      if (i === 2) { bgnUji = bgnUjiStatik(b); }
      i++;
      setTimeout(function () { jalan(); }, 420);
    })();
  }
  function bgnUnduhZip() {
    var b = bgnAktif(); if (!b) return;
    var blob = buatZip((b.berkas || []).map(function (f) { return { path: f.path, isi: f.isi }; }));
    unduhBlob(b.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.zip', blob);
    toast('ZIP ' + kb(blob.size) + ' diunduh — siap diunggah ke hosting', 'ok');
  }
  function bgnDeploy() {
    var b = bgnAktif(); if (!b) return;
    bgnStatusBuild('Menyiapkan deployment…');
    fetch('/api/deploy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ berkas: (b.berkas || []).map(function (f) { return { path: f.path, isi: f.isi }; }) })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.ok) {
        bgnStatusBuild('Berhasil dipasang: ' + j.url);
        catat('sistem', 'Deployment berhasil: <a href="' + esc(j.url) + '" target="_blank" rel="noopener">' + esc(j.url) + '</a>');
        toast('Website dipasang di ' + j.url, 'ok');
      } else {
        bgnStatusBuild('Deployment belum aktif — memakai jalur ZIP.');
        toast(j.pesan || 'Deployment belum aktif', 'warn');
        catat('sistem', 'Deployment otomatis belum aktif: ' + esc(j.pesan || '') + ' Unduh ZIP dari halaman Builder lalu unggah ke hosting pilihanmu.');
      }
    }).catch(function (e) { toast('Server deploy tidak terjawab: ' + ((e && e.message) || e), 'err'); });
  }

  /* ── 19f. halaman BUILDER ─────────────────────────────────────────── */
  HAL.builder = {
    judul: 'AI Builder',
    sub: function () { var b = bgnAktif(); return b ? (b.nama + ' · ' + (b.berkas || []).length + ' berkas') : 'belum ada proyek'; },
    aksi: function () {
      return '<button class="btn" id="bgnBaru">' + ic('plus', 15) + 'Proyek baru</button>'
        + '<button class="btn" id="bgnZip">' + ic('download', 15) + 'Unduh ZIP</button>'
        + '<button class="btn pr" id="bgnDeploy">' + ic('upload', 15) + 'Deploy</button>';
    },
    gambar: function () {
      var b = bgnAktif();
      var daftarProyek = bgnDaftar().length
        ? '<div class="bgn-pilih">' + bgnDaftar().map(function (x) {
          return '<button class="chip' + (b && x.id === b.id ? ' on' : '') + '" data-bgn-pilih="' + x.id + '">' + ic('code', 14) + esc(x.nama) + '</button>';
        }).join('') + '</div>' : '';
      return ''
        + '<section class="hal-sec bgn-mulai">'
        + '<h3>' + ic('hammer', 16) + 'Buat website / aplikasi dari perintah bahasa</h3>'
        + '<textarea id="bgnPrompt" rows="2" placeholder="Contoh: Buat website streaming anime bernama MIRU.">' + esc(b && b.prompt ? b.prompt : '') + '</textarea>'
        + '<div class="img-aksi bgn-contoh">'
        + ['Buat website streaming anime bernama MIRU.',
          'Buat landing page kedai kopi di Surabaya.',
          'Buat toko online sederhana dengan keranjang.',
          'Buat dashboard admin dengan grafik.',
          'Buat aplikasi catatan dengan pencarian.'].map(function (c) {
            return '<button class="chip-aksi" data-bgn-contoh="' + esc(c) + '">' + ic('sparkles', 14) + esc(c.slice(0, 42)) + '</button>';
          }).join('') + '</div>'
        + '<div class="img-aksi"><button class="btn pr" id="bgnMulai">' + ic('sparkles', 15) + 'Bangun</button>'
        + '<span class="pill-note" id="bgnStatus">' + (b ? 'proyek siap' : 'menunggu perintah') + '</span></div>'
        + daftarProyek
        + '<ol class="bgn-jejak" id="bgnJejak"></ol>'
        + '</section>'
        + (b ? ''
          + '<section class="hal-sec"><h3>' + ic('code', 16) + '<span id="bgnNama">' + esc(b.nama) + '</span><span class="grow"></span>'
          + '<span class="pill-note" id="bgnDesk">' + esc(b.deskripsi || '') + '</span></h3>'
          + '<div class="bgn-alat">'
          + '<button class="btn" data-bgn-aksi="file">' + ic('file-plus', 14) + 'Buat file</button>'
          + '<button class="btn" data-bgn-aksi="folder">' + ic('folder', 14) + 'Buat folder</button>'
          + '<button class="btn" data-bgn-aksi="edit">' + ic('pencil', 14) + 'Edit + diff</button>'
          + '<button class="btn" data-bgn-aksi="rename">' + ic('square-pen', 14) + 'Ganti nama</button>'
          + '<button class="btn" data-bgn-aksi="pindah">' + ic('move', 14) + 'Pindahkan</button>'
          + '<button class="btn danger" data-bgn-aksi="hapus">' + ic('trash', 14) + 'Hapus</button>'
          + '<button class="btn" data-bgn-aksi="komponen">' + ic('component', 14) + 'Buat komponen</button>'
          + '<button class="btn" data-bgn-aksi="api">' + ic('database', 14) + 'Buat API</button>'
          + '<button class="btn" data-bgn-aksi="refactor">' + ic('wand', 14) + 'Refactor</button>'
          + '<button class="btn" data-bgn-aksi="debug">' + ic('bug', 14) + 'Debug</button>'
          + '<button class="btn" data-bgn-aksi="perbaiki">' + ic('wrench', 14) + 'Perbaiki error</button>'
          + '</div>'
          + '<div class="bgn-grid">'
          + '<div class="bgn-kiri"><div class="bgn-head">Berkas</div><div class="bgn-pohon" id="bgnPohon"></div></div>'
          + '<div class="bgn-tengah">'
          + '<div class="bgn-head">Kode <span id="bgnPath">—</span><span class="grow"></span><span id="bgnKodeBaris" class="pill-note"></span>'
          + '<button class="ib sm" data-bgn-aksi="salin" title="Salin">' + ic('copy', 14) + '</button>'
          + '<button class="ib sm" data-bgn-aksi="unduhsatu" title="Unduh berkas">' + ic('download', 14) + '</button></div>'
          + '<pre class="bgn-kode" id="bgnKode"></pre></div>'
          + '<div class="bgn-kanan">'
          + '<div class="bgn-head">Pratinjau (Live Preview)<span class="grow"></span><div class="seg" id="bgnLebar">'
          + '<button data-v="fit" class="on">Fit</button><button data-v="desktop">Desktop</button><button data-v="tablet">Tablet</button><button data-v="mobile">Mobile</button></div>'
          + '<button class="ib sm" data-bgn-aksi="refresh" title="Muat ulang">' + ic('refresh-cw', 14) + '</button>'
          + '<button class="ib sm" data-bgn-aksi="buka" title="Buka di tab baru">' + ic('external-link', 14) + '</button></div>'
          + '<div class="bgn-frame"><iframe id="bgnPratinjau" sandbox="allow-scripts allow-forms allow-modals" title="Pratinjau builder"></iframe></div>'
          + '<div class="bgn-head">Konsol & Jaringan <span class="grow"></span><span class="pill-note" id="bgnKonsolHitung"></span>'
          + '<button class="ib sm" data-bgn-aksi="bersih" title="Bersihkan">' + ic('trash', 14) + '</button></div>'
          + '<div class="bgn-konsol" id="bgnKonsol"></div>'
          + '</div>'
          + '</div>'
          + '<div class="bgn-hasil"><div><b>Hasil uji</b><div id="bgnUji"></div></div>'
          + '<div class="img-aksi"><button class="btn" data-bgn-aksi="test">' + ic('play', 14) + 'Uji aplikasi</button>'
          + '<button class="btn" data-bgn-aksi="build">' + ic('package', 14) + 'Build</button>'
          + '<button class="btn" data-bgn-aksi="zip">' + ic('download', 14) + 'Unduh ZIP</button>'
          + '<button class="btn pr" data-bgn-aksi="deploy">' + ic('upload', 14) + 'Deploy</button></div></div>'
          + '</section>' : '');
    },
    pasang: function () {
      bgnRenderJejak(); bgnRenderUji();
      if (bgnAktif()) { bgnRenderSemua(); bgnRenderPratinjau(); }
      var mulai = $('bgnMulai');
      if (mulai) mulai.addEventListener('click', function () {
        var p = $('bgnPrompt').value.trim();
        if (!p) { toast('Tulis dulu perintahnya', 'err'); return; }
        bgnBangun(p);
      });
      var bar = $('bgnBaru');
      if (bar) bar.addEventListener('click', function () {
        var nama = prompt('Nama proyek builder baru:', 'proyek-baru');
        if (!nama || !nama.trim()) return;
        var b = { id: uid(), nama: nama.trim().slice(0, 60), deskripsi: 'Proyek kosong', berkas: [{ path: 'index.html', isi: '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + nama.trim() + '</title></head><body><h1>' + nama.trim() + '</h1></body></html>' }], dibuat: Date.now(), diubah: Date.now(), proyekId: SET.proyekAktif || null };
        bgnDaftar().unshift(b); bgnAktifId = b.id; bgnPath = 'index.html'; simpanSet(); tampilHalaman('builder');
        toast('Proyek builder dibuat', 'ok');
      });
      var zip = $('bgnZip'); if (zip) zip.addEventListener('click', bgnUnduhZip);
      var dep = $('bgnDeploy'); if (dep) dep.addEventListener('click', bgnDeploy);
      $('halBody').addEventListener('click', function (e) {
        var pick = e.target.closest('[data-bgn-pilih]');
        if (pick) { bgnAktifId = pick.dataset.bgnPilih; var bb = bgnAktif(); bgnPath = bb && bb.berkas[0] ? bb.berkas[0].path : null; tampilHalaman('builder'); return; }
        var contoh = e.target.closest('[data-bgn-contoh]');
        if (contoh) { $('bgnPrompt').value = contoh.dataset.bgnContoh; toast('Perintah contoh diisi — tekan Bangun'); return; }
        var buka = e.target.closest('[data-bgn-buka]');
        if (buka) { bgnPath = buka.dataset.bgnBuka; tampilHalaman('builder'); return; }
        var lebar = e.target.closest('#bgnLebar button');
        if (lebar) { bgnLebar = lebar.dataset.v; bgnTerapkanLebar(); return; }
        var aksi = e.target.closest('[data-bgn-aksi]');
        if (aksi) { bgnAksi(aksi.dataset.bgnAksi); return; }
      });
    }
  };
  function bgnAksi(aksi) {
    var b = bgnAktif();
    if (aksi === 'file') {
      if (!b) return;
      var nama = prompt('Nama berkas baru (boleh berfolder, contoh: komponen/kartu.html):', 'baru.html');
      if (!nama || !nama.trim()) return;
      var p = nama.trim().replace(/^\/+/, '');
      if (bgnBerkas(b, p)) { toast('Berkas sudah ada', 'err'); return; }
      bukaDiff('Berkas baru: ' + p, '', '', function () { bgnTulis(b, p, ''); bgnPath = p; bgnRenderSemua(); toast('Berkas dibuat', 'ok'); });
      return;
    }
    if (aksi === 'folder') {
      if (!b) return;
      var d = prompt('Nama folder:', 'komponen');
      if (!d || !d.trim()) return;
      bgnTulis(b, d.trim().replace(/\/+$/, '') + '/.gitkeep', '');
      bgnRenderSemua(); toast('Folder dibuat (penanda .gitkeep)', 'ok');
      return;
    }
    if (aksi === 'edit') {
      if (!b || !bgnPath) { toast('Pilih berkas dulu', 'err'); return; }
      var f = bgnBerkas(b, bgnPath);
      $('editorJudul').textContent = 'Edit ' + bgnPath;
      $('editorIsi').value = String(f.isi || '');
      $('editModal').hidden = false;
      return;
    }
    if (aksi === 'rename') {
      if (!b || !bgnPath) return;
      var baru = prompt('Nama baru:', bgnPath);
      if (!baru || !baru.trim()) return;
      var f2 = bgnBerkas(b, bgnPath);
      bgnHapus(b, bgnPath); bgnTulis(b, baru.trim(), f2.isi); bgnPath = baru.trim();
      bgnRenderSemua(); toast('Nama berkas diganti', 'ok');
      return;
    }
    if (aksi === 'pindah') {
      if (!b || !bgnPath) return;
      var tujuan = prompt('Pindahkan ke (tulis folder tujuan atau nama baru):', bgnPath);
      if (!tujuan || !tujuan.trim() || tujuan === bgnPath) return;
      var f3 = bgnBerkas(b, bgnPath);
      bgnHapus(b, bgnPath); bgnTulis(b, tujuan.trim(), f3.isi); bgnPath = tujuan.trim();
      bgnRenderSemua(); toast('Berkas dipindahkan', 'ok');
      return;
    }
    if (aksi === 'hapus') {
      if (!b || !bgnPath) return;
      if (!confirm('Hapus ' + bgnPath + ' dari proyek?')) return;
      bukaDiff('Hapus ' + bgnPath, String(bgnBerkas(b, bgnPath).isi || ''), '', function () {
        bgnHapus(b, bgnPath); bgnPath = (b.berkas[0] || {}).path || null; bgnRenderSemua(); toast('Berkas dihapus', 'ok');
      });
      return;
    }
    if (aksi === 'komponen') {
      if (!b) return;
      var n = prompt('Nama komponen:', 'kartu-produk');
      if (!n || !n.trim()) return;
      var basis = n.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
      var isi = '<article class="komponen-' + basis + '">\n  <h3>Judul komponen</h3>\n  <p>Isi komponen.</p>\n</article>\n<style>\n  .komponen-' + basis + ' { border: 1px solid #e2e2e8; border-radius: 12px; padding: 14px; }\n</style>\n';
      bukaDiff('Komponen baru: komponen/' + basis + '.html', '', isi, function () {
        bgnTulis(b, 'komponen/' + basis + '.html', isi); bgnPath = 'komponen/' + basis + '.html'; bgnRenderSemua(); toast('Komponen dibuat', 'ok');
      });
      return;
    }
    if (aksi === 'api') {
      if (!b) return;
      var na = prompt('Nama endpoint API (tanpa /api/):', 'produk');
      if (!na || !na.trim()) return;
      var nn = na.trim().replace(/[^a-z0-9-]/g, '');
      var kode = '// api/' + nn + '.js — contoh fungsi backend (gaya Vercel/Edge)\n'
        + 'export default async function handler(request) {\n'
        + '  const url = new URL(request.url);\n'
        + '  const q = (url.searchParams.get("q") || "").slice(0, 200);\n'
        + '  return new Response(JSON.stringify({ ok: true, q, data: [] }), {\n'
        + '    headers: { "Content-Type": "application/json" },\n'
        + '  });\n'
        + '}\n';
      bukaDiff('API baru: api/' + nn + '.js', '', kode, function () {
        bgnTulis(b, 'api/' + nn + '.js', kode); bgnPath = 'api/' + nn + '.js'; bgnRenderSemua(); toast('Berkas API dibuat', 'ok');
      });
      return;
    }
    if (aksi === 'refactor') { bgnRefactor(); return; }
    if (aksi === 'debug') { bgnDebug(); return; }
    if (aksi === 'perbaiki') { bgnPerbaikiError(); return; }
    if (aksi === 'test') { bgnTest(); return; }
    if (aksi === 'build') { bgnBuild(); bgnStatusBuild('Mempersiapkan…'); return; }
    if (aksi === 'zip') { bgnUnduhZip(); return; }
    if (aksi === 'deploy') { bgnDeploy(); return; }
    if (aksi === 'salin') { var f4 = b && bgnPath ? bgnBerkas(b, bgnPath) : null; if (f4) salin(String(f4.isi), null); return; }
    if (aksi === 'unduhsatu') {
      var f5 = b && bgnPath ? bgnBerkas(b, bgnPath) : null;
      if (f5) unduh(bgnPath.split('/').pop(), f5.isi, 'text/plain');
      return;
    }
    if (aksi === 'refresh') { bgnKonsol = []; bgnRenderPratinjau(); toast('Pratinjau dimuat ulang'); return; }
    if (aksi === 'bersih') { bgnKonsol = []; bgnRenderKonsol(); return; }
    if (aksi === 'buka') {
      var f6 = b && bgnPath ? bgnBerkas(b, bgnPath) : null;
      var d = bgnDokumen(b, bgnPath && /\.html?$/i.test(bgnPath) ? bgnPath : 'index.html');
      var w = window.open('', '_blank');
      if (w) { w.document.write(d.dokumen); w.document.close(); } else toast('Jendela baru diblokir browser', 'err');
      return;
    }
  }

  /* ── 19g. studio gambar ───────────────────────────────────────────── */
  var imgRasio = '1:1', imgKualitas = 'standar', imgTerakhir = null, imgPromptTerakhir = '';
  function imgSiapkan() {
    var s = SET.penyedia && SET.penyedia.gambar;
    $('imgStatus').textContent = s && s.siap ? ('siap · ' + (s.penyedia || '') + ' · ' + (s.model || '')) : 'bukti kunci — memakai fallback SVG';
    $('imgCatatan').innerHTML = s && s.siap
      ? 'Penyedia gambar aktif. Hasilnya bisa disimpan ke pustaka, diunduh, atau dimasukkan ke proyek.'
      : 'Pembuat gambar AI belum aktif (butuh IMAGE_PROVIDER + IMAGE_API_KEY milikmu). Sambil menunggu, tombol <b>Buat gambar</b> akan menawarkan gambar <b>SVG</b> yang benar-benar jadi berkas — bukan gambar palsu.';
  }
  function bukaStudioGambar(promptAwal) {
    $('imgStudio').hidden = false;
    if (promptAwal) $('imgPrompt').value = promptAwal;
    imgSiapkan();
    if (!SET.penyedia) muatPenyedia().then(imgSiapkan);
  }
  function imgBuat(ulang) {
    var prompt = $('imgPrompt').value.trim();
    if (!prompt) { toast('Tulis dulu prompt gambarnya', 'err'); return; }
    if (ulang && imgPromptTerakhir) prompt = imgPromptTerakhir;
    imgPromptTerakhir = prompt;
    $('imgStatus').textContent = 'membuat gambar…';
    $('imgHasil').innerHTML = kerangka(4, 16);
    fetch('/api/image/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt, rasio: imgRasio, kualitas: imgKualitas })
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); }).then(function (h) {
      var j = h.j;
      if (j.ok && j.gambar) {
        imgTerakhir = { dataUrl: j.gambar, prompt: prompt, rasio: j.rasio, kualitas: j.kualitas, model: j.model, penyedia: j.penyedia };
        $('imgHasil').innerHTML = '<img src="' + j.gambar + '" alt="' + esc(prompt) + '">';
        ['imgSimpan', 'imgUnduh', 'imgProyek'].forEach(function (i) { $(i).disabled = false; });
        $('imgStatus').textContent = (j.penyedia || 'penyedia') + ' · ' + (j.ms || 0) + ' ms';
        catat('sistem', 'Gambar dibuat dengan ' + esc(j.penyedia || 'penyedia') + ' (' + esc(j.rasio || imgRasio) + ', ' + esc(j.kualitas || imgKualitas) + '). Tekan Simpan ke pustaka untuk menyimpannya.');
        toast('Gambar selesai dibuat', 'ok');
        return;
      }
      /* penyedia belum aktif → jalur jujur: gambar sebagai kode SVG */
      $('imgHasil').innerHTML = '<div class="img-kosong">' + esc(j.pesan || 'Penyedia gambar belum aktif.') + '</div>';
      $('imgStatus').textContent = 'penyedia gambar belum aktif';
      ['imgSimpan', 'imgUnduh', 'imgProyek'].forEach(function (i) { $(i).disabled = true; });
      if ((j.butuhKunci || h.status === 501) && confirm((j.pesan || 'Penyedia gambar belum aktif.') + '\n\nBuat gambar sebagai kode SVG sekarang? (benar-benar jadi berkas, bisa diunduh & masuk pustaka)')) imgSvg(prompt);
    }).catch(function (e) {
      $('imgStatus').textContent = 'gagal menghubungi server';
      $('imgHasil').innerHTML = '<div class="img-kosong">' + esc(String(e && e.message)) + '</div>';
    });
  }
  function imgSvg(prompt) {
    $('imgStatus').textContent = 'menulis SVG…';
    mintaTeks('Buat ilustrasi sebagai kode SVG murni (tanpa penjelasan, tanpa pagar kode) untuk: ' + prompt
      + '\n\nSyarat: satu tag <svg> dengan viewBox, ukuran maksimal 900x600, memakai bentuk dasar (rect, circle, path, text), tanpa gambar eksternal, tanpa <script>.', 'expert')
      .then(function (svg) {
        var bersih = String(svg).replace(/^```(?:svg|xml|html)?/i, '').replace(/```$/, '').trim();
        if (!/<svg/i.test(bersih)) throw new Error('jawaban AI bukan SVG');
        imgTerakhir = { dataUrl: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(bersih))), prompt: prompt, jenis: 'svg', rasio: imgRasio, kualitas: imgKualitas, penyedia: 'kode SVG (AI)' };
        $('imgHasil').innerHTML = '<div class="img-svg">' + bersih + '</div>';
        ['imgSimpan', 'imgUnduh', 'imgProyek'].forEach(function (i) { $(i).disabled = false; });
        $('imgStatus').textContent = 'SVG siap (vektor)';
        toast('Gambar SVG siap — bisa disimpan ke pustaka', 'ok');
      })
      .catch(function (e) { $('imgStatus').textContent = 'gagal membuat SVG'; toast('Gagal membuat SVG: ' + ((e && e.message) || e), 'err'); });
  }
  function imgSimpanPustaka() {
    if (!imgTerakhir) return;
    var nama = 'gambar-' + uid() + (imgTerakhir.jenis === 'svg' ? '.svg' : '.png');
    var isi = imgTerakhir.jenis === 'svg' ? imgTerakhir.dataUrl.split(',')[1] : imgTerakhir.dataUrl;
    var a = {
      id: uid(), nama: nama, jenis: imgTerakhir.jenis === 'svg' ? 'svg' : 'png',
      kode: imgTerakhir.jenis === 'svg' ? decodeURIComponent(escape(atob(isi))) : imgTerakhir.dataUrl,
      ts: Date.now(), proyekId: SET.proyekAktif || null, tag: ['gambar'],
    };
    SET.berkas.unshift(a);
    if (SET.berkas.length > 60) SET.berkas.pop();
    simpanSet();
    toast('Gambar disimpan ke pustaka', 'ok');
    catat('sistem', 'Gambar disimpan ke pustaka sebagai <b>' + esc(nama) + '</b> — buka /library untuk melihatnya.');
  }

  /* ── 19h. mode suara (STT · AI · TTS) ─────────────────────────────── */
  var suara = {
    sr: null, dengar: false, jalan: false, mute: false, speaker: true, menungguAI: false,
  };
  function suaraStatus(alur, aktif) {
    var el = $('voiceAlur'); if (!el) return;
    var langkah = ['Pengguna bicara', 'Speech Recognition', 'AI', 'Respons AI', 'Text-to-Speech', 'Suara AI'];
    el.innerHTML = langkah.map(function (t, i) {
      return '<span class="' + (i <= alur ? 'on' : '') + (i === alur && aktif ? ' kini' : '') + '">' + esc(t) + '</span>';
    }).join('<i>→</i>');
  }
  function suaraMulaiDengar() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Browser ini belum mendukung pengenalan suara (coba Chrome)', 'err'); return; }
    if (suara.mute || !suara.jalan) return;
    if (!suara.sr) {
      suara.sr = new SR();
      suara.sr.lang = 'id-ID';
      suara.sr.interimResults = true;
      suara.sr.continuous = false;
      suara.sr.onresult = function (e) {
        var teks = '';
        for (var i = e.resultIndex; i < e.results.length; i++) teks += e.results[i][0].transcript;
        $('ta').value = teks;
        perbaruiKirim();
        suaraStatus(1, true);
        if (e.results[e.results.length - 1].isFinal) {
          suara.dengar = false;
          suaraStatus(2, true);
          suara.menungguAI = true;
          $('voiceJudul').textContent = 'Mengirim ke AI…';
          kirim();
        }
      };
      suara.sr.onerror = function (e) { suara.dengar = false; suaraStatus(0, false); if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Pengenalan suara: ' + e.error, 'warn'); };
      suara.sr.onend = function () { suara.dengar = false; if (suara.jalan && !suara.mute && !suara.menungguAI) setTimeout(suaraMulaiDengar, 350); };
    }
    try { suara.sr.start(); suara.dengar = true; suaraStatus(0, true); $('voiceJudul').textContent = 'Mendengarkan…'; } catch (e) { }
  }
  function suaraBicara(teks) {
    if (!suara.speaker) { suaraStatus(3, true); setTimeout(function () { if (suara.jalan) suaraMulaiDengar(); }, 200); return; }
    if (!window.speechSynthesis) { toast('Browser ini tidak punya suara bawaan', 'err'); return; }
    suaraStatus(4, true);
    var u = new SpeechSynthesisUtterance(String(teks).slice(0, 800));
    u.lang = 'id-ID';
    var daftar = speechSynthesis.getVoices() || [];
    var dipilih = SET.suara ? daftar.filter(function (v) { return v.name === SET.suara; })[0] : null;
    if (dipilih) u.voice = dipilih;
    u.onend = function () { suaraStatus(5, true); if (suara.jalan) setTimeout(suaraMulaiDengar, 300); };
    speechSynthesis.speak(u);
  }
  function suaraMulai() {
    suara.jalan = true; suara.mute = false;
    $('voiceBar').hidden = false;
    $('vMulai').classList.add('on');
    $('vJudul') && 0;
    $('voiceJudul').textContent = 'Percakapan suara aktif';
    toast('Mode suara aktif — bicara sekarang', 'ok');
    suaraMulaiDengar();
  }
  function suaraBerhenti() {
    suara.jalan = false; suara.dengar = false; suara.menungguAI = false;
    if (suara.sr) { try { suara.sr.stop(); } catch (e) { } }
    if (window.speechSynthesis) speechSynthesis.cancel();
    suaraStatus(-1, false);
    $('voiceJudul').textContent = 'Percakapan suara berhenti';
    $('vMulai').classList.remove('on');
    toast('Mode suara dihentikan');
  }

  /* ── 19i. pencarian global ────────────────────────────────────────── */
  function indeksCari() {
    var hasil = [];
    sesi.forEach(function (s) {
      hasil.push({ jenis: 'Obrolan', ikon: 'message-square', judul: s.judul, sub: new Date(s.ts).toLocaleDateString('id-ID'), aksi: function () { bukaSesi(s.id); location.hash = '#/'; } });
      (s.messages || []).forEach(function (m) {
        var t = bersihTeks(m.text || '');
        if (t.length > 2) hasil.push({ jenis: 'Pesan', ikon: 'align-left', judul: t.slice(0, 90), sub: s.judul, aksi: function () { bukaSesi(s.id); location.hash = '#/'; setTimeout(function () { var el = document.querySelector('.msg[data-id="' + m.id + '"]'); if (el) el.scrollIntoView({ block: 'center' }); }, 400); } });
      });
    });
    SET.proyek.forEach(function (p) {
      hasil.push({ jenis: 'Proyek', ikon: 'folder', judul: p.nama, sub: p.deskripsi || '', aksi: function () { location.hash = '#/projects'; } });
    });
    semuaBerkas().forEach(function (a) {
      hasil.push({ jenis: 'File', ikon: 'file-text', judul: a.nama, sub: (a.jenis || '') + ' · ' + kb(String(a.kode || '').length), aksi: function () { location.hash = '#/library'; } });
    });
    bgnDaftar().forEach(function (b) {
      hasil.push({ jenis: 'Builder', ikon: 'code', judul: b.nama, sub: (b.berkas || []).length + ' berkas', aksi: function () { bgnAktifId = b.id; location.hash = '#/builder'; } });
    });
    return hasil;
  }
  function bukaPalet() {
    $('cariPal').hidden = false;
    $('palQ').value = ''; $('palQ').focus();
    palGambar('');
  }
  var palData = [];
  function palGambar(q) {
    var semua = indeksCari();
    var t = q.trim().toLowerCase();
    palData = (t ? semua.filter(function (x) { return (x.judul + ' ' + x.sub + ' ' + x.jenis).toLowerCase().indexOf(t) >= 0; }) : semua).slice(0, 60);
    if (!palData.length) { $('palHasil').innerHTML = '<p class="note">Tidak ada hasil untuk “' + esc(q) + '”.</p>'; return; }
    var grup = {};
    palData.forEach(function (x) { grup[x.jenis] = grup[x.jenis] || []; grup[x.jenis].push(x); });
    $('palHasil').innerHTML = Object.keys(grup).map(function (g) {
      return '<div class="palet-grup"><b>' + esc(g) + '</b>' + grup[g].map(function (x, i) {
        var idx = palData.indexOf(x);
        return '<button class="palet-it" data-pal="' + idx + '">' + ic(x.ikon, 15) + '<span><b>' + esc(x.judul) + '</b><small>' + esc(x.sub) + '</small></span></button>';
      }).join('') + '</div>';
    }).join('');
  }

  /* ── 19j. bagikan percakapan ──────────────────────────────────────── */
  var bagiSiapa = 'pribadi', bagiMasa = '7';
  function b64url(t) { return btoa(unescape(encodeURIComponent(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64urlBuka(t) { var s = t.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function muatanBagi() {
    var s = sesiAktif(); if (!s) return null;
    return {
      v: 1, j: s.judul, t: Date.now(),
      kadaluarsa: bagiMasa === '0' ? 0 : Date.now() + parseInt(bagiMasa, 10) * 86400000,
      m: (s.messages || []).slice(0, 60).map(function (m) { return { r: m.role === 'user' ? 'u' : 'a', t: bersihTeks(m.text || '').slice(0, 1200) }; }),
    };
  }
  function bagiBuat() {
    if (bagiSiapa === 'pribadi') {
      $('bagiTautan').value = '';
      $('bagiSalin').disabled = true;
      toast('Mode pribadi: tidak ada tautan dibuat — pakai tombol unduh', 'warn');
      return;
    }
    var m = muatanBagi();
    if (!m) { toast('Belum ada percakapan', 'err'); return; }
    if (!m.m.length) { toast('Percakapan ini masih kosong', 'err'); return; }
    var url = location.origin + location.pathname + '#/bagi=' + b64url(JSON.stringify(m));
    $('bagiTautan').value = url;
    $('bagiSalin').disabled = false;
    $('bagiCatatan').innerHTML = 'Tautan berisi ' + m.m.length + ' pesan · kedaluwarsa: '
      + (m.kadaluarsa ? new Date(m.kadaluarsa).toLocaleString('id-ID') : 'tanpa batas')
      + '. Isi percakapan disandikan di dalam tautan (tidak disimpan di server), jadi siapa pun yang memegangnya bisa membacanya.';
    toast('Tautan dibuat — salin dan kirim', 'ok');
  }
  function bagiHtmlPercakapan() {
    var s = sesiAktif(); if (!s) return;
    var html = '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>' + esc(s.judul) + '</title><style>body{margin:0;background:#0c0c0e;color:#ededf2;font:16px/1.7 system-ui,sans-serif}'
      + '.wrap{max-width:760px;margin:0 auto;padding:36px 20px 70px}h1{font-size:26px;margin:0 0 4px}.meta{color:#8a8a96;font-size:12.5px;margin-bottom:24px}'
      + '.m{border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:12px 14px;margin:12px 0;background:#131317}.m.u{background:#1a1216;border-color:rgba(250,1,2,.35)}'
      + '.who{font-size:11.5px;color:#8a8a96;margin-bottom:6px}pre{white-space:pre-wrap;margin:0;font:inherit}</style></head><body><div class="wrap">'
      + '<h1>' + esc(s.judul) + '</h1><div class="meta">Dibagikan ' + new Date().toLocaleString('id-ID') + ' · Van Chat.SPY</div>'
      + (s.messages || []).map(function (m) {
        return '<div class="m' + (m.role === 'user' ? ' u' : '') + '"><div class="who">' + (m.role === 'user' ? 'Pengguna' : 'Van Chat.SPY') + '</div><pre>' + esc(m.text || '') + '</pre></div>';
      }).join('') + '</div></body></html>';
    unduh('percakapan-' + uid() + '.html', html, 'text/html');
    toast('Percakapan diunduh sebagai HTML', 'ok');
  }
  HAL.share = {
    judul: 'Percakapan dibagikan',
    sub: function () { return 'hanya-baca'; },
    gambar: function () {
      var m = null;
      try { m = JSON.parse(b64urlBuka(String(location.hash).replace(/^#\/bagi=/, ''))); } catch (e) { m = null; }
      if (!m) return '<section class="hal-sec"><h3>Tautan tidak dikenali</h3><p class="note">Isi tautan rusak atau terpotong saat dikirim. Minta pengirim menyalin ulang seluruh tautan.</p></section>';
      if (m.kadaluarsa && Date.now() > m.kadaluarsa) {
        return '<section class="hal-sec"><h3>Tautan sudah kedaluwarsa</h3><p class="note">Masa berlaku berakhir ' + new Date(m.kadaluarsa).toLocaleString('id-ID') + '. Minta pengirim membuat tautan baru.</p></section>';
      }
      return '<section class="hal-sec"><h3>' + esc(m.j || 'Percakapan') + '</h3>'
        + '<p class="note">Dibagikan ' + new Date(m.t).toLocaleString('id-ID') + ' · ' + (m.m || []).length + ' pesan'
        + (m.kadaluarsa ? ' · berlaku sampai ' + new Date(m.kadaluarsa).toLocaleString('id-ID') : ' · tanpa batas waktu') + '</p>'
        + '<div class="bagi-isi">' + (m.m || []).map(function (x) {
          return '<div class="m' + (x.r === 'u' ? ' u' : '') + '"><div class="who">' + (x.r === 'u' ? 'Pengguna' : 'Van Chat.SPY') + '</div><pre>' + esc(x.t) + '</pre></div>';
        }).join('') + '</div>'
        + '<p class="note">Halaman ini hanya-baca. Isi percakapan ada di dalam tautan itu sendiri — tidak ada salinan yang disimpan di server.</p></section>';
    }
  };

  /* ── 19k. penyalaan modul 18–19 ───────────────────────────────────── */
  function mulai18() {
    /* label mode sesuai daftar: Normal · Berpikir · Berpikir Mendalam */
    MODE.fast.label = 'Normal'; MODE.fast.ket = 'Jawaban kilat untuk tanya-jawab harian (~1–3 detik).';
    MODE.think.label = 'Berpikir'; MODE.think.ket = 'Menimbang dulu sebelum menjawab — tulisan & kode lebih rapi.';
    MODE.deep.label = 'Berpikir Mendalam'; MODE.deep.ket = 'Analisis lebih dalam, enak untuk pembahasan panjang.';
    MODE.expert.label = 'Expert (tambahan)'; MODE.expert.ket = 'Model terbesar untuk tugas berat & kode rumit.';

    /* buka menu lewat pintasan baru: Ctrl+Shift+K cari global, Ctrl+Shift+B builder */
    document.addEventListener('keydown', function (e) {
      var meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      var k = e.key.toLowerCase();
      if (k === 'k' && e.shiftKey) { e.preventDefault(); bukaPalet(); }
      else if (k === 'b' && e.shiftKey) { e.preventDefault(); location.hash = location.hash === '#/builder' ? '#/' : '#/builder'; }
      else if (k === 'g' && e.shiftKey) { e.preventDefault(); location.hash = location.hash === '#/settings' ? '#/' : '#/settings'; }
    });
    document.addEventListener('keydown', function (e) {
      if (!$('cariPal').hidden) {
        if (e.key === 'Escape') { $('cariPal').hidden = true; }
        if (e.key === 'Enter') { var it = document.querySelector('#palHasil .palet-it'); if (it) it.click(); }
      }
    });
    $('cariPal').addEventListener('click', function (e) {
      var tutup = e.target.closest('[data-close]'); if (tutup) { $('cariPal').hidden = true; return; }
      var it = e.target.closest('[data-pal]');
      if (it) { var x = palData[parseInt(it.dataset.pal, 10)]; if (x) { $('cariPal').hidden = true; x.aksi(); } }
    });
    $('palQ').addEventListener('input', function () { palGambar(this.value); });

    /* studio gambar */
    $('imgStudio').addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { $('imgStudio').hidden = true; return; }
      var r = e.target.closest('#imgRasio button');
      if (r) { imgRasio = r.dataset.v; [].forEach.call($('imgRasio').children, function (b) { b.classList.toggle('on', b === r); }); return; }
      var q = e.target.closest('#imgKualitas button');
      if (q) { imgKualitas = q.dataset.v; [].forEach.call($('imgKualitas').children, function (b) { b.classList.toggle('on', b === q); }); return; }
    });
    $('imgBuat').addEventListener('click', function () { imgBuat(false); });
    $('imgUlang').addEventListener('click', function () { imgBuat(true); });
    $('imgSimpan').addEventListener('click', imgSimpanPustaka);
    $('imgUnduh').addEventListener('click', function () {
      if (!imgTerakhir) return;
      if (imgTerakhir.jenis === 'svg') unduh('gambar-' + uid() + '.svg', decodeURIComponent(escape(atob(imgTerakhir.dataUrl.split(',')[1]))), 'image/svg+xml');
      else unduhBlob('gambar-' + uid() + '.png', (function () { var b = atob(imgTerakhir.dataUrl.split(',')[1]); var u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new Blob([u], { type: 'image/png' }); })());
    });
    $('imgProyek').addEventListener('click', function () {
      if (!SET.proyek.length) { toast('Belum ada proyek — buat dulu di halaman Proyek', 'err'); return; }
      imgSimpanPustaka();
      var a = SET.berkas[0];
      if (a) { a.proyekId = SET.proyekAktif || SET.proyek[0].id; simpanSet(); }
      toast('Gambar disimpan & dimasukkan ke proyek', 'ok');
    });

    /* bagikan */
    $('bagiModal').addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { $('bagiModal').hidden = true; return; }
      var s = e.target.closest('#bagiSiapa button');
      if (s) { bagiSiapa = s.dataset.v; [].forEach.call($('bagiSiapa').children, function (b) { b.classList.toggle('on', b === s); }); return; }
      var m = e.target.closest('#bagiMasa button');
      if (m) { bagiMasa = m.dataset.v; [].forEach.call($('bagiMasa').children, function (b) { b.classList.toggle('on', b === m); }); return; }
    });
    $('bagiBuat').addEventListener('click', bagiBuat);
    $('bagiSalin').addEventListener('click', function () { if ($('bagiTautan').value) salin($('bagiTautan').value, this); });
    $('bagiHtml').addEventListener('click', bagiHtmlPercakapan);
    $('bagiJson').addEventListener('click', function () {
      var s = sesiAktif(); if (!s) return;
      unduh('percakapan-' + uid() + '.json', JSON.stringify(s, null, 2), 'application/json');
      toast('Percakapan diunduh sebagai JSON', 'ok');
    });

    /* suara */
    $('vMulai').addEventListener('click', suaraMulai);
    $('vBerhenti').addEventListener('click', suaraBerhenti);
    $('vMute').addEventListener('click', function () {
      suara.mute = !suara.mute;
      this.classList.toggle('on', suara.mute);
      if (suara.mute && suara.sr) { try { suara.sr.stop(); } catch (e) { } }
      $('vMicTx').textContent = suara.mute ? 'Mikrofon mati' : 'Mikrofon';
      toast(suara.mute ? 'Mikrofon dibisukan' : 'Mikrofon aktif lagi');
      if (!suara.mute && suara.jalan) suaraMulaiDengar();
    });
    $('vSpeaker').addEventListener('click', function () {
      suara.speaker = !suara.speaker;
      this.classList.toggle('on', !suara.speaker);
      if (!suara.speaker && window.speechSynthesis) speechSynthesis.cancel();
      toast(suara.speaker ? 'Suara AI aktif' : 'Suara AI dimatikan');
    });
    $('vMic').addEventListener('click', function () {
      suara.jalan = true; suara.mute = false;
      this.classList.toggle('on', suara.dengar);
      $('vMicTx').textContent = suara.dengar ? 'Berhenti dengar' : 'Mikrofon';
      if (suara.dengar && suara.sr) { try { suara.sr.stop(); } catch (e) { } suara.dengar = false; }
      else suaraMulaiDengar();
    });
    /* setelah jawaban AI selesai mengalir → bacakan di mode suara */
    var asliTambah = tambahPesan;
    tambahPesan = function (pesan) {
      var baris = asliTambah.apply(this, arguments);
      if (suara.jalan && suara.menungguAI && pesan && pesan.role === 'ai' && !pesan.streaming) {
        suara.menungguAI = false;
        suaraStatus(3, true);
        suaraBicara(bersihTeks(pesan.text || '').slice(0, 700));
      }
      return baris;
    };

    ruteHalaman();
    muatPenyedia();
    suaraStatus(-1, false);
    if (!SET.bangunan) { SET.bangunan = []; simpanSet(); }
    if (bgnDaftar().length && !bgnAktifId) { bgnAktifId = bgnDaftar()[0].id; }
  }
