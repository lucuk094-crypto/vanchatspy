
  /* ══════════════════════════════════════════════════════════════════════
     17. LENGKAPAN: jenis pesan · aksi pesan · kode (perbesar/jalankan) ·
         pencarian web + sitasi · kotak "+" · kamera · tempel & seret ·
         halaman /library · metadata berkas
     ══════════════════════════════════════════════════════════════════════ */

  /* ── 17a. jenis pesan: sistem · alat · galat ────────────────────────── */
  var JENIS_CATATAN = {
    sistem: { kelas: 'sistem', ikon: 'info', who: 'Sistem' },
    alat: { kelas: 'alat', ikon: 'terminal', who: 'Alat' },
    galat: { kelas: 'galat', ikon: 'alert-triangle', who: 'Galat' },
  };
  function tambahCatatan(pesan) {
    var wadah = pastikanFeed();
    var j = JENIS_CATATAN[pesan.role] || JENIS_CATATAN.sistem;
    var row = document.createElement('div');
    row.className = 'msg catatan ' + j.kelas;
    row.dataset.id = pesan.id;
    row.innerHTML = '<div class="cat-ic">' + ic(j.ikon, 15) + '</div>'
      + '<div class="cat-bd"><div class="cat-who">' + j.who + '<span>' + jam(pesan.ts || Date.now()) + '</span></div>'
      + '<div class="cat-tx">' + (pesan.html != null ? pesan.html : renderMarkdown(pesan.text || '', sesiAktif()).html) + '</div>'
      + '<div class="msg-tools">' + alatPesan(pesan) + '</div></div>';
    wadah.appendChild(row);
    gulirBawah(false);
    return row;
  }
  function catat(role, text, opsi) {
    var s = sesiAktif(); if (!s) return null;
    var pesan = Object.assign({ id: uid(), role: role, text: text, ts: Date.now() }, opsi || {});
    s.messages.push(pesan); simpanSesi();
    return tambahCatatan(pesan);
  }
  /* pesan galat otomatis dari kegagalan yang sudah ada (kuota, jaringan, dll.) */
  function catatGalat(pesanGalat) {
    var teks = String(pesanGalat || '').trim();
    if (!teks) return;
    var s = sesiAktif();
    if (s) {
      var terakhir = s.messages[s.messages.length - 1];
      if (terakhir && terakhir.role === 'galat' && terakhir.text === teks) return;   /* jangan dobel */
    }
    catat('galat', teks);
  }

  /* ── 17b. blok kode: perbesar & jalankan (kotak pasir) ─────────────── */
  var kodeBesar = { kode: '', bahasa: '' };
  function besarKode(kode, bahasa) {
    kodeBesar = { kode: kode, bahasa: bahasa || 'kode' };
    $('kodeJudul').textContent = 'Kode — ' + kode.length.toLocaleString('id-ID') + ' karakter';
    $('kodeLang').textContent = String(bahasa || 'kode').toUpperCase();
    var isi = '';
    var baris = String(kode).replace(/\n$/, '').split('\n');
    var warna = warnai(kode, bahasa);
    baris.forEach(function (b, n) {
      isi += '<span class="ln"><span class="no">' + (n + 1) + '</span><span class="cd">' + (warna.split('\n')[n] || '') + '</span></span>';
    });
    $('kodeIsi').innerHTML = isi;
    $('kodeJalan').hidden = BAHASA_JALAN.indexOf(String(bahasa || '').toLowerCase()) < 0;
    $('kodeModal').hidden = false;
  }
  function dokumenJalan(kode, bahasa) {
    var b = String(bahasa || '').toLowerCase();
    if (b === 'html' || b === 'htm') return kode;
    if (b === 'svg') return '<!doctype html><html><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0f1117">' + kode + '</body></html>';
    if (b === 'css') return '<!doctype html><html><head><style>' + kode + '</style></head><body style="font:16px system-ui;padding:24px"><h2>Contoh halaman</h2><p>Paragraf contoh untuk melihat hasil CSS.</p><button>Tombol</button></body></html>';
    if (b === 'js' || b === 'mjs' || b === 'javascript') return '<!doctype html><html><body style="font:14px ui-monospace,monospace;background:#0f1117;color:#e6e8ee;padding:16px"><div id="keluaran"></div><script>var k=document.getElementById("keluaran");var log=console.log;console.log=function(){var p=document.createElement("pre");p.textContent=Array.prototype.map.call(arguments,function(x){try{return typeof x==="object"?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(" ");k.appendChild(p);log.apply(console,arguments)};window.onerror=function(m){var p=document.createElement("pre");p.style.color="#ff6b6b";p.textContent="Galat: "+m;k.appendChild(p)};try{' + kode + '\\n}catch(e){document.getElementById("keluaran").innerHTML+="<pre style=\\'color:#ff6b6b\\'>Galat: "+(e&&e.message)+"</pre>"}<\\/script></body></html>';
    return kode;
  }
  function jalankanKode(kode, bahasa) {
    var dok = dokumenJalan(kode, bahasa);
    $('runFrame').srcdoc = dok;
    $('runModal').hidden = false;
  }

  /* ── 17c. aksi pesan lanjutan ─────────────────────────────────────── */
  function bagikanPesan(pesan) {
    var teks = String(pesan.text || '').slice(0, 1800);
    if (navigator.share) {
      navigator.share({ title: 'Van Chat.SPY', text: teks }).then(function () { toast('Dibagikan', 'ok'); })
        .catch(function () { /* pengguna membatalkan */ });
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(teks).then(function () { toast('Jawaban disalin untuk dibagikan (browser ini tanpa menu bagikan)', 'ok'); })
        .catch(function () { toast('Gagal menyalin untuk dibagikan', 'err'); });
      return;
    }
    toast('Browser ini belum mendukung membagikan', 'err');
  }
  function cabangkanPesan(pesan) {
    var s = sesiAktif(); if (!s) return;
    var idx = s.messages.indexOf(pesan);
    var sampai = idx >= 0 ? idx + 1 : s.messages.length;
    var lama = s.messages.slice(0, sampai).map(function (m) {
      return { id: uid(), role: m.role, text: m.text, html: m.html, ts: m.ts, model: m.model, ms: m.ms, ref: m.ref, web: m.web, apiText: m.apiText, lampiran: m.lampiran };
    });
    var baru = sesiBaru();
    baru.judul = 'Cabang: ' + (s.judul || 'percakapan');
    baru.messages = lama;
    baru.artifacts = (s.artifacts || []).slice();
    simpanSesi();
    bukaSesi(baru.id);
    gambarRiwayat();
    catat('sistem', 'Percakapan dicabangkan dari "' + (s.judul || 'percakapan') + '" — mulai dari jawaban yang kamu pilih.');
    toast('Dicabangkan ke obrolan baru', 'ok');
  }
  function hapusPesan(row, pesan, s) {
    if (!s) return;
    var idx = s.messages.indexOf(pesan);
    if (idx < 0) return;
    s.messages.splice(idx, 1);
    if (row) row.remove();
    simpanSesi();
    catat('sistem', 'Satu pesan dihapus dari percakapan ini.');
  }
  function ulangiAlat(row, pesan, s) {
    if (!s) return;
    var idx = s.messages.indexOf(pesan);
    var teks = '';
    for (var i = idx - 1; i >= 0; i--) {
      if (s.messages[i].role === 'user') { teks = s.messages[i].text || ''; break; }
    }
    var hasil = alatLokal(teks);
    if (!hasil) { toast('Alat tidak menemukan perhitungan pada pesan itu', 'err'); return; }
    pesan.text = hasil; pesan.ts = Date.now();
    if (row) {
      var tx = row.querySelector('.cat-tx');
      if (tx) tx.innerHTML = renderMarkdown(hasil, s).html;
    }
    simpanSesi();
    toast('Alat dijalankan ulang', 'ok');
  }
  function hapusHasilWeb(tombol) {
    var row = tombol.closest('.msg'), s = sesiAktif();
    if (!row || !s) return;
    var pesan = s.messages.filter(function (m) { return m.id === row.dataset.id; })[0];
    if (!pesan || !pesan.web) return;
    var jumlah = pesan.web.sumber.length;
    pesan.apiText = String(pesan.apiText || pesan.text).replace(/\n\n--- hasil pencarian web[\s\S]*$/, '');
    delete pesan.web;
    var blok = row.querySelector('.web-src');
    if (blok) blok.remove();
    var meta = row.querySelector('.msg-meta');
    if (meta) meta.innerHTML = metaJawaban(pesan).replace(/^<div class="msg-meta">|<\/div>$/g, '');
    simpanSesi();
    toast('Hasil web dihapus dari pesan ini (' + jumlah + ' sumber)', 'ok');
  }

  /* ── 17d. pencarian web + sitasi ──────────────────────────────────── */
  var terakhirCari = { q: '', ts: 0, hasil: null };
  async function cariWeb(q) {
    if (terakhirCari.q === q && Date.now() - terakhirCari.ts < 120000) return terakhirCari.hasil;
    var r = await fetch('/api/search?q=' + encodeURIComponent(q));
    var j = await r.json();
    if (!j.ok) throw new Error(j.pesan || 'pencarian gagal');
    terakhirCari = { q: q, ts: Date.now(), hasil: j };
    return j;
  }
  function blokSumberWeb(web) {
    var isi = web.sumber.map(function (s, i) {
      return '<li><span class="cit">[' + (i + 1) + ']</span> <a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.judul) + '</a>'
        + '<small>' + esc(s.penyedia) + (s.jenis ? ' · ' + esc(s.jenis) : '') + '</small>'
        + (s.cuplikan ? '<p>' + esc(s.cuplikan.slice(0, 200)) + '</p>' : '') + '</li>';
    }).join('');
    return '<div class="web-src"><div class="web-hd"><span data-ic="globe" data-ic-size="14"></span><b>Sumber web (' + web.sumber.length + ')</b>'
      + '<small>kata kunci: ' + esc(web.q) + '</small><span class="grow"></span>'
      + '<button class="kb-btn" data-hapusweb="1" title="Hapus hasil web dari pesan ini">' + ic('x', 13) + '<span>Hapus hasil Web</span></button></div>'
      + '<ol>' + isi + '</ol></div>';
  }
  function pasangHasilWeb(row, web) {
    var bd = row.querySelector('.msg-bd'); if (!bd) return;
    var tunggu = bd.querySelector('.web-src'); if (tunggu) tunggu.remove();
    bd.insertAdjacentHTML('beforeend', blokSumberWeb(web));
    if (window.IC && IC.hydrate) IC.hydrate(bd);
  }
  async function cariWebUntuk(teks, pesanUser) {
    hint.innerHTML = '<span class="tulis"><i></i><i></i><i></i></span> mencari di web…';
    var j = await cariWeb(teks);
    if (!j.jumlah) {
      catat('sistem', 'Pencarian web tidak menemukan hasil untuk "' + teks.slice(0, 80) + '". Sumbernya Wikipedia, DuckDuckGo, Stack Overflow, Hacker News, dan GitHub — indeks web umum butuh kunci berbayar.');
      return null;
    }
    pesanUser.web = { q: j.q, sumber: j.sumber };
    var konteks = '\n\n--- hasil pencarian web (pakai bila relevan, sebutkan sumber dengan tanda [nomor]) ---\n'
      + j.sumber.map(function (s, i) { return '[' + (i + 1) + '] ' + s.judul + ' — ' + s.penyedia + '\n' + s.url + '\n' + (s.cuplikan || ''); }).join('\n\n');
    pesanUser.apiText = String(pesanUser.apiText || teks) + konteks;
    var row = document.querySelector('.msg[data-id="' + pesanUser.id + '"]');
    if (row) {
      pasangHasilWeb(row, pesanUser.web);
      var bd = row.querySelector('.msg-bd');
      if (bd && !bd.querySelector('.msg-meta')) {
        var metaBaru = document.createElement('div');
        metaBaru.innerHTML = metaJawaban(pesanUser);
        if (metaBaru.firstChild) bd.insertBefore(metaBaru.firstChild, bd.querySelector('.msg-tools'));
      }
    }
    simpanSesi();
    return j;
  }

  /* ── 17e. kotak "+" ────────────────────────────────────────────────── */
  function tutupMenuPlus() { $('menuPlus').hidden = true; $('btnPlus').classList.remove('on'); }
  function pasangSakelarMenu() {
    var think = $('menuPlus').querySelector('[data-plus="think"]');
    var web = $('menuPlus').querySelector('[data-plus="web"]');
    think.classList.toggle('on', SET.mode === 'think');
    web.classList.toggle('on', !!SET.cariWeb);
  }
  $('btnPlus').addEventListener('click', function (e) {
    e.stopPropagation();
    var m = $('menuPlus');
    m.hidden = !m.hidden;
    $('btnPlus').classList.toggle('on', !m.hidden);
    if (!m.hidden) pasangSakelarMenu();
  });
  document.addEventListener('click', function (e) {
    if (!$('menuPlus').hidden && !e.target.closest('#menuPlus') && !e.target.closest('#btnPlus')) tutupMenuPlus();
  });
  $('menuPlus').addEventListener('click', function (e) {
    var b = e.target.closest('[data-plus]');
    if (!b) return;
    var aksi = b.dataset.plus;
    if (aksi === 'think') {
      SET.mode = SET.mode === 'think' ? 'fast' : 'think';
      simpanSet(); if (typeof terapkanMode === 'function') terapkanMode();
      b.classList.toggle('on', SET.mode === 'think');
      catat('sistem', SET.mode === 'think' ? 'Mode berpikir lebih keras (Think) aktif.' : 'Kembali ke mode Fast.');
      toast(SET.mode === 'think' ? 'Mode Think aktif' : 'Mode Fast aktif', 'ok');
      return;
    }
    if (aksi === 'web') {
      SET.cariWeb = !SET.cariWeb; simpanSet();
      b.classList.toggle('on', !!SET.cariWeb);
      catat('sistem', SET.cariWeb
        ? 'Pencarian web aktif — setiap pertanyaan dicari ke Wikipedia, DuckDuckGo, Stack Overflow, Hacker News, dan GitHub, hasilnya dipakai AI beserta sitasi [nomor].'
        : 'Pencarian web nonaktif.');
      if (SET.cariWeb && SET.refWiki) { SET.refWiki = false; simpanSet(); toast('Referensi Wikipedia digantikan pencarian web'); }
      toast(SET.cariWeb ? 'Pencarian web aktif' : 'Pencarian web nonaktif', 'ok');
      return;
    }
    if (aksi === 'kamera') { bukaKamera(); }
    else if (aksi === 'foto') { $('imgIn').click(); }
    else if (aksi === 'file') { $('fileIn').click(); }
    else if (aksi === 'plugin') { pluginSheet(); }
    else if (aksi === 'riset') { $('chipRiset').click(); }
    else if (aksi === 'gambar') {
      ta.value = 'Buatkan gambar sebagai kode SVG (bukan gambar raster) sesuai deskripsi ini: ';
      ta.focus(); perbaruiKirim();
      catat('sistem', 'Pembuat gambar memakai kode (SVG/HTML/canvas) — model gambar AI hanya tersedia berbayar, jadi tidak dipasang.');
      toast('Tulis deskripsi gambar — hasilnya berupa SVG yang bisa diunduh', 'ok');
    }
    else if (aksi === 'belajar') {
      ta.value = 'Jelaskan bertahap untuk pemula, lalu beri 3 pertanyaan kuis singkat dengan jawabannya: ';
      ta.focus(); perbaruiKirim();
      catat('sistem', 'Mode belajar: penjelasan bertahap + kuis singkat.');
    }
    else if (aksi === 'builder') {
      ta.value = 'Buatkan halaman web: ';
      ta.focus(); perbaruiKirim();
    }
    tutupMenuPlus();
  });
  function pluginSheet() {
    var daftar = [
      ['Alat hitung lokal', 'hitung, satuan, jam WIB, jumlah kata — dihitung di browser, tanpa kuota'],
      ['Pencarian web', 'Wikipedia · DuckDuckGo · Stack Overflow · Hacker News · GitHub'],
      ['Riset mendalam', 'rencana → sumber → laporan HTML'],
      ['Pembuat halaman', '/api/builder — satu berkas HTML utuh'],
      ['Pembaca berkas', 'PDF · DOCX · XLSX · PPTX · ZIP · teks/kode (di browser)'],
      ['Pustaka berkas', 'halaman /library + metadata, tag, dan proyek'],
    ];
    catat('sistem', 'Plugin pihak ketiga tidak dipasang (butuh server + kotak pasir). Alat bawaan yang aktif:<ul>'
      + daftar.map(function (d) { return '<li><b>' + esc(d[0]) + '</b> — ' + esc(d[1]) + '</li>'; }).join('') + '</ul>');
    toast('Alat bawaan: ' + daftar.length + ' (tanpa pemasangan)', 'ok');
  }

  /* ── 17f. kamera ───────────────────────────────────────────────────── */
  var aliranKamera = null;
  async function bukaKamera() {
    $('camModal').hidden = false;
    $('camHasil').hidden = true; $('camVideo').hidden = false;
    $('camAmbil').hidden = false; $('camUlang').hidden = true; $('camKirim').hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('camNote').textContent = 'Browser ini tidak menyediakan akses kamera (butuh https atau localhost).';
      return;
    }
    try {
      aliranKamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      $('camVideo').srcObject = aliranKamera;
      $('camNote').textContent = 'Kamera aktif. Jepret layar/dokumen, lalu Kirim ke AI.';
    } catch (e) {
      $('camNote').textContent = 'Kamera tidak bisa dibuka: ' + ((e && e.message) || e) + ' — kamu masih bisa memakai menu Foto untuk memilih gambar.';
    }
  }
  function tutupKamera() {
    if (aliranKamera) { aliranKamera.getTracks().forEach(function (t) { t.stop(); }); aliranKamera = null; }
    $('camVideo').srcObject = null;
    $('camModal').hidden = true;
  }
  $('camAmbil').addEventListener('click', function () {
    var v = $('camVideo'), c = $('camCanvas');
    if (!v.videoWidth) { toast('Kamera belum siap', 'err'); return; }
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    $('camHasil').src = c.toDataURL('image/jpeg', 0.9);
    $('camHasil').hidden = false; v.hidden = true;
    $('camAmbil').hidden = true; $('camUlang').hidden = false; $('camKirim').hidden = false;
    $('camNote').textContent = 'Hasil jepretan siap dikirim — periksa dulu, bisa diambil ulang.';
  });
  $('camUlang').addEventListener('click', function () {
    $('camHasil').hidden = true; $('camVideo').hidden = false;
    $('camAmbil').hidden = false; $('camUlang').hidden = true; $('camKirim').hidden = true;
  });
  $('camKirim').addEventListener('click', function () {
    var data = $('camHasil').src;
    if (aliranKamera) { aliranKamera.getTracks().forEach(function (t) { t.stop(); }); aliranKamera = null; }
    $('camModal').hidden = true;
    kecilkanGambar(data).then(function (hasil) {
      lampiran.push({ nama: 'kamera-' + new Date().toISOString().slice(11, 19) + '.jpg', ukuran: Math.round(hasil.besar.length * 0.75), gambar: true, data: hasil.besar, mini: hasil.mini });
      perbaruiLampiran();
      catat('sistem', 'Foto kamera dilampirkan — AI akan melihat gambar ini saat kamu kirim.');
      toast('Foto siap — tekan Kirim', 'ok');
    });
  });
  $('camTutup').addEventListener('click', tutupKamera);
  $('camModal').addEventListener('click', function (e) { if (e.target.hasAttribute('data-close') || e.target.closest('[data-close]')) tutupKamera(); });

  /* ── 17g. modal kode & jalankan ────────────────────────────────────── */
  $('kodeSalin').addEventListener('click', function () { salin(kodeBesar.kode, this); });
  $('kodeUnduh').addEventListener('click', function () {
    var ext = (typeof LANGS_BERKAS !== 'undefined' && LANGS_BERKAS[String(kodeBesar.bahasa).toLowerCase()]) || 'txt';
    unduh('kode.' + ext, kodeBesar.kode, 'text/plain');
  });
  $('kodeJalan').addEventListener('click', function () { jalankanKode(kodeBesar.kode, kodeBesar.bahasa); });

  /* ── 17h. tempel (paste) gambar/kode & seret-lepas (drag & drop) ──── */
  function tambahLampiranDariFiles(daftar) {
    [].forEach.call(daftar, function (f) { bacaSatuLampiran(f); });
  }
  function bacaSatuLampiran(f) {
    var nama = f.name || ('tempelan-' + Date.now() + (f.type && f.type.indexOf('image') === 0 ? '.png' : '.txt'));
    if (/^image\//.test(f.type)) {
      if (f.size > MAKS_FOTO_MB * 1024 * 1024) { toast('Foto terlalu besar (maks ' + MAKS_FOTO_MB + ' MB)', 'err'); return; }
      if (lampiran.filter(function (l) { return l.gambar; }).length >= MAKS_FOTO) { toast('Maksimal ' + MAKS_FOTO + ' foto per pesan', 'err'); return; }
      var rd = new FileReader();
      rd.onload = function () {
        kecilkanGambar(String(rd.result)).then(function (hasil) {
          lampiran.push({ nama: nama, ukuran: f.size, gambar: true, data: hasil.besar, mini: hasil.mini });
          perbaruiLampiran();
          toast('Foto siap dilihat AI (' + kb(hasil.besar.length) + ')', 'ok');
        });
      };
      rd.onerror = function () { toast('Gagal membaca foto', 'err'); };
      rd.readAsDataURL(f);
      return;
    }
    /* berkas: dibaca lewat pembaca berkas (PDF/DOCX/XLSX/PPTX/ZIP/teks) */
    if (!window.BERKAS) return;
    window.BERKAS.baca(f).then(function (hasil) {
      if (hasil.teks) {
        lampiran.push({
          nama: hasil.nama, ukuran: hasil.ukuran, tipe: f.type, isi: hasil.teks,
          bahasa: BAHASA_BERKAS[hasil.format] || '', format: hasil.format, catatan: hasil.catatan,
        });
        perbaruiLampiran();
        toast('Berkas ' + hasil.format.toUpperCase() + ' dibaca (' + kb(hasil.teks.length) + ' teks)', 'ok');
      } else {
        lampiran.push({ nama: hasil.nama, ukuran: hasil.ukuran, tipe: f.type, format: hasil.format });
        perbaruiLampiran();
        toast(hasil.catatan || 'Isi berkas tidak dibaca — hanya nama & ukuran', 'err');
      }
    }).catch(function (e) {
      lampiran.push({ nama: nama, ukuran: f.size, tipe: f.type });
      perbaruiLampiran();
      toast('Gagal membaca berkas: ' + ((e && e.message) || e), 'err');
    });
  }
  ta.addEventListener('paste', function (e) {
    var cd = e.clipboardData; if (!cd) return;
    var gambar = [].slice.call(cd.items || []).filter(function (i) { return i.kind === 'file' && /^image\//.test(i.type); });
    if (gambar.length) {
      e.preventDefault();
      gambar.forEach(function (i) { var f = i.getAsFile(); if (f) bacaSatuLampiran(f); });
      return;
    }
    var teksTempel = cd.getData('text/plain') || '';
    if (teksTempel.length > 1200 && lampiran.length < 6) {
      e.preventDefault();
      var blok = teksTempel.split('\n').length >= 6;
      lampiran.push({
        nama: (blok ? 'tempelan-kode.txt' : 'tempelan-panjang.txt'), ukuran: teksTempel.length, tipe: 'text/plain',
        isi: teksTempel.slice(0, 14000), bahasa: blok ? '' : '', format: 'txt',
      });
      perbaruiLampiran();
      toast('Tempelan panjang dijadikan lampiran teks (' + kb(teksTempel.length) + ')', 'ok');
    }
  });
  (function pasangSeretLepas() {
    var zona = document.querySelector('.cmp-wrap');
    ['dragenter', 'dragover'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        if (!e.dataTransfer || [].indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
        e.preventDefault(); zona.classList.add('seret');
      });
    });
    document.addEventListener('dragleave', function (e) {
      if (e.relatedTarget) return;
      zona.classList.remove('seret');
    });
    document.addEventListener('drop', function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      e.preventDefault(); zona.classList.remove('seret');
      tambahLampiranDariFiles(e.dataTransfer.files);
      toast(e.dataTransfer.files.length + ' berkas ditambahkan', 'ok');
    });
  })();

  /* ── 17i. berkas: metadata, tag, proyek, pustaka ─────────────────── */
  function semuaBerkasPenuh() { return semuaBerkas(); }
  function beriTag(id, tag) {
    var a = SET.berkas.filter(function (x) { return x.id === id; })[0];
    if (a) { a.tag = (a.tag || []); if (a.tag.indexOf(tag) < 0 && tag) a.tag.push(tag); simpanSet(); return; }
    sesi.forEach(function (s) {
      (s.artifacts || []).forEach(function (x) {
        if (x.id === id) { x.tag = (x.tag || []); if (x.tag.indexOf(tag) < 0 && tag) x.tag.push(tag); }
      });
    });
    simpanSesi();
  }
  function setProyekBerkas(id, proyekId) {
    var a = SET.berkas.filter(function (x) { return x.id === id; })[0];
    if (a) { a.proyekId = proyekId || null; simpanSet(); return; }
    sesi.forEach(function (s) {
      (s.artifacts || []).forEach(function (x) { if (x.id === id) x.proyekId = proyekId || null; });
    });
    simpanSesi();
  }
  function metaBerkas(a) {
    var f = semuaBerkasPenuh().filter(function (x) { return x.id === a.id; })[0] || a;
    var proyek = f.proyekId ? (SET.proyek.filter(function (p) { return p.id === f.proyekId; })[0] || {}).nama : '';
    return {
      nama: f.nama, jenis: (f.jenis || '').toUpperCase(), ukuran: kb(String(f.kode || '').length),
      tanggal: f.ts ? new Date(f.ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-',
      pemilik: f.dari === 'ai' ? 'AI' : 'Saya', asal: f.asal || '', proyek: proyek || '—',
      tag: f.tag || [], id: f.id, kode: f.kode,
    };
  }
  var jenisKelompok = {
    gambar: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'],
    dokumen: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'md', 'csv', 'json', 'rtf', 'odt'],
    kode: ['html', 'htm', 'css', 'js', 'mjs', 'ts', 'tsx', 'jsx', 'py', 'java', 'php', 'c', 'cpp', 'cs', 'go', 'rs', 'rb', 'sh', 'sql', 'yml', 'yaml', 'xml'],
    arsip: ['zip', 'rar', '7z', 'tar', 'gz'],
  };
  function kelompokBerkas(jenis) {
    var j = String(jenis || '').toLowerCase();
    var hasil = [];
    Object.keys(jenisKelompok).forEach(function (k) { if (jenisKelompok[k].indexOf(j) >= 0) hasil.push(k); });
    return hasil;
  }
  var libTab = 'semua', libCari = '', libUrut = 'baru';
  function libDaftar() {
    var daftar = semuaBerkasPenuh().filter(function (a) {
      var k = kelompokBerkas(a.jenis);
      if (libTab !== 'semua' && k.indexOf(libTab) < 0) return false;
      if (!libCari) return true;
      var t = (a.nama + ' ' + (a.tag || []).join(' ') + ' ' + String(a.kode || '').slice(0, 4000)).toLowerCase();
      return t.indexOf(libCari.toLowerCase()) >= 0;
    });
    daftar.sort(function (a, b) {
      if (libUrut === 'nama') return String(a.nama).localeCompare(String(b.nama));
      if (libUrut === 'ukuran') return String(b.kode || '').length - String(a.kode || '').length;
      return (b.ts || 0) - (a.ts || 0);
    });
    return daftar;
  }
  function gambarPerpus() {
    var daftar = libDaftar();
    $('libHitung').textContent = daftar.length + ' berkas' + (libCari ? ' (cari: ' + libCari + ')' : '');
    $('libUrutTx').textContent = libUrut === 'nama' ? 'Nama A–Z' : libUrut === 'ukuran' ? 'Terbesar' : 'Terbaru';
    if (!daftar.length) {
      $('libGrid').innerHTML = '<div class="empty" style="position:static;padding:40px 12px">' + ic('folder-open', 26)
        + '<b>Belum ada berkas pada tampilan ini</b><p>Berkas hasil AI dan berkas yang kamu unggah akan muncul di sini.</p></div>';
      return;
    }
    $('libGrid').innerHTML = daftar.map(function (a) {
      var m = metaBerkas(a);
      var k = kelompokBerkas(a.jenis)[0] || 'dokumen';
      var gambar = k === 'gambar' && (a.jenis === 'svg' || /^data:image/.test(String(a.kode)));
      return '<article class="kartu" data-lib="' + a.id + '">'
        + '<div class="kartu-thumb ' + k + '">' + (a.jenis === 'svg' ? String(a.kode).slice(0, 400) : ic(k === 'gambar' ? 'image' : k === 'kode' ? 'file-code' : k === 'arsip' ? 'layers' : 'file-text', 26)) + '</div>'
        + '<div class="kartu-bd"><b>' + esc(m.nama) + '</b>'
        + '<small>' + m.jenis + ' · ' + m.ukuran + ' · ' + esc(m.pemilik) + '</small>'
        + '<small class="kartu-tgl">' + esc(m.tanggal) + '</small>'
        + '<small>Proyek: ' + esc(m.proyek) + '</small>'
        + '<div class="kartu-tag">' + (m.tag.length ? m.tag.map(function (t) { return '<span class="tag-chip">' + esc(t) + '</span>'; }).join('') : '<span class="tag-kosong">tanpa tag</span>') + '</div>'
        + '</div><div class="kartu-act">'
        + '<button class="ib sm" data-libprev="' + a.id + '" title="Pratinjau">' + ic('eye', 15) + '</button>'
        + '<button class="ib sm" data-libpakai="' + a.id + '" title="Masukkan ke percakapan">' + ic('corner-down-left', 15) + '</button>'
        + '<button class="ib sm" data-libtag="' + a.id + '" title="Tambah tag">' + ic('tag', 15) + '</button>'
        + '<button class="ib sm" data-libproyek="' + a.id + '" title="Masukkan ke proyek">' + ic('layers', 15) + '</button>'
        + '<button class="ib sm" data-libdl="' + a.id + '" title="Unduh">' + ic('download', 15) + '</button>'
        + '<button class="ib sm" data-libhapus="' + a.id + '" title="Hapus">' + ic('trash', 15) + '</button>'
        + '</div></article>';
    }).join('');
    if (window.IC && IC.hydrate) IC.hydrate($('libGrid'));
  }
  function tampilPerpus(on) {
    $('libPage').hidden = !on;
    document.querySelector('.rail').hidden = on;
    document.querySelector('.chat').hidden = on;
    document.querySelector('.work').hidden = on;
    document.querySelectorAll('.split').forEach(function (s) { s.hidden = on; });
    if (on) { gambarPerpus(); document.title = 'Pustaka Berkas — Van Chat.SPY'; }
    else document.title = 'Van Chat.SPY — Ruang Kerja AI';
  }
  function rutePerpus() {
    var mauPerpus = /^#\/library/.test(location.hash) || /^\/library\/?$/.test(location.pathname);
    if (mauPerpus) {
      if (!location.hash) location.hash = '#/library';
      tampilPerpus(true);
    } else tampilPerpus(false);
  }
  window.addEventListener('hashchange', rutePerpus);
  $('libKembali').addEventListener('click', function (e) {
    e.preventDefault();
    if (/^\/library\/?$/.test(location.pathname)) { location.href = '/'; return; }
    location.hash = '#/'; rutePerpus();
  });
  $('libTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-lt]'); if (!b) return;
    libTab = b.dataset.lt;
    [].forEach.call($('libTabs').children, function (x) { x.classList.toggle('on', x === b); });
    gambarPerpus();
  });
  $('libCari').addEventListener('input', function () { libCari = this.value.trim(); gambarPerpus(); });
  $('libUrut').addEventListener('click', function () {
    libUrut = libUrut === 'baru' ? 'nama' : libUrut === 'nama' ? 'ukuran' : 'baru';
    gambarPerpus();
  });
  $('libUnggah2').addEventListener('click', function () { $('fileIn').click(); });
  $('libBersih').addEventListener('click', function () {
    var kosong = semuaBerkasPenuh().filter(function (a) { return !String(a.kode || '').trim(); });
    if (!kosong.length) { toast('Tidak ada berkas kosong', 'ok'); return; }
    if (!confirm('Hapus ' + kosong.length + ' berkas kosong?')) return;
    kosong.forEach(function (a) { SET.berkas = SET.berkas.filter(function (x) { return x.id !== a.id; }); });
    simpanSet(); gambarPerpus(); toast(kosong.length + ' berkas kosong dihapus', 'ok');
  });
  $('libGrid').addEventListener('click', function (e) {
    var p = e.target.closest('[data-libprev]');
    if (p) { pratinjauBerkas(p.dataset.libprev); return; }
    var pakai = e.target.closest('[data-libpakai]');
    if (pakai) { var a = cariArtefak(pakai.dataset.libpakai); if (a) pakaiDiPercakapan(a); return; }
    var tag = e.target.closest('[data-libtag]');
    if (tag) {
      var t = prompt('Tag baru untuk berkas ini (contoh: penting, tugas, klien):', '');
      if (t && t.trim()) { beriTag(tag.dataset.libtag, t.trim().slice(0, 24)); gambarPerpus(); toast('Tag ditambahkan', 'ok'); }
      return;
    }
    var pr = e.target.closest('[data-libproyek]');
    if (pr) {
      if (!SET.proyek.length) { toast('Belum ada proyek — buat dulu di panel kiri', 'err'); return; }
      var nama = prompt('Masukkan ke proyek (ketik nama proyek, kosongkan untuk melepas):\n' + SET.proyek.map(function (x) { return '• ' + x.nama; }).join('\n'), '');
      if (nama === null) return;
      var cari = SET.proyek.filter(function (x) { return x.nama.toLowerCase() === nama.trim().toLowerCase(); })[0];
      setProyekBerkas(pr.dataset.libproyek, cari ? cari.id : null);
      gambarPerpus();
      toast(cari ? 'Berkas dimasukkan ke proyek ' + cari.nama : 'Berkas dilepas dari proyek', 'ok');
      return;
    }
    var dl = e.target.closest('[data-libdl]');
    if (dl) { var a2 = cariArtefak(dl.dataset.libdl); if (a2) unduhBerkas(a2); return; }
    var hps = e.target.closest('[data-libhapus]');
    if (hps) {
      if (!confirm('Hapus berkas ini dari pustaka?')) return;
      var id = hps.dataset.libhapus;
      SET.berkas = SET.berkas.filter(function (x) { return x.id !== id; });
      sesi.forEach(function (s) { s.artifacts = (s.artifacts || []).filter(function (x) { return x.id !== id; }); });
      simpanSet(); simpanSesi(); gambarPerpus(); toast('Berkas dihapus');
      return;
    }
    var kartu = e.target.closest('[data-lib]');
    if (kartu) pratinjauBerkas(kartu.dataset.lib);
  });
  function pratinjauBerkas(id) {
    var a = cariArtefak(id); if (!a) return;
    var isi = String(a.kode || '');
    $('libPrevNama').textContent = a.nama;
    var jenis = String(a.jenis || '').toLowerCase();
    if (jenis === 'html' || jenis === 'htm') $('libPrevIsi').innerHTML = '<iframe class="prev-frame" sandbox="allow-scripts" srcdoc="' + esc(isi) + '"></iframe>';
    else if (jenis === 'svg') $('libPrevIsi').innerHTML = '<div class="prev-svg">' + isi + '</div>';
    else if (/^(png|jpg|jpeg|gif|webp|bmp|ico)$/.test(jenis) && /^data:image/.test(isi)) $('libPrevIsi').innerHTML = '<img src="' + isi + '" alt="">';
    else $('libPrevIsi').innerHTML = '<pre class="prev-teks">' + esc(isi.slice(0, 20000)) + '</pre>';
    var m = metaBerkas(a);
    $('libPrevIsi').insertAdjacentHTML('afterbegin', '<div class="prev-meta">'
      + '<span>' + esc(m.jenis) + '</span><span>' + esc(m.ukuran) + '</span><span>' + esc(m.pemilik) + '</span>'
      + '<span>' + esc(m.tanggal) + '</span><span>Proyek: ' + esc(m.proyek) + '</span>'
      + (m.tag.length ? '<span>' + m.tag.map(function (t) { return '#' + esc(t); }).join(' ') + '</span>' : '') + '</div>');
    $('libPrev').hidden = false;
  }

  /* ── 17j. pintasan tambahan ──────────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    var a = e.altKey;
    if (a && e.key.toLowerCase() === 'k') { e.preventDefault(); $('btnPlus').click(); }
    else if (a && e.key.toLowerCase() === 'l') { e.preventDefault(); location.hash = location.hash === '#/library' ? '#/' : '#/library'; }
    else if (a && e.key.toLowerCase() === 'c') { e.preventDefault(); bukaKamera(); }
  });

  /* ── 17k. penyalaan ──────────────────────────────────────────────── */
  function mulai17() {
    rutePerpus();
    pasangSakelarMenu();
    var w = document.querySelector('.cmp-wrap');
    if (w && !w.querySelector('.seret-info')) {
      var d = document.createElement('div');
      d.className = 'seret-info';
      d.innerHTML = ic('upload', 15) + '<span>Lepaskan berkas di sini untuk dilampirkan</span>';
      w.appendChild(d);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai17); else mulai17();
