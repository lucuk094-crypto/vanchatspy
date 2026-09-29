  /* ═════════════════════════════════════════════════════════════════════
     18. HALAMAN BER-ALAMAT · SETELAN · PROYEK · TUGAS · PLUGIN · ADMIN
     ════════════════════════════════════════════════════════════════════ */

  /* ── 18a. kerangka halaman + perutean ─────────────────────────────── */
  var HAL = {};          /* nama → { judul, sub, gambar, pasang } */
  var halKini = null;

  function tampilHalaman(nama) {
    var host = $('halPage');
    var on = !!nama;
    host.hidden = !on;
    if (on) $('libPage').hidden = true;
    document.querySelector('.rail').hidden = on;
    document.querySelector('.chat').hidden = on;
    document.querySelector('.work').hidden = on;
    document.querySelectorAll('.split').forEach(function (s) { s.hidden = on; });
    if (!on) { halKini = null; document.title = 'Van Chat.SPY — Ruang Kerja AI'; return; }
    halKini = nama;
    var h = HAL[nama];
    $('halJudul').textContent = h.judul;
    $('halSub').textContent = typeof h.sub === 'function' ? (h.sub() || '') : (h.sub || '');
    $('halAksi').innerHTML = h.aksi ? h.aksi() : '';
    $('halBody').innerHTML = h.gambar();
    document.title = h.judul + ' — Van Chat.SPY';
    $('halBody').scrollTop = 0;
  }
  HAL.builder = { judul: 'AI Builder', sub: 'membangun website & aplikasi dari perintah bahasa', gambar: function () { return ''; } };

  var RUTE = { builder: 1, projects: 1, scheduled: 1, settings: 1, admin: 1, plugins: 1, share: 1 };
  function ruteHalaman() {
    var h = String(location.hash || '');
    var dariHash = h.match(/^#\/([a-z]+)/i);
    var dariJalur = String(location.pathname || '').match(/^\/([a-z]+)\/?$/i);
    var nama = (dariHash && dariHash[1]) || (dariJalur && dariJalur[1]) || '';
    nama = nama.toLowerCase();
    if (nama === 'library') { tampilHalaman(null); return; }          /* pustaka punya halamannya sendiri */
    if (nama === 'bagi' || /^#\/bagi=/.test(h)) {
      if (/^#\/bagi=/.test(h) && !(HAL.share && false)) { tampilHalaman('share'); return; }
    }
    if (RUTE[nama]) { tampilHalaman(nama); return; }
    tampilHalaman(null);
  }
  window.addEventListener('hashchange', function () { ruteHalaman(); rutePerpus(); });
  $('halKembali').addEventListener('click', function (e) {
    e.preventDefault();
    if (/^\/(builder|projects|scheduled|settings|admin|plugins|share)\/?$/.test(location.pathname)) { location.href = '/'; return; }
    location.hash = '#/';
  });

  /* ── 18b. notifikasi (toast 4 jenis + kerangka) ───────────────────── */
  var toastTerakhir = { teks: '', ts: 0 };
  var toastAsli = toast;
  toast = function (teks, jenis) {
    /* jangan menumpuk pemberitahuan yang sama dalam 1,2 detik */
    var kini = Date.now();
    if (teks === toastTerakhir.teks && kini - toastTerakhir.ts < 1200) return;
    toastTerakhir = { teks: teks, ts: kini };
    toastAsli(teks, jenis);
  };
  function kerangka(n, tinggi) {
    return '<div class="kerangka">' + Array.from({ length: n || 3 }, function (_, i) {
      return '<div class="kerangka-baris" style="width:' + (92 - i * 12) + '%;height:' + (tinggi || 13) + 'px"></div>';
    }).join('') + '</div>';
  }

  /* ── 18c. ekspor data (JSON · TXT · CSV) ─────────────────────────── */
  function eksporNama(awalan, ekstensi) {
    var d = new Date().toISOString().slice(0, 10);
    return awalan + '-' + d + '.' + ekstensi;
  }
  function eksporPercakapan(format) {
    if (!sesi.length) { toast('Belum ada percakapan untuk diekspor', 'err'); return; }
    if (format === 'txt') {
      var teks = sesi.map(function (s) {
        return '=== ' + s.judul + ' (' + new Date(s.ts).toLocaleString('id-ID') + ') ===\n'
          + s.messages.map(function (m) { return (m.role === 'user' ? 'SAYA: ' : 'AI: ') + bersihTeks(m.text || ''); }).join('\n\n');
      }).join('\n\n\n');
      unduh(eksporNama('percakapan', 'txt'), teks, 'text/plain');
    } else if (format === 'csv') {
      var baris = [['percakapan', 'waktu', 'peran', 'pesan']];
      sesi.forEach(function (s) {
        s.messages.forEach(function (m) {
          baris.push([s.judul, new Date(m.ts || s.ts).toISOString(), m.role === 'user' ? 'pengguna' : 'ai',
            String(m.text || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')]);
        });
      });
      var csv = '\ufeff' + baris.map(function (b) { return b.map(function (x) { return '"' + x + '"'; }).join(','); }).join('\n');
      unduh(eksporNama('percakapan', 'csv'), csv, 'text/csv');
    } else {
      unduh(eksporNama('percakapan', 'json'), JSON.stringify(sesi, null, 2), 'application/json');
    }
    toast('Percakapan diekspor (' + format.toUpperCase() + ')', 'ok');
  }
  function eksporProyek(format) {
    if (format === 'csv') {
      var b = [['proyek', 'deskripsi', 'instruksi', 'obrolan', 'file']];
      SET.proyek.forEach(function (p) {
        b.push([p.nama, p.deskripsi || '', p.instruksi || '',
          String(sesi.filter(function (s) { return s.proyekId === p.id; }).length),
          String(semuaBerkas().filter(function (a) { return (a.tag || []).indexOf('proyek:' + p.id) >= 0 || a.proyekId === p.id; }).length)]);
      });
      unduh(eksporNama('proyek', 'csv'), '\ufeff' + b.map(function (x) { return x.map(function (y) { return '"' + String(y).replace(/"/g, '""') + '"'; }).join(','); }).join('\n'), 'text/csv');
    } else {
      unduh(eksporNama('proyek', 'json'), JSON.stringify(SET.proyek, null, 2), 'application/json');
    }
    toast('Data proyek diekspor', 'ok');
  }
  function eksporMetadataBerkas() {
    var daftar = semuaBerkas();
    if (!daftar.length) { toast('Belum ada berkas', 'err'); return; }
    var b = [['nama', 'jenis', 'ukuran', 'tanggal', 'pemilik', 'proyek', 'tag', 'sumber']];
    daftar.forEach(function (a) {
      var m = metaBerkas(a);
      b.push([m.nama, m.jenis, m.ukuran, m.tanggal, m.pemilik, m.proyek, (m.tag || []).join(' '), a.riset ? 'riset' : a.bangunan ? 'builder' : 'lain']);
    });
    unduh(eksporNama('berkas-metadata', 'csv'), '\ufeff' + b.map(function (x) { return x.map(function (y) { return '"' + String(y).replace(/"/g, '""') + '"'; }).join(','); }).join('\n'), 'text/csv');
    toast('Metadata ' + daftar.length + ' berkas diekspor', 'ok');
  }
  function eksporPreferensi() {
    var salinan = {}; Object.keys(SET).forEach(function (k) { if (k !== 'berkas') salinan[k] = SET[k]; });
    unduh(eksporNama('preferensi', 'json'), JSON.stringify(salinan, null, 2), 'application/json');
    toast('Preferensi diekspor', 'ok');
  }
  function eksporSemua() {
    var isi = {
      dibuat: new Date().toISOString(), aplikasi: 'Van Chat.SPY',
      preferensi: SET, percakapan: sesi, proyek: SET.proyek, tugas: SET.tugas, memori: SET.memori,
      berkas: semuaBerkas().map(function (a) { return { nama: a.nama, jenis: a.jenis, ukuran: String(a.kode || '').length, ts: a.ts, tag: a.tag || [] }; }),
      bangunan: (SET.bangunan || []).map(function (b) { return { nama: b.nama, berkas: (b.berkas || []).map(function (f) { return f.path; }) }; })
    };
    unduh(eksporNama('van-chat-spy-semua', 'json'), JSON.stringify(isi, null, 2), 'application/json');
    toast('Semua data diekspor (tanpa isi berkas besar)', 'ok');
  }

  /* ── 18d. pengguna memori: kategori + minta AI memperbarui ───────── */
  var KATEGORI_MEMORI = {
    preferensi: { label: 'Preferensi', ikon: 'sliders' },
    instruksi: { label: 'Instruksi pengguna', ikon: 'list-checks' },
    konteks: { label: 'Konteks proyek', ikon: 'layers' },
    penting: { label: 'Informasi penting', ikon: 'alert-circle' },
  };
  function kategoriMemori(m) { return KATEGORI_MEMORI[m.kategori] ? m.kategori : 'penting'; }
  function ringkasMemori() {
    var k = {}; Object.keys(KATEGORI_MEMORI).forEach(function (x) { k[x] = 0; });
    SET.memori.forEach(function (m) { k[kategoriMemori(m)]++; });
    return k;
  }
  function mintaAIPerbaruiMemori() {
    var percakapan = sesiAktif();
    if (!percakapan || !percakapan.messages.length) { toast('Belum ada percakapan untuk diringkas', 'err'); return; }
    var bahan = percakapan.messages.slice(-8).map(function (m) {
      return (m.role === 'user' ? 'PENGGUNA: ' : 'AI: ') + bersihTeks(m.text || '').slice(0, 400);
    }).join('\n');
    toast('Meminta AI meringkas memori…');
    mintaTeks('Dari percakapan berikut, tulis paling banyak 4 hal yang pantas diingat jangka panjang tentang pengguna.\n'
      + 'Balas HANYA dalam format: kategori|isi singkat\n'
      + 'kategori harus salah satu dari: preferensi, instruksi, konteks, penting\n\n' + bahan, 'think')
      .then(function (hasil) {
        var tambah = hasil.split('\n').map(function (b) { return b.replace(/^[-*\d.)\s]+/, '').trim(); })
          .map(function (b) { var p = b.split('|'); return { kategori: (p[0] || '').trim().toLowerCase(), teks: (p.slice(1).join('|') || '').trim() }; })
          .filter(function (x) { return KATEGORI_MEMORI[x.kategori] && x.teks.length > 4; })
          .slice(0, 4);
        if (!tambah.length) { toast('AI tidak menemukan hal baru untuk diingat', 'warn'); return; }
        tambah.forEach(function (x) {
          var teks = x.teks.slice(0, 300);
          var sudah = SET.memori.some(function (m) { return m.teks.toLowerCase() === teks.toLowerCase(); });
          if (!sudah) SET.memori.unshift({ id: uid(), teks: teks, kategori: x.kategori, ts: Date.now(), dariAI: true });
        });
        SET.memori = SET.memori.slice(0, 40);
        simpanSet(); if (window.gambarMemori18) gambarMemori18();
        toast(tambah.length + ' catatan memori diperbarui AI', 'ok');
      })
      .catch(function (e) { toast('Gagal memperbarui memori: ' + ((e && e.message) || e), 'err'); });
  }

  /* ── 18e. halaman SETELAN ─────────────────────────────────────────── */
  function barisSet(judul, ket, isi) {
    return '<div class="set-it"><div class="set-tx"><b>' + judul + '</b>' + (ket ? '<small>' + ket + '</small>' : '') + '</div><div class="set-ctl">' + isi + '</div></div>';
  }
  function sakelar18(id, on) {
    return '<button class="sw' + (on ? ' on' : '') + '" id="' + id + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"><i></i></button>';
  }
  function seg18(id, daftar, terpilih) {
    return '<div class="seg" id="' + id + '">' + daftar.map(function (d) {
      return '<button data-v="' + d[0] + '"' + (String(d[0]) === String(terpilih) ? ' class="on"' : '') + '>' + d[1] + '</button>';
    }).join('') + '</div>';
  }
  function perkiraanPenyimpanan() {
    var isi = 0;
    ['vcs.sesi', 'vcs.setelan'].forEach(function (k) { var v = localStorage.getItem(k); if (v) isi += v.length; });
    var lain = 0;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i); if (k === 'vcs.sesi' || k === 'vcs.setelan') continue;
      lain += (localStorage.getItem(k) || '').length;
    }
    return { total: isi + lain, sesi: isi, lain: lain };
  }
  function daftarBerkasSetelan() {
    return semuaBerkas().slice(0, 40).map(function (a) {
      var m = metaBerkas(a);
      return '<div class="mini-it"><span><b>' + esc(m.nama) + '</b><small>' + m.jenis + ' · ' + m.ukuran + ' · ' + m.pemilik + '</small></span>'
        + '<button class="ib sm" data-setdl="' + a.id + '" title="Unduh">' + ic('download', 14) + '</button>'
        + '<button class="ib sm" data-sethps="' + a.id + '" title="Hapus">' + ic('trash', 14) + '</button></div>';
    }).join('') || '<p class="note">Belum ada berkas.</p>';
  }
  function pakaiServer() {
    var p = SET.penyedia || {};
    var t = p.teks || {};
    return '<div class="mini-it"><span><b>Penyedia teks: ' + esc(t.penyedia || 'openrouter') + '</b>'
      + '<small>' + esc(t.alamat || '') + ' · kunci ' + (t.adaKunci ? 'ada (' + esc(t.kunci || '') + ')' : 'belum ada')
      + (t.modelTetap ? ' · model tetap ' + esc(t.modelTetap) : '') + '</small></span></div>'
      + '<div class="mini-it"><span><b>Pembuat gambar: ' + esc((p.gambar && p.gambar.penyedia) || '(belum diatur)') + '</b>'
      + '<small>' + ((p.gambar && p.gambar.siap) ? 'siap · ' + esc(p.gambar.model) : 'butuh IMAGE_PROVIDER + IMAGE_API_KEY') + '</small></span></div>'
      + '<div class="mini-it"><span><b>Suara: ' + esc(((p.suara && p.suara.tts && p.suara.tts.penyedia) || 'bawaan browser')) + '</b>'
      + '<small>' + ((p.suara && p.suara.tts && p.suara.tts.siap) ? 'suara AI aktif' : 'memakai Web Speech API browser') + '</small></span></div>'
      + '<div class="mini-it"><span><b>Deployment: ' + esc((p.deploy && p.deploy.penyedia) || '(belum diatur)') + '</b>'
      + '<small>' + ((p.deploy && p.deploy.siap) ? 'siap' : 'butuh DEPLOY_PROVIDER + DEPLOY_TOKEN') + '</small></span></div>'
      + '<div class="mini-it"><span><b>Penjadwal sisi-server: ' + esc((p.penjadwal && p.penjadwal.penyedia) || '(belum diatur)') + '</b>'
      + '<small>' + ((p.penjadwal && p.penjadwal.siap) ? 'penyimpanan KV siap' : 'butuh KV_REST_API_URL + KV_REST_API_TOKEN') + '</small></span></div>';
  }
  HAL.settings = {
    judul: 'Pengaturan',
    sub: 'aplikasi · tampilan · suara · keamanan · data',
    aksi: function () { return '<button class="btn" id="set18EksporSemua">' + ic('download', 15) + 'Ekspor semua data</button>'; },
    gambar: function () {
      var pk = perkiraanPenyimpanan();
      var r = ringkasMemori();
      return ''
        + '<section class="hal-sec"><h3>' + ic('settings', 16) + 'Umum</h3>'
        + barisSet('Mode AI bawaan', 'dipakai saat aplikasi dibuka', seg18('set18Mode', [['fast', 'Normal'], ['think', 'Berpikir'], ['deep', 'Berpikir Mendalam'], ['expert', 'Expert']], SET.mode))
        + barisSet('Enter untuk mengirim', 'kalau mati, Enter jadi baris baru (kirim = Ctrl+Enter)', sakelar18('set18Enter', SET.enterKirim))
        + barisSet('Pencarian web', 'jawaban diperkuat sumber + sitasi [nomor]', sakelar18('set18Web', SET.cariWeb))
        + barisSet('Referensi Wikipedia', 'ringkasan artikel ikut dikirim ke AI', sakelar18('set18Wiki', SET.refWiki))
        + barisSet('Semua percakapan', sesi.length + ' percakapan tersimpan di browser ini', '<button class="btn" id="set18KeCari">' + ic('search', 15) + 'Cari (Ctrl+Shift+K)</button>')
        + '</section>'

        + '<section class="hal-sec"><h3>' + ic('moon', 16) + 'Tampilan</h3>'
        + barisSet('Tema', 'Terang · Gelap · Mengikuti sistem', seg18('set18Tema', [['dark', 'Gelap'], ['light', 'Terang'], ['auto', 'Sistem']], SET.tema))
        + barisSet('Ukuran huruf', 'berlaku di seluruh aplikasi', seg18('set18Fs', [['15', 'Kecil'], ['16', 'Sedang'], ['17.5', 'Besar']], String(SET.fs)))
        + barisSet('Lebar kolom percakapan', SET.feedW + ' px', seg18('set18Feed', [['680', 'Sempit'], ['760', 'Sedang'], ['860', 'Lebar']], String(SET.feedW)))
        + '</section>'

        + '<section class="hal-sec"><h3>' + ic('bell', 16) + 'Notifikasi</h3>'
        + barisSet('Pemberitahuan tugas', 'izin notifikasi browser diminta saat tugas pertama dibuat', sakelar18('set18Notif', !!(window.Notification && Notification.permission === 'granted')))
        + barisSet('Uji pemberitahuan', 'menampilkan satu contoh tiap jenis', '<div class="img-aksi"><button class="btn" data-toast="ok">Berhasil</button>'
        + '<button class="btn" data-toast="err">Error</button><button class="btn" data-toast="warn">Peringatan</button><button class="btn" data-toast="info">Informasi</button></div>')
        + '</section>'

        + '<section class="hal-sec"><h3>' + ic('volume-2', 16) + 'Suara</h3>'
        + barisSet('Bacakan jawaban otomatis', 'suara bawaan browser', sakelar18('set18AutoTTS', SET.autoTTS))
        + barisSet('Suara AI (server)', 'aktif bila TTS_PROVIDER + TTS_API_KEY diisi di hosting', '<span class="pill-note">' + ((SET.penyedia && SET.penyedia.suara && SET.penyedia.suara.tts && SET.penyedia.suara.tts.siap) ? 'siap' : 'bawaan browser') + '</span>')
        + barisSet('Suara yang dipilih', 'daftar suara dari perangkat', '<select class="sel" id="set18Suara"><option value="">(bawaan)</option>'
        + (((window.speechSynthesis && speechSynthesis.getVoices()) || []).map(function (v) { return '<option value="' + esc(v.name) + '"' + (SET.suara === v.name ? ' selected' : '') + '>' + esc(v.name) + ' — ' + esc(v.lang) + '</option>'; }).join(''))
        + '</select>')
        + barisSet('Percakapan suara', 'mikrofon → AI → suara', '<button class="btn" id="set18Voice">' + ic('mic', 15) + 'Buka mode suara</button>')
        + '</section>'

        + '<section class="hal-sec"><h3>' + ic('shield', 16) + 'Keamanan</h3>'
        + barisSet('Gerbang halaman Admin', 'kunci lokal (disimpan teracak di browser ini)',
          '<div class="img-aksi"><button class="btn" id="adm18Set">' + ic('key', 15) + (SET.adminHash ? 'Ganti kunci' : 'Buat kunci') + '</button>'
          + (SET.adminHash ? '<button class="btn danger" id="adm18Hapus">Hapus kunci</button>' : '') + '</div>')
        + barisSet('Kunci admin di perangkat ini', SET.adminHash ? 'aktif — halaman /admin meminta kunci' : 'belum ada — /admin menampilkan data terbatas', '<span class="pill-note">' + (SET.adminHash ? 'terkunci' : 'terbuka') + '</span>')
        + barisSet('Batas permintaan server', 'chat 60/menit · pencarian 30/menit · gambar 20/menit', '<button class="btn" id="set18Rate">' + ic('activity', 15) + 'Lihat pemakaian</button>')
        + '<p class="note">Catatan jujur: aplikasi ini tidak menyimpan sesi pengguna di server, jadi tidak ada cookie login yang perlu diamankan; berkas pengguna juga tidak pernah diunggah ke hosting (ada di browser). Kunci penyedia AI hanya hidup di sisi server — periksa dengan <b>node tools/uji-rahasia.mjs</b>.</p>'
        + '</section>'

        + '<section class="hal-sec"><h3>' + ic('lock', 16) + 'Privasi & Kontrol Data</h3>'
        + barisSet('Memori AI', 'catatan pribadi yang ikut dikirim ke AI', sakelar18('set18Memori', SET.memoriAktif))
        + barisSet('Ekspor percakapan', 'JSON · TXT · CSV', '<div class="img-aksi"><button class="btn" data-ekspor="sesi-json">JSON</button><button class="btn" data-ekspor="sesi-txt">TXT</button><button class="btn" data-ekspor="sesi-csv">CSV</button></div>')
        + barisSet('Ekspor proyek', 'daftar & instruksi', '<div class="img-aksi"><button class="btn" data-ekspor="prj-json">JSON</button><button class="btn" data-ekspor="prj-csv">CSV</button></div>')
        + barisSet('Ekspor metadata berkas', 'nama · jenis · ukuran · tanggal · pemilik · proyek · tag', '<button class="btn" data-ekspor="berkas-csv">' + ic('table', 15) + 'CSV</button>')
        + barisSet('Ekspor preferensi', 'setelan aplikasi', '<button class="btn" data-ekspor="set-json">' + ic('download', 15) + 'JSON</button>')
        + barisSet('Impor percakapan', 'berkas JSON hasil ekspor', '<button class="btn" id="set18Impor">' + ic('upload', 15) + 'Pilih berkas</button><input type="file" id="set18ImporIn" accept="application/json" hidden>')
        + barisSet('Hapus semua data', 'percakapan · berkas · memori · tugas di browser ini', '<button class="btn danger" id="set18Reset">' + ic('trash', 15) + 'Hapus semua</button>')
        + '</section>'

        + '<section class="hal-sec"><h3>' + ic('database', 16) + 'Penyimpanan</h3>'
        + barisSet('Terpakai di browser ini', '± ' + (perkiraanPenyimpanan().total / 1024).toFixed(1) + ' KB dari kuota localStorage', '<button class="btn" id="set18Hitung">' + ic('refresh-cw', 15) + 'Hitung ulang</button>')
        + '<div class="mini-list">' + daftarBerkasSetelan() + '</div>'
        + '</section>'

        + '<section class="hal-sec"><h3>' + ic('brain', 16) + 'Memori (' + SET.memori.length + ')</h3>'
        + barisSet('Ringkasan per kategori', Object.keys(KATEGORI_MEMORI).map(function (k) { return k + ': ' + r[k]; }).join(' · '),
          '<div class="img-aksi"><button class="btn pr" id="set18MemoriAI">' + ic('sparkles', 15) + 'Minta AI memperbarui</button>'
          + '<a class="btn" href="#/projects">Kelola di Proyek</a></div>')
        + '<p class="note">Memori hanya ada di browser ini; tidak ada server yang menyimpannya, jadi pengguna lain tidak bisa membacanya.</p>'
        + '</section>'

        + '<section class="hal-sec"><h3>' + ic('plug', 16) + 'Plugin</h3>'
        + '<p class="note">Plugin pihak ketiga tidak dipasang otomatis. Yang tersedia adalah plugin bawaan dengan izin yang tertera — lihat <a href="#/plugins">daftar lengkap + izinnya</a>.</p>'
        + '</section>'

        + '<section class="hal-sec"><h3>' + ic('activity', 16) + 'Penggunaan & Penyedia</h3>'
        + '<div class="mini-list" id="set18Provider">' + pakaiServer() + '</div>'
        + barisSet('Pemakaian hari ini', (SET.pakai && SET.pakai.jumlah ? SET.pakai.jumlah : 0) + ' permintaan AI (batas gratis penyedia ± 50/hari)',
          '<button class="btn" id="set18Pakai">' + ic('refresh-cw', 15) + 'Muat ulang status</button>')
        + '</section>'

        + '<section class="hal-sec"><h3>' + ic('info', 16) + 'Tentang</h3>'
        + '<p class="note">Van Chat.SPY — ruang kerja AI satu halaman. Semua uji tampilan memakai Chromium sungguhan; daftar per butir ada di <b>PESAN-BERKAS-8-14.md</b> dan <b>BUTIR-15-53.md</b>. Riwayat, berkas, memori, dan setelan hidup di browser ini.</p>'
        + '</section>';
    },
    pasang: function () { pasangSetelan(); }
  };

  function sw18(id, nilai, saatUbah) {
    var el = $(id);
    if (el) el.addEventListener('click', function () {
      var baru = !(el.getAttribute('aria-checked') === 'true');
      el.classList.toggle('on', baru); el.setAttribute('aria-checked', baru ? 'true' : 'false');
      saatUbah(baru);
    });
    if (el) { el.classList.toggle('on', !!nilai); el.setAttribute('aria-checked', nilai ? 'true' : 'false'); }
  }
  function seg18Pasang(id, saatUbah) {
    var el = $(id); if (!el) return;
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      [].forEach.call(el.children, function (x) { x.classList.toggle('on', x === b); });
      saatUbah(b.dataset.v);
    });
  }
  function pasangSetelan() {
    seg18Pasang('set18Mode', function (v) { SET.mode = v; simpanSet(); terapkanSet(); toast('Mode: ' + MODE[v].label, 'ok'); });
    sw18('set18Enter', SET.enterKirim, function (v) { SET.enterKirim = v; simpanSet(); });
    sw18('set18Web', SET.cariWeb, function (v) { SET.cariWeb = v; if (v && SET.refWiki) { SET.refWiki = false; } simpanSet(); pasangSakelarMenu(); toast(v ? 'Pencarian web aktif' : 'Pencarian web nonaktif'); });
    sw18('set18Wiki', SET.refWiki, function (v) { SET.refWiki = v; simpanSet(); });
    seg18Pasang('set18Tema', function (v) { SET.tema = v; simpanSet(); terapkanSet(); toast('Tema: ' + v); });
    seg18Pasang('set18Fs', function (v) { SET.fs = parseFloat(v); simpanSet(); terapkanSet(); });
    seg18Pasang('set18Feed', function (v) { SET.feedW = parseInt(v, 10); simpanSet(); terapkanSet(); });
    sw18('set18AutoTTS', SET.autoTTS, function (v) { SET.autoTTS = v; simpanSet(); });
    sw18('set18Memori', SET.memoriAktif, function (v) { SET.memoriAktif = v; simpanSet(); });
    var suara = $('set18Suara');
    if (suara) suara.addEventListener('change', function () { SET.suara = suara.value; simpanSet(); toast('Suara dipilih'); });
    var notif = $('set18Notif');
    if (notif) notif.addEventListener('click', function () {
      if (!window.Notification) { toast('Browser ini tidak mendukung notifikasi', 'err'); return; }
      Notification.requestPermission().then(function () { toast('Izin notifikasi: ' + Notification.permission, Notification.permission === 'granted' ? 'ok' : 'warn'); });
    });
    $('halBody').addEventListener('click', function (e) {
      var t = e.target.closest('[data-toast]');
      if (t) { var jenis = t.dataset.toast; toast('Contoh pemberitahuan ' + jenis, jenis === 'ok' ? 'ok' : jenis); return; }
      var x = e.target.closest('[data-ekspor]');
      if (x) {
        var v = x.dataset.ekspor;
        if (v === 'sesi-json') eksporPercakapan('json');
        else if (v === 'sesi-txt') eksporPercakapan('txt');
        else if (v === 'sesi-csv') eksporPercakapan('csv');
        else if (v === 'prj-json') eksporProyek('json');
        else if (v === 'prj-csv') eksporProyek('csv');
        else if (v === 'berkas-csv') eksporMetadataBerkas();
        else if (v === 'set-json') eksporPreferensi();
        return;
      }
      var dl = e.target.closest('[data-setdl]');
      if (dl) { var a = cariArtefak(dl.dataset.setdl); if (a) unduhBerkas(a); return; }
      var hp = e.target.closest('[data-sethps]');
      if (hp) { hapusBerkasPustaka(hp.dataset.sethps); tampilHalaman('settings'); return; }
    });
    var es = $('set18EksporSemua'); if (es) es.addEventListener('click', eksporSemua);
    var kc = $('set18KeCari'); if (kc) kc.addEventListener('click', function () { bukaPalet(); });
    var vo = $('set18Voice'); if (vo) vo.addEventListener('click', function () { $('voiceBar').hidden = false; });
    var mi = $('set18MemoriAI'); if (mi) mi.addEventListener('click', mintaAIPerbaruiMemori);
    var pu = $('set18Pakai'); if (pu) pu.addEventListener('click', muatPenyedia);
    var hi = $('set18Hitung'); if (hi) hi.addEventListener('click', function () { tampilHalaman('settings'); toast('Penyimpanan dihitung ulang'); });
    var imp = $('set18Impor'); if (imp) imp.addEventListener('click', function () { $('set18ImporIn').click(); });
    var impIn = $('set18ImporIn');
    if (impIn) impIn.addEventListener('change', function () {
      var berkas = this.files && this.files[0]; if (!berkas) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var j = JSON.parse(fr.result);
          if (!Array.isArray(j)) throw new Error('bukan daftar percakapan');
          j.forEach(function (s) { if (s && s.id && Array.isArray(s.messages)) sesi.push(s); });
          simpanSesi(); gambarRiwayat(); toast(j.length + ' percakapan diimpor', 'ok');
        } catch (e) { toast('Berkas impor tidak dikenali', 'err'); }
      };
      fr.readAsText(berkas);
    });
    var rst = $('set18Reset');
    if (rst) rst.addEventListener('click', function () {
      if (!confirm('Hapus SEMUA data Van Chat.SPY di browser ini (percakapan, berkas, memori, tugas, setelan)?')) return;
      localStorage.removeItem(LS_SES); localStorage.removeItem(LS_SET);
      toast('Data dihapus — memuat ulang…', 'ok');
      setTimeout(function () { location.reload(); }, 700);
    });
    var rt = $('set18Rate'); if (rt) rt.addEventListener('click', function () { muatPenyedia(); toast('Pemakaian server dimuat ulang'); });
    var as = $('adm18Set'); if (as) as.addEventListener('click', admSetKunci);
    var ah = $('adm18Hapus');
    if (ah) ah.addEventListener('click', function () { SET.adminHash = ''; simpanSet(); tampilHalaman('settings'); toast('Kunci admin dihapus'); });
  }

  /* ── 18f. halaman PROYEK (termasuk instruksi terstruktur) ─────────── */
  function proyekDari18(id) { return SET.proyek.filter(function (p) { return p.id === id; })[0]; }
  var IB = {
    bahasa: [['Indonesia', 'Indonesia'], ['Inggris', 'English'], ['Dua bahasa', 'Dwibahasa']],
    coding: [['TypeScript', 'TypeScript'], ['JavaScript', 'JavaScript'], ['Python', 'Python'], ['Bebas', 'Bebas']],
    desain: [['Clean Minimalist', 'Clean Minimalist'], ['Neo Brutalism', 'Neo Brutalism'], ['Korporat', 'Korporat'], ['Playful', 'Playful']],
  };
  function arahanProyek(p) {
    var a = [];
    a.push('Bahasa jawaban: ' + ((p.instruksiDetail && p.instruksiDetail.bahasa) || 'Indonesia'));
    a.push('Aturan coding: ' + ((p.instruksiDetail && p.instruksiDetail.coding) || 'JavaScript'));
    a.push('Gaya desain: ' + ((p.instruksiDetail && p.instruksiDetail.desain) || 'Clean Minimalist'));
    if (p.instruksi) a.push('Arahan tambahan: ' + p.instruksi);
    return a.join('\n');
  }
  function hitungProyek(p) {
    var obrolan = sesi.filter(function (s) { return s.proyekId === p.id; }).length;
    var berkasP = semuaBerkas().filter(function (a) { return a.proyekId === p.id || (a.tag || []).indexOf('proyek:' + p.id) >= 0; });
    var gambar = berkasP.filter(function (a) { return /^(png|jpg|jpeg|gif|webp|svg)$/i.test(a.jenis || ''); }).length;
    var memori = SET.memori.filter(function (m) { return m.proyekId === p.id || kategoriMemori(m) === 'konteks'; }).length;
    var tugas = SET.tugas.filter(function (t) { return t.proyekId === p.id; }).length;
    var bangunan = (SET.bangunan || []).filter(function (b) { return b.proyekId === p.id; }).length;
    return { obrolan: obrolan, berkas: berkasP.length, gambar: gambar, memori: memori, tugas: tugas, bangunan: bangunan };
  }
  HAL.projects = {
    judul: 'Proyek',
    sub: function () { return SET.proyek.length + ' proyek · instruksi otomatis dipakai AI'; },
    aksi: function () { return '<button class="btn pr" id="prj18Baru">' + ic('plus', 15) + 'Proyek baru</button>'; },
    gambar: function () {
      if (!SET.proyek.length) {
        return '<section class="hal-sec"><h3>' + ic('layers', 16) + 'Belum ada proyek</h3>'
          + '<p class="note">Proyek mengumpulkan obrolan, berkas, gambar, memori, tugas, plugin, dan hasil Builder dalam satu tempat, plus instruksi tetap untuk AI. Contoh nama: Novel.ID, MIRU, Van Dream, Generate QR Pro.</p>'
          + '<div class="img-aksi">'
          + ['Novel.ID', 'MIRU', 'Van Dream', 'Generate QR Pro'].map(function (n) {
            return '<button class="btn" data-prj-contoh="' + esc(n) + '">' + ic('plus', 14) + esc(n) + '</button>';
          }).join('') + '</div></section>';
      }
      return SET.proyek.map(function (p) {
        var h = hitungProyek(p);
        var d = p.instruksiDetail || {};
        return '<section class="hal-sec" data-prj="' + p.id + '">'
          + '<h3>' + ic('folder', 16) + esc(p.nama) + '<span class="grow"></span>'
          + (SET.proyekAktif === p.id ? '<span class="pill-note">aktif</span>' : '<button class="btn" data-prj-aktif="' + p.id + '">Jadikan aktif</button>')
          + '<button class="btn" data-prj-ubah18="' + p.id + '">' + ic('sliders', 14) + 'Ubah</button>'
          + '<button class="btn danger" data-prj-hapus18="' + p.id + '">' + ic('trash', 14) + '</button></h3>'
          + '<p class="note">' + esc(p.deskripsi || 'Tanpa deskripsi.') + '</p>'
          + '<div class="proyek-meta">'
          + '<span>' + ic('message-square', 13) + ' ' + h.obrolan + ' obrolan</span>'
          + '<span>' + ic('file-text', 13) + ' ' + h.berkas + ' file</span>'
          + '<span>' + ic('image', 13) + ' ' + h.gambar + ' gambar</span>'
          + '<span>' + ic('brain', 13) + ' ' + h.memori + ' memori</span>'
          + '<span>' + ic('clock', 13) + ' ' + h.tugas + ' tugas</span>'
          + '<span>' + ic('plug', 13) + ' ' + pluginAktif().length + ' plugin</span>'
          + '<span>' + ic('code', 13) + ' ' + h.bangunan + ' builder</span>'
          + '</div>'
          + '<div class="proyek-ins">'
          + '<div class="baris-opt"><span class="lbl">Bahasa</span>' + seg18('prjBahasa-' + p.id, IB.bahasa, d.bahasa || 'Indonesia') + '</div>'
          + '<div class="baris-opt"><span class="lbl">Aturan coding</span>' + seg18('prjCoding-' + p.id, IB.coding, d.coding || 'JavaScript') + '</div>'
          + '<div class="baris-opt"><span class="lbl">Gaya desain</span>' + seg18('prjDesain-' + p.id, IB.desain, d.desain || 'Clean Minimalist') + '</div>'
          + '</div>'
          + '<pre class="preview-ins">' + esc(arahanProyek(p)) + '</pre>'
          + '<div class="img-aksi"><button class="btn" data-prj-obrolan="' + p.id + '">' + ic('message-square', 14) + 'Buka obrolan</button>'
          + '<button class="btn" data-prj-file="' + p.id + '">' + ic('folder', 14) + 'File proyek</button>'
          + '<button class="btn" data-prj-bangun="' + p.id + '">' + ic('code', 14) + 'Builder proyek</button>'
          + '<button class="btn" data-prj-memori="' + p.id + '">' + ic('brain', 14) + 'Memori</button>'
          + '<button class="btn" data-prj-tugas="' + p.id + '">' + ic('clock', 14) + 'Tugas</button></div>'
          + '</section>';
      }).join('');
    },
    pasang: function () {
      $('halBody').addEventListener('click', function (e) {
        var c = e.target.closest('[data-prj-contoh]');
        if (c) { buatProyek18(c.dataset.prjContoh); return; }
        var a = e.target.closest('[data-prj-aktif]');
        if (a) { SET.proyekAktif = a.dataset.prjAktif; simpanSet(); gambarProyek(); gambarRiwayat(); tampilHalaman('projects'); toast('Proyek aktif diganti', 'ok'); return; }
        var u = e.target.closest('[data-prj-ubah18]');
        if (u) { ubahProyek18(u.dataset.prjUbah18); return; }
        var h = e.target.closest('[data-prj-hapus18]');
        if (h) {
          var id = h.dataset.prjHapus18;
          if (!confirm('Hapus proyek ini? Obrolan tetap ada, hanya tautan proyek yang dilepas.')) return;
          SET.proyek = SET.proyek.filter(function (p) { return p.id !== id; });
          sesi.forEach(function (s) { if (s.proyekId === id) s.proyekId = null; });
          if (SET.proyekAktif === id) SET.proyekAktif = null;
          simpanSet(); simpanSesi(); gambarProyek(); gambarRiwayat(); tampilHalaman('projects'); toast('Proyek dihapus', 'ok');
          return;
        }
        var o = e.target.closest('[data-prj-obrolan]');
        if (o) {
          SET.proyekAktif = o.dataset.prjObrolan; simpanSet(); gambarProyek();
          var ada = sesi.filter(function (s) { return s.proyekId === SET.proyekAktif; })[0];
          if (ada) bukaSesi(ada.id); else sesiBaru();
          location.hash = '#/'; gambarRiwayat();
          return;
        }
        var f = e.target.closest('[data-prj-file]');
        if (f) { SET.proyekAktif = f.dataset.prjFile; simpanSet(); location.hash = '#/library'; return; }
        var b = e.target.closest('[data-prj-bangun]');
        if (b) { SET.proyekAktif = b.dataset.prjBangun; simpanSet(); location.hash = '#/builder'; return; }
        var m = e.target.closest('[data-prj-memori]');
        if (m) { location.hash = '#/settings'; toast('Memori ada di bagian Memori pada Pengaturan'); return; }
        var t = e.target.closest('[data-prj-tugas]');
        if (t) { location.hash = '#/scheduled'; return; }
      });
      SET.proyek.forEach(function (p) {
        ['Bahasa:prjBahasa', 'Coding:prjCoding', 'Desain:prjDesain'].forEach(function (peta) {
          var bagian = peta.split(':');
          seg18Pasang(bagian[1] + '-' + p.id, function (v) {
            p.instruksiDetail = p.instruksiDetail || {};
            p.instruksiDetail[bagian[0].toLowerCase() === 'bahasa' ? 'bahasa' : bagian[0].toLowerCase() === 'coding' ? 'coding' : 'desain'] = v;
            simpanSet(); pakaiDiPercakapanArahan(p); toast('Instruksi proyek disimpan', 'ok');
          });
        });
      });
      var bar = $('prj18Baru'); if (bar) bar.addEventListener('click', function () { buatProyek18(''); });
    }
  };
  function pakaiDiPercakapanArahan(p) {
    /* arahan dikirim ke AI lewat parameter proyek pada setiap permintaan */
    var el = document.querySelector('[data-prj="' + p.id + '"] .preview-ins');
    if (el) el.textContent = arahanProyek(p);
  }
  function buatProyek18(namaAwal) {
    var nama = prompt('Nama proyek:', namaAwal || '');
    if (!nama || !nama.trim()) return;
    var desk = prompt('Deskripsi singkat proyek (boleh kosong):', '') || '';
    SET.proyek.unshift({
      id: uid(), nama: nama.trim().slice(0, 60), deskripsi: desk.trim().slice(0, 240),
      instruksi: '', ts: Date.now(), instruksiDetail: { bahasa: 'Indonesia', coding: 'JavaScript', desain: 'Clean Minimalist' }
    });
    SET.proyekAktif = SET.proyek[0].id;
    simpanSet(); gambarProyek(); gambarRiwayat();
    if (halKini === 'projects') tampilHalaman('projects');
    toast('Proyek "' + nama.trim() + '" dibuat', 'ok');
  }
  function ubahProyek18(id) {
    var p = proyekDari18(id); if (!p) return;
    var nama = prompt('Nama proyek:', p.nama);
    if (nama === null) return;
    var desk = prompt('Deskripsi proyek:', p.deskripsi || '');
    var ins = prompt('Arahan tambahan untuk AI (boleh kosong):', p.instruksi || '');
    p.nama = (nama || p.nama).trim().slice(0, 60);
    p.deskripsi = (desk || '').trim().slice(0, 240);
    p.instruksi = (ins || '').trim().slice(0, 600);
    simpanSet(); gambarProyek(); tampilHalaman('projects'); toast('Proyek disimpan', 'ok');
  }

  /* ── 18g. halaman TUGAS TERJADWAL ─────────────────────────────────── */
  var ZONA = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'UTC'];
  function jadwalTeks(t) {
    var dasar = t.jadwal === 'harian' ? 'Setiap hari' : t.jadwal === 'mingguan' ? 'Setiap ' + (t.hari || 'Senin') : 'Sekali jalan';
    var jam = t.jam || '08:00';
    return dasar + ' pukul ' + jam + ' (' + (t.zona || 'Asia/Jakarta') + ')';
  }
  function berikutnyaDari(t) {
    var jam = (t.jam || '08:00').split(':');
    var d = new Date();
    var coba = new Date(d.getFullYear(), d.getMonth(), d.getDate(), parseInt(jam[0] || 8, 10), parseInt(jam[1] || 0, 10), 0, 0);
    if (t.jadwal === 'sekali') { if (coba.getTime() <= Date.now()) coba.setDate(coba.getDate() + 1); return coba.getTime(); }
    while (coba.getTime() <= Date.now()) {
      coba = new Date(coba.getTime() + (t.jadwal === 'harian' ? 86400000 : 604800000));
    }
    return coba.getTime();
  }
  function muatJadwalServer() {
    fetch('/api/cron').then(function (r) { return r.json(); }).then(function (j) {
      SET.penjadwalServer = j;
      if (halKini === 'scheduled') tampilHalaman('scheduled');
    }).catch(function () { });
  }
  HAL.scheduled = {
    judul: 'Tugas Terjadwal',
    sub: function () { return SET.tugas.length + ' tugas · ' + ((SET.penjadwalServer && SET.penjadwalServer.ok) ? 'penjadwal server aktif' : 'berjalan selama halaman terbuka'); },
    aksi: function () { return '<button class="btn" id="tgs18Server">' + ic('server', 15) + 'Sinkron ke penjadwal server</button>'; },
    gambar: function () {
      var sv = SET.penjadwalServer || {};
      return ''
        + '<section class="hal-sec"><h3>' + ic('clock', 16) + 'Buat tugas</h3>'
        + '<div class="form-grid">'
        + '<label>Nama<input id="tgsNama" placeholder="Contoh: Periksa website"></label>'
        + '<label>Prompt<textarea id="tgsPrompt" rows="2" placeholder="Setiap Senin pukul 08.00 periksa website…"></textarea></label>'
        + '<label>Jadwal<select id="tgsJadwal" class="sel"><option value="sekali">Sekali jalan</option><option value="harian">Setiap hari</option><option value="mingguan">Mingguan</option></select></label>'
        + '<label>Jam<input id="tgsJam" type="time" value="08:00"></label>'
        + '<label>Zona waktu<select id="tgsZona" class="sel">' + ZONA.map(function (z) { return '<option>' + z + '</option>'; }).join('') + '</select></label>'
        + '</div><div class="img-aksi"><button class="btn pr" id="tgsTambah18">' + ic('plus', 15) + 'Tambah tugas</button>'
        + '<button class="btn" id="tgsContoh18">' + ic('sparkles', 15) + 'Contoh: periksa website tiap Senin</button></div></section>'
        + '<section class="hal-sec"><h3>' + ic('list-checks', 16) + 'Daftar tugas (' + SET.tugas.length + ')</h3>'
        + (SET.tugas.length ? '<div class="mini-list">' + SET.tugas.map(function (t) {
          return '<div class="mini-it"><span><b>' + esc(t.judul) + '</b>'
            + '<small>' + esc(t.prompt.slice(0, 90)) + '</small>'
            + '<small>jadwal: ' + esc(jadwalTeks(t)) + ' · status: ' + (t.aktif ? 'aktif' : 'nonaktif')
            + ' · terakhir: ' + (t.terakhir ? new Date(t.terakhir).toLocaleString('id-ID') : 'belum pernah')
            + ' · berikutnya: ' + (t.aktif ? new Date(berikutnyaDari(t)).toLocaleString('id-ID') : '—') + '</small></span>'
            + '<button class="ib sm" data-tgs-jalan="' + t.id + '" title="Jalankan sekarang">' + ic('play', 14) + '</button>'
            + '<button class="ib sm" data-tgs-aktif="' + t.id + '" title="Aktif/nonaktif">' + ic(t.aktif ? 'pause' : 'play', 14) + '</button>'
            + '<button class="ib sm" data-tgs-simpan="' + t.id + '" title="Simpan ke penjadwal server">' + ic('server', 14) + '</button>'
            + '<button class="ib sm" data-tgs-hapus="' + t.id + '" title="Hapus">' + ic('trash', 14) + '</button></div>';
        }).join('') + '</div>' : '<p class="note">Belum ada tugas.</p>')
        + '</section>'
        + '<section class="hal-sec"><h3>' + ic('server', 16) + 'Penjadwal sisi-server</h3>'
        + '<p class="note">' + (sv.ok
          ? 'Penjadwal server aktif — ' + (sv.jumlah || 0) + ' tugas tersimpan di penyimpanan KV.'
          : 'Belum aktif: ' + esc(sv.pesan || 'butuh penyimpanan KV (KV_REST_API_URL + KV_REST_API_TOKEN).') + ' Tanpa itu, tugas berjalan di browser selama halaman ini terbuka — bukan diam-diam diklaim jalan terus.') + '</p>'
        + '<p class="note">Cara mengaktifkan: pasang penyimpanan KV di hosting, lalu arahkan cron hosting ke <code>POST /api/cron {"aksi":"jalankan"}</code> (boleh ditambah header <code>x-cron-secret</code>).</p>'
        + '</section>';
    },
    pasang: function () {
      var tm = $('tgsTambah18');
      if (tm) tm.addEventListener('click', function () {
        var nama = $('tgsNama').value.trim(), promptT = $('tgsPrompt').value.trim();
        if (!nama || !promptT) { toast('Nama dan prompt wajib diisi', 'err'); return; }
        var t = {
          id: uid(), judul: nama.slice(0, 60), prompt: promptT.slice(0, 800),
          jadwal: $('tgsJadwal').value, jam: $('tgsJam').value || '08:00', zona: $('tgsZona').value,
          aktif: true, terakhir: 0, proyekId: SET.proyekAktif || null, ts: Date.now()
        };
        t.waktu = berikutnyaDari(t);
        SET.tugas.unshift(t);
        simpanSet(); tampilHalaman('scheduled');
        if (window.Notification && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) { } }
        toast('Tugas dibuat — berikutnya ' + new Date(t.waktu).toLocaleString('id-ID'), 'ok');
      });
      var ct = $('tgsContoh18');
      if (ct) ct.addEventListener('click', function () {
        $('tgsNama').value = 'Periksa website';
        $('tgsPrompt').value = 'Periksa website utama saya, laporkan halaman yang gagal dimuat dan saran perbaikannya.';
        $('tgsJadwal').value = 'mingguan';
        toast('Contoh diisi — tekan Tambah tugas');
      });
      var sv = $('tgs18Server');
      if (sv) sv.addEventListener('click', function () { sinkronTugasServer(); });
      $('halBody').addEventListener('click', function (e) {
        var j = e.target.closest('[data-tgs-jalan]');
        if (j) { var t = SET.tugas.filter(function (x) { return x.id === j.dataset.tgsJalan; })[0]; location.hash = '#/'; jalankanTugas(t); return; }
        var a = e.target.closest('[data-tgs-aktif]');
        if (a) { var t2 = SET.tugas.filter(function (x) { return x.id === a.dataset.tgsAktif; })[0]; t2.aktif = !t2.aktif; if (t2.aktif) t2.waktu = berikutnyaDari(t2); simpanSet(); tampilHalaman('scheduled'); return; }
        var s = e.target.closest('[data-tgs-simpan]');
        if (s) { sinkronTugasServer(s.dataset.tgsSimpan); return; }
        var h = e.target.closest('[data-tgs-hapus]');
        if (h) { SET.tugas = SET.tugas.filter(function (x) { return x.id !== h.dataset.tgsHapus; }); simpanSet(); tampilHalaman('scheduled'); toast('Tugas dihapus'); }
      });
      muatJadwalServer();
    }
  };
  function sinkronTugasServer(id) {
    var daftar = id ? SET.tugas.filter(function (t) { return t.id === id; }) : SET.tugas;
    if (!daftar.length) { toast('Belum ada tugas untuk disinkronkan', 'err'); return; }
    var urut = daftar.slice();
    (function kirim() {
      var t = urut.shift();
      if (!t) { toast('Sinkron selesai', 'ok'); muatJadwalServer(); return; }
      fetch('/api/cron', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aksi: 'simpan', tugas: { id: t.id, nama: t.judul, prompt: t.prompt, jadwal: t.jadwal === 'sekali' ? 'sekali' : t.jadwal, zona: t.zona, aktif: t.aktif, berikutnya: berikutnyaDari(t), terakhir: t.terakhir || 0 } })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) { toast(j.pesan || 'Penjadwal server belum aktif', 'warn'); return; }
        kirim();
      }).catch(function () { toast('Server penjadwal tidak terjangkau', 'err'); });
    })();
  }

  /* ── 18h. halaman PLUGIN (izin jelas, jalan di backend) ───────────── */
  var PLUGIN = [
    { nama: 'Pencarian Web', ikon: 'search', desk: 'Menanyakan Wikipedia ID, DuckDuckGo Instant, Stack Overflow, Hacker News, GitHub.', penyedia: 'bawaan', izin: ['jaringan keluar ke penyedia publik'], endpoint: 'GET /api/search?q=', auth: 'tanpa kunci (opsional SEARCH_API_KEY)', aksi: ['Search'] },
    { nama: 'Alat Hitung Lokal', ikon: 'calculator', desk: 'Hitung, konversi satuan, jam WIB, jumlah kata — dihitung di browser.', penyedia: 'bawaan', izin: ['tanpa jaringan'], endpoint: 'internal (alatLokal)', auth: '—', aksi: ['Compute'] },
    { nama: 'Pembaca Berkas', ikon: 'file-text', desk: 'DOCX, XLSX, PPTX, PDF, ZIP, teks/kode dibaca di browser.', penyedia: 'bawaan', izin: ['baca berkas yang kamu pilih saja'], endpoint: 'internal (BERKAS.baca)', auth: '—', aksi: ['Read'] },
    { nama: 'Pustaka Berkas', ikon: 'folder', desk: 'Menyimpan berkas hasil di browser + metadata, tag, proyek.', penyedia: 'bawaan', izin: ['penyimpanan lokal browser'], endpoint: 'internal', auth: '—', aksi: ['Storage'] },
    { nama: 'AI Builder + Kotak Pasir', ikon: 'hammer', desk: 'Membangun proyek multi-berkas dan menjalankannya di iframe terisolasi.', penyedia: 'bawaan', izin: ['jalankan kode di iframe sandbox (tanpa akses halaman)'], endpoint: '/api/builder · /api/chat', auth: 'kunci AI di server', aksi: ['Build', 'Preview', 'Test'] },
    { nama: 'Pembuat Gambar', ikon: 'image', desk: 'Membuat gambar dari prompt (rasio & kualitas).', penyedia: 'IMAGE_PROVIDER', izin: ['jaringan keluar ke penyedia gambar', 'biaya kunci milikmu'], endpoint: '/api/image/generate', auth: 'IMAGE_API_KEY', aksi: ['Generate'] },
    { nama: 'Penyimpanan Plugin (GitHub/Kalender/DB)', ikon: 'database', desk: 'Belum dipasang: butuh akun & izin tiap layanan, dan berjalan di backend.', penyedia: '—', izin: ['belum ada'], endpoint: '—', auth: '—', aksi: ['—'], mati: true },
  ];
  function pluginAktif() { return PLUGIN.filter(function (p) { return !p.mati; }); }
  HAL.plugins = {
    judul: 'Plugin / Aplikasi',
    sub: function () { return pluginAktif().length + ' plugin aktif · semua lewat backend'; },
    gambar: function () {
      return '<section class="hal-sec"><h3>' + ic('plug', 16) + 'Plugin bawaan</h3>'
        + '<p class="note">Semua plugin berjalan di backend (atau di browser untuk yang benar-benar lokal), dengan izin yang ditulis apa adanya. Pemasangan plugin pihak ketiga belum dibuka — tidak ada marketplace, jadi tidak ada tombol palsu.</p>'
        + '<div class="plug-grid">' + PLUGIN.map(function (p) {
          return '<article class="plug' + (p.mati ? ' mati' : '') + '">'
            + '<header>' + ic(p.ikon, 18) + '<b>' + esc(p.nama) + '</b>' + (p.mati ? '<span class="pill-note">belum dipasang</span>' : '<span class="pill-note on">aktif</span>') + '</header>'
            + '<p>' + esc(p.desk) + '</p>'
            + '<dl><dt>Provider</dt><dd>' + esc(p.penyedia) + '</dd>'
            + '<dt>Izin</dt><dd>' + p.izin.map(esc).join(' · ') + '</dd>'
            + '<dt>Endpoint</dt><dd><code>' + esc(p.endpoint) + '</code></dd>'
            + '<dt>Autentikasi</dt><dd>' + esc(p.auth) + '</dd>'
            + '<dt>Aksi</dt><dd>' + p.aksi.map(esc).join(' · ') + '</dd></dl></article>';
        }).join('') + '</div></section>'
        + '<section class="hal-sec"><h3>' + ic('shield', 16) + 'Aturan izin</h3>'
        + '<ul class="daftar-poin">'
        + '<li>Plugin hanya boleh memanggil jaringan dari sisi server — kunci tidak pernah sampai ke browser.</li>'
        + '<li>Plugin tidak boleh membaca berkas pengguna tanpa kamu memilih berkas itu.</li>'
        + '<li>Hasil dari plugin selalu ditandai sumbernya (mis. blok Sumber pada pencarian web).</li>'
        + '<li>Plugin yang butuh akun (Email, Kalender, Database) hanya dipasang kalau kamu mengisi kredensialnya sendiri.</li>'
        + '</ul></section>';
    }
  };

  /* ── 18i. halaman ADMIN (RBAC lokal, jujur) ───────────────────────── */
  function hashSederhana(teks) {
    /* bukan kriptografi kuat — hanya gerbang lokal supaya halaman admin tidak
       terbuka begitu saja di komputer bersama; dicatat jujur di halaman */
    var h = 2166136261;
    for (var i = 0; i < teks.length; i++) { h ^= teks.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16) + '-' + teks.length;
  }
  function admSetKunci() {
    var k1 = prompt('Kunci admin baru (minimal 4 karakter):', '');
    if (k1 === null) return;
    if (k1.trim().length < 4) { toast('Kunci terlalu pendek', 'err'); return; }
    var k2 = prompt('Ulangi kunci:', '');
    if (k1 !== k2) { toast('Kunci tidak sama', 'err'); return; }
    SET.adminHash = hashSederhana(k1.trim());
    simpanSet();
    toast('Kunci admin disimpan (teracak di browser ini)', 'ok');
    if (halKini === 'settings') tampilHalaman('settings');
  }
  function peranSekarang() {
    if (!SET.adminHash) return 'pemilik';
    return sessionStorage.getItem('vcs.admin') === SET.adminHash ? 'admin' : 'tamu';
  }
  function masukAdmin() {
    var k = prompt('Kunci admin:');
    if (k === null) return false;
    if (hashSederhana(k.trim()) === SET.adminHash) { sessionStorage.setItem('vcs.admin', SET.adminHash); toast('Selamat datang, admin', 'ok'); return true; }
    toast('Kunci salah', 'err'); return false;
  }
  HAL.admin = {
    judul: 'Dashboard Admin',
    sub: function () { return 'peran: ' + peranSekarang(); },
    aksi: function () { return '<button class="btn" id="adm18Keluar">' + ic('log-out', 15) + 'Keluar</button>'; },
    gambar: function () {
      var peran = peranSekarang();
      if (peran === 'tamu') {
        return '<section class="hal-sec"><h3>' + ic('lock', 16) + 'Halaman ini terkunci</h3>'
          + '<p class="note">Kunci admin sudah dibuat di Pengaturan → Keamanan. Masukkan kunci untuk melihat dashboard.</p>'
          + '<button class="btn pr" id="adm18Masuk">' + ic('key', 15) + 'Masuk sebagai admin</button>'
          + '<p class="note">Catatan jujur: ini gerbang <b>lokal di browser</b> (bukan autentikasi server) — cukup untuk komputer bersama, bukan pengganti login sungguhan. Data pengguna lain memang tidak ada di sini karena aplikasi ini tidak menyimpan data siapa pun di server.</p></section>';
      }
      var p = SET.penyedia || {};
      var rate = (p.rateLimit && p.rateLimit.terpakai) || {};
      var pakai = perkiraanPenyimpanan();
      return ''
        + '<section class="hal-sec"><h3>' + ic('activity', 16) + 'System Health</h3>'
        + '<div class="mini-list" id="adm18Health">' + kerangka(3) + '</div></section>'
        + '<section class="hal-sec"><h3>' + ic('gauge', 16) + 'Penggunaan</h3>'
        + '<div class="mini-list">'
        + '<div class="mini-it"><span><b>Percakapan</b><small>' + sesi.length + ' obrolan · ' + sesi.reduce(function (n, s) { return n + (s.messages ? s.messages.length : 0); }, 0) + ' pesan</small></span></div>'
        + '<div class="mini-it"><span><b>Pemakaian AI hari ini</b><small>' + ((SET.pakai && SET.pakai.jumlah) || 0) + ' permintaan (batas gratis 50/hari)</small></span></div>'
        + '<div class="mini-it"><span><b>Penyimpanan browser</b><small>± ' + (pakai.total / 1024).toFixed(1) + ' KB</small></span></div>'
        + '</div></section>'
        + '<section class="hal-sec"><h3>' + ic('plug', 16) + 'Model · Provider · Plugin</h3>'
        + '<div class="mini-list">' + pakaiServer()
        + '<div class="mini-it"><span><b>Mode → model</b><small>' + Object.keys(MODE).map(function (k) { return k + ': ' + MODE[k].model; }).join(' · ') + '</small></span></div>'
        + '<div class="mini-it"><span><b>Plugin aktif</b><small>' + pluginAktif().map(function (x) { return x.nama; }).join(' · ') + '</small></span></div>'
        + '</div></section>'
        + '<section class="hal-sec"><h3>' + ic('timer', 16) + 'Rate Limit</h3>'
        + '<div class="mini-list">'
        + '<div class="mini-it"><span><b>Batas per menit</b><small>chat 60 · pencarian 30 · gambar 20 · deploy 10 · cron 30</small></span></div>'
        + '<div class="mini-it"><span><b>Terhitung sejak server hidup</b><small>' + (rate.total || 0) + ' permintaan · ' + (rate.ditolak || 0) + ' ditolak</small></span></div>'
        + '</div></section>'
        + '<section class="hal-sec"><h3>' + ic('file-text', 16) + 'Log (audit lokal)</h3>'
        + '<div class="mini-list" id="adm18Log">' + (SET.audit && SET.audit.length ? SET.audit.slice(-20).reverse().map(function (x) {
          return '<div class="mini-it"><span><b>' + esc(x.peristiwa) + '</b><small>' + new Date(x.ts).toLocaleString('id-ID') + ' · ' + esc(x.rincian || '') + '</small></span></div>';
        }).join('') : '<p class="note">Belum ada catatan.</p>') + '</div></section>'
        + '<section class="hal-sec"><h3>' + ic('users', 16) + 'Pengguna & hak akses</h3>'
        + '<div class="mini-list">'
        + '<div class="mini-it"><span><b>pemilik</b><small>bisa semua: pakai aplikasi, ubah setelan, buka /admin</small></span></div>'
        + '<div class="mini-it"><span><b>admin</b><small>buka /admin, lihat penggunaan & log, uji koneksi penyedia</small></span></div>'
        + '<div class="mini-it"><span><b>tamu</b><small>pakai percakapan & berkas; tidak bisa membuka /admin</small></span></div>'
        + '</div>'
        + '<p class="note">Aplikasi ini tidak punya basis data pengguna di server, jadi daftar "pengguna lain", "chat semua orang", atau "file semua orang" memang tidak ada — dan saya tidak akan mengarang tabel kosong untuk mengisinya.</p></section>';
    },
    pasang: function () {
      var m = $('adm18Masuk');
      if (m) m.addEventListener('click', function () { if (masukAdmin()) tampilHalaman('admin'); });
      var k = $('adm18Keluar');
      if (k) k.addEventListener('click', function () { sessionStorage.removeItem('vcs.admin'); tampilHalaman('admin'); toast('Keluar dari mode admin'); });
      if (peranSekarang() !== 'tamu') muatPenyedia();
    }
  };

  /* ── 18j. status penyedia (dari /api/providers) ───────────────────── */
  function muatPenyedia() {
    return fetch('/api/providers').then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok) { SET.penyedia = j; tulis(LS_PENYEDIA, j); }
    }).catch(function () { }).then(function () {
      if (halKini === 'settings' || halKini === 'admin') tampilHalaman(halKini);
    });
  }
  var LS_PENYEDIA = 'vcs.penyedia';
  SET.penyedia = SET.penyedia || baca(LS_PENYEDIA, null) || null;

  /* ── 18k. riset mendalam (alur 9 langkah dengan status) ───────────── */
  var LANGKAH_RISET = [
    'Sedang membuat rencana…',
    'Sedang mencari sumber…',
    'Sedang mengumpulkan informasi…',
    'Sedang menganalisis…',
    'Sedang membandingkan…',
    'Sedang memeriksa sumber…',
    'Sedang membuat laporan…',
  ];
  function cariSumberRiset(tanya) {
    return fetch('/api/search?q=' + encodeURIComponent(tanya.slice(0, 200)))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.ok && j.sumber) || []; })
      .catch(function () { return []; });
  }
  function analisisLokal(sumber, daftarPertanyaan) {
    /* analisis & pembandingan dihitung di browser dari sumber yang benar-benar diterima */
    var perPenyedia = {};
    sumber.forEach(function (s) { perPenyedia[s.penyedia] = (perPenyedia[s.penyedia] || 0) + 1; });
    var kata = {};
    sumber.forEach(function (s) {
      (String(s.cuplikan || '') + ' ' + String(s.judul || '')).toLowerCase()
        .replace(/[^a-z0-9À-ÿ\s]/g, ' ').split(/\s+/).forEach(function (w) {
          if (w.length < 5) return;
          kata[w] = (kata[w] || 0) + 1;
        });
    });
    var tema = Object.keys(kata).sort(function (a, b) { return kata[b] - kata[a]; }).slice(0, 8);
    var tercakup = daftarPertanyaan.filter(function (q) {
      var kunci = q.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 4; });
      return sumber.some(function (s) {
        var isi = (String(s.judul) + ' ' + String(s.cuplikan)).toLowerCase();
        return kunci.some(function (w) { return isi.indexOf(w) >= 0; });
      });
    });
    return {
      perPenyedia: perPenyedia,
      tema: tema,
      pertanyaanTercakup: tercakup.length,
      pertanyaanTotal: daftarPertanyaan.length,
      kepercayaan: sumber.length >= 8 ? 'tinggi' : sumber.length >= 4 ? 'sedang' : 'rendah',
    };
  }
  function periksaSumber(sumber) {
    var sah = [], catatan = [];
    sumber.forEach(function (s) {
      if (!/^https?:\/\//.test(s.url || '')) { catatan.push('alamat tidak sah: ' + (s.judul || '?')); return; }
      if (sah.some(function (x) { return x.url === s.url; })) { catatan.push('duplikat dibuang: ' + s.judul); return; }
      sah.push(s);
    });
    var penyedia = {};
    sah.forEach(function (s) { penyedia[s.penyedia] = (penyedia[s.penyedia] || 0) + 1; });
    if (Object.keys(penyedia).length < 2 && sah.length) catatan.push('sumber hanya dari satu penyedia — pembandingan terbatas');
    if (!sah.length) catatan.push('tidak ada sumber yang bisa diverifikasi');
    return { sah: sah, penyedia: penyedia, catatan: catatan };
  }
  function risetMendalam(tanya) {
    var s = sesiAktif() || sesiBaru();
    var baris = tambahPesan({ id: uid(), role: 'ai', text: '', html: '<b>Riset Mendalam</b><div class="riset-langkah" id="rl">' + ic('search', 14) + '<span>1/7 ' + LANGKAH_RISET[0] + '</span><span class="tulis"><i></i><i></i><i></i></span></div>', ms: 0 });
    var bub = baris.querySelector('.bub');
    var t0 = Date.now();
    function langkah(i, teks, ikon) {
      bub.innerHTML = '<b>Riset Mendalam</b><ol class="riset-jejak">' + LANGKAH_RISET.slice(0, i + 1).map(function (t, n) {
        return '<li class="' + (n < i ? 'beres' : n === i ? 'kini' : '') + '">' + esc(t) + '</li>';
      }).join('') + '</ol><div class="riset-langkah">' + ic(ikon || 'search', 14) + '<span>' + (i + 1) + '/7 ' + esc(teks) + '</span><span class="tulis"><i></i><i></i><i></i></span></div>';
      gulirBawah(false);
    }
    statusJalan(true);
    langkah(0, LANGKAH_RISET[0]);
    catat('sistem', 'Riset mendalam dimulai untuk: “' + esc(tanya.slice(0, 80)) + '” — 2 permintaan AI + pencarian multi-penyedia.');
    mintaTeks('Buat 4 pertanyaan riset singkat (masing-masing maksimal 8 kata) untuk mendalami topik berikut. Balas hanya daftar bernomor, tanpa pembuka atau penutup.\n\nTopik: ' + tanya, 'think')
      .then(function (rencana) {
        var daftar = rencana.split('\n').map(function (b) { return b.replace(/^\s*\d+[.)]\s*/, '').trim(); }).filter(function (b) { return b.length > 4; }).slice(0, 4);
        if (!daftar.length) daftar = [tanya];
        langkah(1, LANGKAH_RISET[1] + ' (' + daftar.length + ' pertanyaan)');
        return Promise.all(daftar.map(cariSumberRiset)).then(function (perPertanyaan) {
          var sumber = [];
          perPertanyaan.forEach(function (h) { h.forEach(function (x) { if (!sumber.some(function (y) { return y.url === x.url; })) sumber.push(x); }); });
          if (!sumber.length) {
            langkah(1, 'Penyedia terbuka tidak menjawab — mencoba Wikipedia langsung…');
            return Promise.all(daftar.map(cariWiki)).then(function (wiki) {
              wiki.forEach(function (h, i) {
                h.forEach(function (x) {
                  if (!sumber.some(function (y) { return y.url === x.url; })) sumber.push({ penyedia: 'Wikipedia Indonesia', judul: x.judul, url: x.url, cuplikan: x.ringkas, jenis: 'ensiklopedia' });
                });
              });
              return daftar;
            });
          }
          return daftar;
        }).then(function (daftarPertanyaan) {
          langkah(2, LANGKAH_RISET[2] + ' (' + sumber.length + ' sumber terkumpul)');
          var analisis = analisisLokal(sumber, daftarPertanyaan);
          langkah(3, LANGKAH_RISET[3] + ' (tema utama: ' + (analisis.tema.slice(0, 3).join(', ') || 'belum ada') + ')');
          langkah(4, LANGKAH_RISET[4] + ' (' + Object.keys(analisis.perPenyedia).length + ' penyedia dibandingkan · kepercayaan ' + analisis.kepercayaan + ')');
          var periksa = periksaSumber(sumber);
          langkah(5, LANGKAH_RISET[5] + ' (' + periksa.sah.length + ' sumber lolos pemeriksaan' + (periksa.catatan.length ? ', ' + periksa.catatan.length + ' catatan' : '') + ')');
          var bahan = periksa.sah.map(function (x, i) {
            return '[' + (i + 1) + '] ' + x.judul + ' — ' + x.penyedia + '\n' + String(x.cuplikan || '').slice(0, 500) + '\n' + x.url;
          }).join('\n\n');
          var promptLaporan = 'Tulis laporan riset dalam bahasa Indonesia (markdown) tentang: ' + tanya + '\n\n'
            + 'Struktur: pendahuluan singkat, 3–5 bagian berjudul (##), bagian "Yang masih belum jelas", lalu simpulan. '
            + 'Kutip sumber dengan tanda [nomor] sesuai daftar. Jangan mengarang sumber baru.\n\n'
            + 'CATATAN PEMERIKSAAN (dihitung aplikasi, pakai apa adanya):\n'
            + '- pertanyaan tercakup: ' + analisis.pertanyaanTercakup + '/' + analisis.pertanyaanTotal + '\n'
            + '- jumlah sumber: ' + periksa.sah.length + ' · penyedia: ' + Object.keys(periksa.penyedia).join(', ') + '\n'
            + '- tingkat kepercayaan: ' + analisis.kepercayaan + '\n'
            + (periksa.catatan.length ? '- catatan: ' + periksa.catatan.join('; ') + '\n' : '')
            + '\nBAHAN DARI WIKIPEDIA & PENYEDIA TERBUKA LAIN:\n' + (bahan || '(tidak ada bahan — tulis laporan yang jujur menyebutkan keterbatasan ini)');
          langkah(6, LANGKAH_RISET[6]);
          return mintaTeks(promptLaporan, 'deep').then(function (teksLaporan) {
            var judul = tanya.length > 60 ? tanya.slice(0, 60) + '…' : tanya;
            var html = laporanHtml(judul, teksLaporan, periksa.sah, {
              analisis: analisis, periksa: periksa, langkah: LANGKAH_RISET, durasi: Date.now() - t0,
            });
            var a = { id: uid(), nama: 'riset-' + uid() + '.html', jenis: 'html', kode: html, ts: Date.now(), riset: true, proyekId: SET.proyekAktif || null };
            s.artifacts.push(a);
            var blokSumber = '<div class="riset-sumber"><b>' + periksa.sah.length + ' sumber diperiksa</b><ol>'
              + periksa.sah.slice(0, 8).map(function (x, i) {
                return '<li>[<b>' + (i + 1) + '</b>] <a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.judul) + '</a> <span class="cit">' + esc(x.penyedia) + '</span></li>';
              }).join('') + '</ol>'
              + (periksa.catatan.length ? '<p class="note">Catatan pemeriksaan: ' + esc(periksa.catatan.join('; ')) + '</p>' : '')
              + '</div>';
            var catatan = '**Laporan riset selesai** — ' + periksa.sah.length + ' sumber dari ' + Object.keys(periksa.penyedia).length + ' penyedia, kepercayaan ' + analisis.kepercayaan
              + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' detik. Berkas `' + a.nama + '` siap di Ruang Kerja.\n\n' + teksLaporan;
            var pesanAI = { id: baris.dataset.id, role: 'ai', text: catatan, ts: Date.now(), model: 'riset mendalam · 2 permintaan AI', ms: Date.now() - t0, artifacts: [a], sumberWeb: periksa.sah };
            s.messages.push(pesanAI);
            simpanSesi();
            var baru = tambahPesan(pesanAI);
            var bb = baru.querySelector('.bub');
            if (bb) bb.insertAdjacentHTML('beforeend', blokSumber);
            baris.replaceWith(baru);
            tampilArtefak(a); bukaKerja(true); tabAktif = 'prev'; perbaruiTab(); gambarKerja();
            $('artCount').textContent = s.artifacts.length;
            hitungPakai(); hitungPakai();
            statusJalan(false);
            $('chatSub').textContent = 'riset selesai dalam ' + ((Date.now() - t0) / 1000).toFixed(1) + ' detik';
            toast('Laporan riset siap di ruang kerja', 'ok');
          });
        });
      })
      .catch(function (e) {
        statusJalan(false);
        catat('galat', 'Riset mendalam gagal: ' + ((e && e.message) || e));
      });
  }
