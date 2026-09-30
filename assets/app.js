/* ══════════════════════════════════════════════════════════════════════
   Van Chat.SPY — mesin aplikasi
   • percakapan mengalir (streaming) + hentikan
   • render markdown + pewarnaan kode (HTML/CSS/JS/JSON/Python/…)
   • ruang kerja: pratinjau, kode, berkas hasil, unduh, ukuran perangkat
   • riwayat lengkap (cari · ganti nama · hapus) di satu halaman
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 0. Alat bantu dasar ───────────────────────────────────────────── */
  var $ = function (id) { return document.getElementById(id); };
  var LS_SES = 'vcs.sesi', LS_SET = 'vcs.setelan';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function kb(n) { return n >= 1024 * 1024 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B'; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function jam(ts) { return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }
  function ic(n, s) { return window.IC.icon(n, s || 16); }

  var toastEl, toastT;
  function toast(txt, jenis) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
    toastEl.innerHTML = ic(jenis === 'err' ? 'circle-alert' : jenis === 'ok' ? 'circle-check' : 'info', 16) + '<span>' + esc(txt) + '</span>';
    toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 2600);
  }
  function unduh(nama, isi, tipe) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([isi], { type: tipe || 'text/plain;charset=utf-8' }));
    a.download = nama; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function salin(teks, labelEl, labelSukses) {
    var beres = function () {
      if (!labelEl) return;
      var lama = labelEl.innerHTML;
      labelEl.innerHTML = ic('check', 14) + '<span>' + (labelSukses || 'Tersalin') + '</span>';
      setTimeout(function () { labelEl.innerHTML = lama; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(teks).then(beres, function () { cadangan(); });
    else cadangan();
    function cadangan() {
      var t = document.createElement('textarea'); t.value = teks; t.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); beres(); } catch (e) { toast('Gagal menyalin', 'err'); }
      t.remove();
    }
  }

  /* ── 1. Mode AI ────────────────────────────────────────────────────── */
  var MODE = {
    fast: { label: 'Fast', ikon: 'zap', model: 'Ling 3.0 Flash', ket: 'Jawaban kilat untuk tanya-jawab harian (~1–3 detik).' },
    think: { label: 'Think', ikon: 'sparkles', model: 'Dots 3 Note', ket: 'Menimbang dulu sebelum menjawab — tulisan & kode lebih rapi.' },
    deep: { label: 'Deep', ikon: 'brain', model: 'Nex 2.5 Pro', ket: 'Analisis lebih dalam, enak untuk pembahasan panjang.' },
    expert: { label: 'Expert', ikon: 'gem', model: 'Nemotron 3 Super 120B', ket: 'Model terbesar untuk tugas berat & kode rumit.' }
  };

  /* ── 2. Setelan & simpanan ─────────────────────────────────────────── */
  var SET = Object.assign({
    tema: 'dark', fs: 16, feedW: 760, mode: 'fast',
    stream: true, autoTTS: false, enterKirim: true, refWiki: false, cariWeb: false, suara: '',
    railW: null, workW: null, kerjaTerbuka: true, relTerbuka: false,
    memori: [], memoriAktif: true, proyek: [], proyekAktif: null,
    tugas: [], berkas: [],
    nama: '', bahasa: 'id', tanggal: 'id', zona: 'Asia/Jakarta', mPilih: {},
    /* penyedia AI yang diatur dari halaman Pengaturan (kunci hidup di browser ini) */
    penyediaSet: null,
    pakai: { tanggal: '', jumlah: 0 }
  }, baca(LS_SET, {}));

  var sesi = baca(LS_SES, []);
  var aktif = null;          /* id sesi aktif */
  var artefakAktif = null;   /* artefak yang tampil di ruang kerja */
  var tabAktif = 'prev';
  var lebarPerangkat = 'fit';
  var sedangJalan = false;
  var lampiran = [];        /* berkas/foto yang dilampirkan (bisa lebih dari satu) */
  var kendali = null;        /* AbortController */

  /* ── Penyedia AI siap-pakai (bisa diganti kapan saja dari halaman Pengaturan) ── */
  var PRESET_PENYEDIA = {
    apinex: {
      label: 'Apinex — gratis (5 permintaan/menit)',
      url: 'https://api.apinex.bond/v1', gaya: 'openai', contoh: 'sk-apx…',
      catatan: 'Model gratis: free/gpt-6-luna · free/glm-5.3-flash · free/deepseek-v4.1-flash · free/deepseek-v4-pro-0813 · free/mimo-v2.6-pro · free/minimax-m3.1 (yang terakhir butuh langganan).'
    },
    gemini: {
      label: 'Google AI Studio (Gemini) — gratis', url: 'https://generativelanguage.googleapis.com/v1beta',
      gaya: 'gemini', contoh: 'AQ.… atau AIza…',
      catatan: 'Kunci gratis dari aistudio.google.com. Bisa teks, melihat foto, dan suara. Kunci berawalan AQ. memakai protokol asli Google (sudah dipilih otomatis).'
    },
    '9router': {
      label: '9Router (tunnel)', url: 'https://rqacwx8.abc-tunnel.us/v1', gaya: 'openai', contoh: 'sk-…',
      catatan: 'Penyedia bawaan web ini. Nyalakan tunnel 9Router dulu, lalu masukkan alamat & kuncinya.'
    },
    groq: { label: 'Groq — gratis', url: 'https://api.groq.com/openai/v1', gaya: 'openai', contoh: 'gsk_…', catatan: 'Cepat, gratis tanpa kartu (batas harian).' },
    pollinations: { label: 'Pollinations — tanpa kunci', url: 'https://text.pollinations.ai/openai', gaya: 'openai', contoh: '(tidak perlu kunci)', catatan: 'Tanpa pendaftaran, tetapi satu model kecil dan tanpa melihat gambar.' },
    cloudflare: { label: 'Cloudflare Workers AI — gratis', url: '', gaya: 'openai', contoh: 'token Workers AI', catatan: 'Isi alamat dengan https://api.cloudflare.com/client/v4/accounts/<ID_AKUN>/ai/v1 lalu tempel tokennya.' },
    kustom: { label: 'Kustom (protokol OpenAI)', url: '', gaya: 'openai', contoh: 'kunci penyedia', catatan: 'Penyedia apa pun yang mengikuti /chat/completions.' }
  };
  function labelPenyediaAktif() {
    var ps = SET.penyediaSet;
    if (!ps || (!ps.provider && !ps.base)) return 'server (env)';
    var nama = (PRESET_PENYEDIA[ps.provider] && PRESET_PENYEDIA[ps.provider].label) || ps.provider || 'kustom';
    return nama + ' · diatur di browser ini';
  }
  /* Setelan penyedia dikirim pada SETIAP permintaan /api/… lewat satu header.
     Kunci hanya hidup di browser ini (localStorage) — server tidak menyimpannya. */
  function hdrPenyedia() {
    var ps = SET.penyediaSet;
    if (!ps || (!ps.provider && !ps.base)) return {};
    try { return { 'x-setelan-penyedia': encodeURIComponent(JSON.stringify(ps)) }; } catch (e) { return {}; }
  }
  (function pasangPengirimSetelan() {
    var asli = window.fetch ? window.fetch.bind(window) : null;
    if (!asli) return;
    window.fetch = function (url, opsi) {
      try {
        var u = typeof url === 'string' ? url : ((url && url.url) || '');
        if (u.indexOf('/api/') === 0) {
          opsi = opsi || {};
          var h = {};
          var lama = opsi.headers || {};
          for (var k in lama) { if (Object.prototype.hasOwnProperty.call(lama, k)) h[k] = lama[k]; }
          var tambah = hdrPenyedia();
          for (var j in tambah) { if (Object.prototype.hasOwnProperty.call(tambah, j)) h[j] = tambah[j]; }
          opsi.headers = h;
        }
      } catch (e) {}
      return asli(url, opsi);
    };
  })();

  function baca(k, bawaan) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : bawaan; } catch (e) { return bawaan; } }
  function tulis(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Penyimpanan browser penuh', 'err'); } }
  function simpanSesi() {
    sesi.forEach(function (s) { if (s.messages.length > 60) s.messages = s.messages.slice(-60); });
    tulis(LS_SES, sesi);
  }
  function simpanSet() { tulis(LS_SET, SET); }

  function sesiBaru() {
    var s = { id: uid(), judul: 'Percakapan baru', ts: Date.now(), messages: [], artifacts: [], proyekId: SET.proyekAktif || null };
    sesi.unshift(s); aktif = s.id; simpanSesi(); gambarRiwayat(); bukaSesi(s.id); return s;
  }
  function sesiAktif() { return sesi.filter(function (s) { return s.id === aktif; })[0] || null; }
  function proyekDari(id) { return SET.proyek.filter(function (p) { return p.id === id; })[0] || null; }
  function proyekSesi(s) { return s && s.proyekId ? proyekDari(s.proyekId) : null; }
  function memoriUntukApi() {
    return SET.memoriAktif ? SET.memori.map(function (m) { return m.teks; }).slice(-20) : [];
  }

  /* ── 3. Pewarnaan kode ─────────────────────────────────────────────── */
  var KATA = {
    js: 'var let const function return if else for while do break continue new typeof instanceof class extends super this null undefined true false try catch finally throw switch case default await async yield import export from of in delete void static get set',
    python: 'def return if elif else for while import from as class try except finally with lambda None True False and or not in is pass raise global nonlocal yield async await assert del print',
    bash: 'if then else elif fi for do done while until case esac function local return echo export cd ls cat grep sed awk curl sudo apt npm node python git chmod mkdir rm cp mv touch read exit set unset source',
    sql: 'select from where insert into values update set delete join left right inner outer full on group by order having limit offset as and or not null distinct count sum avg min max create table alter drop index primary key foreign references varchar int text date',
    php: 'function return if else foreach for while echo print new class extends public private protected static const try catch throw use namespace require include true false null array',
    java: 'public private protected class interface extends implements new return if else for while do switch case break continue try catch finally throw static final void int long double float boolean char String null true false import package this super abstract',
    c: 'int char float double void return if else for while do switch case break continue struct typedef static const unsigned signed long short sizeof enum union goto include define true false null',
    go: 'func package import return if else for range var const type struct interface go defer chan select case default map nil true false switch break continue'
  };
  var ALIAS = {
    js: 'js', javascript: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js', node: 'js',
    py: 'python', python: 'python', python3: 'python',
    sh: 'bash', bash: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', terminal: 'bash',
    sql: 'sql', mysql: 'sql', postgres: 'sql', php: 'php', java: 'java', kotlin: 'java', swift: 'java',
    c: 'c', cpp: 'c', csharp: 'c', cs: 'c', go: 'go', golang: 'go'
  };
  var KOM = { python: '#', bash: '#', sql: '--', php: '#', js: '//', java: '//', c: '//', go: '//' };

  function warnaiBiasa(kode, bahasa) {
    var kw = KATA[bahasa]; if (!kw) return esc(kode);
    var kata = kw.split(' ').join('|');
    var tanda = KOM[bahasa] || '//';
    var kom = tanda === '#' ? '#[^\\n]*' : tanda === '--' ? '--[^\\n]*' : '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
    var rx = new RegExp(
      '(' + kom + ')' +
      '|("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)' +
      '|\\b(' + kata + ')\\b' +
      '|\\b([A-Za-z_$][\\w$]*)(?=\\s*\\()' +
      '|\\b(\\d+(?:\\.\\d+)?)\\b', 'g');
    return kode.replace(rx, function (m, k1, k2, k3, k4, k5) {
      if (k1) return '<span class="tk-kom">' + esc(k1) + '</span>';
      if (k2) return '<span class="tk-tek">' + esc(k2) + '</span>';
      if (k3) return '<span class="tk-kun">' + esc(k3) + '</span>';
      if (k4) return '<span class="tk-fun">' + esc(k4) + '</span>';
      if (k5) return '<span class="tk-ang">' + esc(k5) + '</span>';
      return esc(m);
    });
  }
  function warnaiCss(kode) {
    return kode
      .replace(/(\/\*[\s\S]*?\*\/)/g, function (m) { return '<span class="tk-kom">' + esc(m) + '</span>'; })
      .split(/(<span class="tk-kom">[\s\S]*?<\/span>)/g).map(function (bag) {
        if (bag.indexOf('<span') === 0) return bag;
        return esc(bag)
          .replace(/(^|[\s;{])(-{0,2}[a-z-]+)\s*:/g, '$1<span class="tk-sif">$2</span>:')
          .replace(/(#[0-9a-fA-F]{3,8})\b/g, '<span class="tk-ang">$1</span>')
          .replace(/(\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b)/g, '<span class="tk-ang">$1</span>')
          .replace(/(@[a-z-]+)/g, '<span class="tk-kun">$1</span>')
          .replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="tk-tek">$1</span>');
      }).join('');
  }
  function warnaiHtml(kode) {
    /* simpan dulu bagian yang tidak boleh diwarnai lagi (komentar, isi
       <style>/<script> sudah diwarnai terpisah), lalu warnai tag & atribut */
    var gudang = [];
    function simpan(isi) { gudang.push(isi); return '\u0002' + (gudang.length - 1) + '\u0002'; }
    var keluar = kode
      .replace(/<!--[\s\S]*?-->/g, function (m) { return simpan('<span class="tk-kom">' + esc(m) + '</span>'); })
      .replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, function (m, atr, isi) {
        return simpan('<span class="tk-pet">&lt;style</span><span class="tk-atr">' + esc(atr) + '</span><span class="tk-pet">&gt;</span>' + warnaiCss(isi) + '<span class="tk-pet">&lt;/style&gt;</span>');
      })
      .replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, function (m, atr, isi) {
        return simpan('<span class="tk-pet">&lt;script</span><span class="tk-atr">' + esc(atr) + '</span><span class="tk-pet">&gt;</span>' + warnaiBiasa(isi, 'js') + '<span class="tk-pet">&lt;/script&gt;</span>');
      });
    /* tag + atribut */
    keluar = esc(keluar)
      .replace(/(&lt;\/?)([a-zA-Z][\w:-]*)((?:(?!&lt;)[\s\S])*?)(\/?&gt;)/g, function (m, buka, nama, isi, tutup) {
        var atr = String(isi)
          .replace(/([\w:-]+)(?==)/g, '<span class="tk-atr">$1</span>')
          .replace(/(&quot;(?:[^&]|&(?!quot;))*&quot;|&#39;(?:[^&]|&(?!#39;))*&#39;)/g, '<span class="tk-tek">$1</span>');
        return '<span class="tk-pet">' + buka + '</span><span class="tk-tag">' + nama + '</span>' + atr + '<span class="tk-pet">' + tutup + '</span>';
      });
    return keluar.replace(/\u0002(\d+)\u0002/g, function (m, i) { return gudang[+i]; });
  }
  function warnaiJson(kode) {
    return esc(kode)
      .replace(/(&quot;(?:[^&]|&(?!quot;))*&quot;)(\s*:)/g, '<span class="tk-sif">$1</span>$2')
      .replace(/:\s*(&quot;(?:[^&]|&(?!quot;))*&quot;)/g, ': <span class="tk-tek">$1</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="tk-kun">$1</span>')
      .replace(/\b(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/gi, '<span class="tk-ang">$1</span>');
  }
  function warnai(kode, bahasa) {
    var b = String(bahasa || '').toLowerCase().trim().split(/[\s:;]/)[0];
    try {
      if (!b || b === 'text' || b === 'txt' || b === 'plain') return esc(kode);
      if (b === 'html' || b === 'xml' || b === 'svg' || b === 'vue') return warnaiHtml(kode);
      if (b === 'json') return warnaiJson(kode);
      if (b === 'css' || b === 'scss' || b === 'less') return warnaiCss(kode);
      return warnaiBiasa(kode, ALIAS[b] || b);
    } catch (e) { return esc(kode); }
  }

  /* ── 4. Markdown → HTML (+ kumpulkan artefak) ──────────────────────── */
  var LANGS_BERKAS = { html: 'html', svg: 'svg', css: 'css', js: 'js', javascript: 'js', json: 'json', md: 'md', markdown: 'md', python: 'py', py: 'py', bash: 'sh', sh: 'sh', sql: 'sql', php: 'php', java: 'java', c: 'c', go: 'go' };
  var NAMA_BERKAS = { html: 'index.html', svg: 'gambar.svg', css: 'style.css', js: 'script.js', json: 'data.json', md: 'catatan.md', py: 'skrip.py', sh: 'skrip.sh', sql: 'kueri.sql', php: 'skrip.php', java: 'Skrip.java', c: 'program.c', go: 'main.go' };

  function inlineMd(s) {
    s = esc(s);
    s = s.replace(/`([^`\n]+)`/g, '<code class="ic">$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, function (m, alt, url) { return '<img src="' + url + '" alt="' + alt + '" loading="lazy">'; });
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function (m, tx, url) { return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + tx + '</a>'; });
    s = s.replace(/(&quot;|^|[\s(])((?:https?:\/\/|www\.)[^\s<>&]+)/g, function (m, awal, url) {
      var href = url.indexOf('http') === 0 ? url : 'https://' + url;
      return awal + '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + (url.length > 56 ? url.slice(0, 56) + '…' : url) + '</a>';
    });
    return s;
  }

  var BAHASA_JALAN = ['html', 'htm', 'svg', 'css', 'js', 'mjs', 'javascript', 'markdown', 'md'];
  function blokKodeHtml(kode, bahasa, idx, artefak) {
    var baris = kode.replace(/\n$/, '').split('\n');
    var no = ''; for (var i = 0; i < baris.length; i++) no += (i + 1) + '\n';
    var warna = warnai(kode, bahasa);
    var label = (bahasa || 'kode').toUpperCase();
    var tombolArt = '';
    if (artefak) {
      tombolArt = '<button class="kb-btn" data-art="' + artefak.id + '">' + ic('panel-right', 14) + '<span>Ruang kerja</span></button>';
    }
    var bisaJalan = BAHASA_JALAN.indexOf(String(bahasa || '').toLowerCase()) >= 0;
    return '<div class="kb"' + (baris.length < 40 ? ' utuh' : '') + ' data-kb="' + idx + '" data-bhs="' + esc(bahasa || '') + '">'
      + '<div class="kb-hd"><span class="kb-lang">' + esc(label) + '</span><span class="grow"></span>'
      + tombolArt
      + '<button class="kb-btn" data-copy="' + idx + '">' + ic('copy', 14) + '<span>Salin</span></button>'
      + '<button class="kb-btn" data-dl="' + idx + '">' + ic('download', 14) + '<span>Unduh</span></button>'
      + '<button class="kb-btn" data-perbesar="' + idx + '" title="Perbesar kode">' + ic('maximize-2', 14) + '<span>Perbesar</span></button>'
      + (bisaJalan ? '<button class="kb-btn kb-jalan" data-jalan="' + idx + '" title="Jalankan di kotak pasir (iframe terpisah)">' + ic('play', 14) + '<span>Jalankan</span></button>' : '')
      + '</div><pre>' + baris.map(function (b, n) { return '<span class="ln"><span class="no">' + (n + 1) + '</span><span class="cd">' + (warna.split('\n')[n] || '') + '</span></span>'; }).join('') + '</pre></div>';
  }

  function renderMarkdown(teks, sesiRef) {
    var asli = String(teks == null ? '' : teks);
    var blok = [], kodeSimpan = [];
    asli = asli.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, function (m, bhs, isi) {
      kodeSimpan.push({ bhs: bhs.trim(), isi: isi.replace(/\n$/, '') });
      return '\u0001' + (kodeSimpan.length - 1) + '\u0001';
    });
    asli = asli.replace(/```([^\n`]*)\n?([\s\S]*)$/, function (m, bhs, isi) {
      kodeSimpan.push({ bhs: bhs.trim(), isi: isi.replace(/\n$/, ''), belum: true });
      return '\u0001' + (kodeSimpan.length - 1) + '\u0001';
    });

    var artefakBaru = [];
    var html = [], baris = asli.split('\n'), i = 0, daftar = null;
    var total = 0;   /* penomoran blok kode untuk tombol salin/unduh */

    function tutupDaftar() { if (daftar) { html.push('</' + daftar + '>'); daftar = null; } }

    while (i < baris.length) {
      var b = baris[i], m = b.match(/^\u0001(\d+)\u0001$/);
      if (m) {
        tutupDaftar();
        var k = kodeSimpan[+m[1]];
        var ark = null;
        var ext = LANGS_BERKAS[(k.bhs || '').toLowerCase()];
        if (ext && k.isi.trim().length > 100) {
          ark = { id: uid(), nama: NAMA_BERKAS[ext] || ('berkas.' + ext), jenis: ext, kode: k.isi, ts: Date.now() };
          /* kalau nama itu sudah dipakai di balon yang sama, beri nomor */
          var dasar = ark.nama, n = 1;
          while (artefakBaru.some(function (x) { return x.nama === ark.nama; })) {
            n++; ark.nama = dasar.replace(/(\.\w+)$/, '-' + n + '$1');
          }
          artefakBaru.push(ark);
        }
        html.push(blokKodeHtml(k.isi, k.bhs, total++, ark));
        i++; continue;
      }
      if (/^\s*$/.test(b)) { tutupDaftar(); i++; continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(b)) { tutupDaftar(); html.push('<hr>'); i++; continue; }
      var h = b.match(/^(#{1,4})\s+(.*)$/);
      if (h) { tutupDaftar(); var lv = h[1].length; html.push('<h' + lv + '>' + inlineMd(h[2]) + '</h' + lv + '>'); i++; continue; }
      if (/^\s*>\s?/.test(b)) {
        tutupDaftar(); var kut = [];
        while (i < baris.length && /^\s*>\s?/.test(baris[i])) { kut.push(inlineMd(baris[i].replace(/^\s*>\s?/, ''))); i++; }
        html.push('<blockquote>' + kut.join('<br>') + '</blockquote>'); continue;
      }
      /* tabel */
      if (/\|/.test(b) && i + 1 < baris.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(baris[i + 1])) {
        tutupDaftar();
        var kepala = b.split('|').map(function (x) { return x.trim(); }).filter(function (x, n, a) { return !(x === '' && (n === 0 || n === a.length - 1)); });
        i += 2;
        var isiT = [];
        while (i < baris.length && /\|/.test(baris[i])) {
          isiT.push(baris[i].split('|').map(function (x) { return x.trim(); }).filter(function (x, n, a) { return !(x === '' && (n === 0 || n === a.length - 1)); }));
          i++;
        }
        html.push('<table><thead><tr>' + kepala.map(function (c) { return '<th>' + inlineMd(c) + '</th>'; }).join('') + '</tr></thead><tbody>'
          + isiT.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + inlineMd(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>');
        continue;
      }
      /* daftar */
      var ul = b.match(/^\s*[-*+]\s+(.*)$/), ol = b.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        var jenis = ul ? 'ul' : 'ol';
        if (daftar !== jenis) { tutupDaftar(); html.push('<' + jenis + '>'); daftar = jenis; }
        html.push('<li>' + inlineMd((ul || ol)[1]) + '</li>'); i++; continue;
      }
      /* paragraf */
      tutupDaftar();
      var para = [];
      while (i < baris.length && !/^\s*$/.test(baris[i]) && !/^\u0001\d+\u0001$/.test(baris[i]) && !/^(#{1,4})\s/.test(baris[i]) && !/^\s*[-*+]\s/.test(baris[i]) && !/^\s*\d+[.)]\s/.test(baris[i]) && !/^\s*>/.test(baris[i])) {
        para.push(baris[i]); i++;
      }
      html.push('<p>' + para.map(inlineMd).join('<br>') + '</p>');
    }
    tutupDaftar();
    return { html: html.join('\n'), kode: kodeSimpan, artifacts: artefakBaru };
  }

  /* ── 5. Percakapan: gambar pesan ───────────────────────────────────── */
  var feed = $('feed');
  var feedIn = null;
  function pastikanFeed() {
    if (!feedIn) { feedIn = document.createElement('div'); feedIn.className = 'feed-in'; feed.appendChild(feedIn); }
    return feedIn;
  }
  function avatar(peran) {
    return '<div class="av ' + (peran === 'me' ? 'me' : 'ai') + '">'
      + (peran === 'me' ? 'A' : '<img src="assets/logo.png" alt="" width="20" height="20">') + '</div>';
  }
  function tambahPesan(pesan) {
    if (pesan.role === 'sistem' || pesan.role === 'alat' || pesan.role === 'galat') return tambahCatatan(pesan);
    var wadah = pastikanFeed();
    var row = document.createElement('div');
    row.className = 'msg ' + (pesan.role === 'user' ? 'me' : 'ai');
    row.dataset.id = pesan.id;
    var isi = pesan.html != null ? pesan.html : renderMarkdown(pesan.text || '', sesiAktif()).html;
    row.innerHTML = avatar(pesan.role)
      + '<div class="msg-bd"><div class="msg-who">' + (pesan.role === 'user' ? 'Kamu' : 'Van Chat.SPY') + '</div>'
      + '<div class="bub' + (pesan.role === 'ai' ? ' bernafas' : '') + '">' + isi + '</div>'
      + ((pesan.role === 'ai' || pesan.ref) ? metaJawaban(pesan) : '')
      + '<div class="msg-tools">' + alatPesan(pesan) + '</div></div>';
    wadah.appendChild(row);
    if (pesan.artifacts && pesan.artifacts.length) sisipKartuArtefak(row, pesan.artifacts);
    (Array.isArray(pesan.lampiran) ? pesan.lampiran : []).forEach(function (l) {
      var el = document.createElement('div');
      el.className = 'lampiran-balon' + (l.gambar ? ' foto' : '');
      if (l.gambar && l.mini) {
        el.innerHTML = '<img src="' + l.mini + '" alt="' + esc(l.nama) + '" loading="lazy">'
          + '<span>' + esc(l.nama) + '</span><small>dilihat AI</small>';
      } else {
        el.innerHTML = ic('paperclip', 14) + '<span>' + esc(l.nama) + '</span><small>' + kb(l.ukuran) + (l.gambar ? ' · dilihat AI' : '') + '</small>';
      }
      row.querySelector('.bub').appendChild(el);
    });
    return row;
  }
  function metaJawaban(pesan) {
    if (!pesan.model && !pesan.ms && !pesan.ref && !pesan.web) return '';
    var refPengguna = (pesan.role === 'user' && pesan.ref) ? '<span>' + ic('globe', 12) + ' ' + pesan.ref + ' referensi Wikipedia</span>' : '';
    if (pesan.role === 'user' && pesan.web) refPengguna += '<span>' + ic('search', 12) + ' ' + pesan.web.sumber.length + ' sumber web</span>';
    return '<div class="msg-meta">' + (pesan.model ? '<span>' + ic('sparkles', 12) + ' ' + esc(pesan.model) + '</span>' : '')
      + refPengguna
      + (pesan.ms ? '<span>' + (pesan.ms / 1000).toFixed(1) + ' detik</span>' : '') + '</div>';
  }
  function alatPesan(pesan) {
    var t = [];
    t.push('<button class="ib sm" data-act="copy" title="Salin jawaban">' + ic('copy', 15) + '</button>');
    t.push('<button class="ib sm" data-act="dl" title="Unduh .md">' + ic('download', 15) + '</button>');
    t.push('<button class="ib sm" data-act="tts" title="Bacakan">' + ic('volume-2', 15) + '</button>');
    if (pesan.role === 'ai') {
      t.push('<button class="ib sm" data-act="lagi" title="Buat ulang jawaban">' + ic('rotate-ccw', 15) + '</button>');
      t.push('<button class="ib sm" data-act="memori" title="Simpan inti jawaban ini ke memori AI">' + ic('brain', 15) + '</button>');
      t.push('<button class="ib sm" data-act="suka" title="Jawaban bagus">' + ic('thumbs-up', 15) + '</button>');
      t.push('<button class="ib sm" data-act="kurang" title="Kurang pas">' + ic('thumbs-down', 15) + '</button>');
      t.push('<button class="ib sm" data-act="cabang" title="Cabangkan ke obrolan baru">' + ic('git-branch', 15) + '</button>');
    }
    if (pesan.alat || pesan.role === 'alat') {
      var namaAlat = (pesan.alat && pesan.alat.nama) || 'alat lokal';
      t.push('<button class="ib sm" data-act="alatulang" title="Ulangi alat (' + esc(namaAlat) + ')">' + ic('terminal', 15) + '</button>');
    }
    t.push('<button class="ib sm" data-act="bagikan" title="Bagikan jawaban">' + ic('share-2', 15) + '</button>');
    t.push('<button class="ib sm" data-act="hapuspesan" title="Hapus pesan ini">' + ic('trash', 15) + '</button>');
    return t.join('');
  }
  function sisipKartuArtefak(row, daftar) {
    var bub = row.querySelector('.bub');
    daftar.forEach(function (a) {
      var kartu = document.createElement('div');
      kartu.className = 'art';
      kartu.className = 'art baru';
      kartu.innerHTML = '<span class="art-ic">' + ic(a.jenis === 'html' ? 'file-code' : a.jenis === 'svg' ? 'image' : 'file-text', 18) + '</span>'
        + '<span class="art-tx"><b>' + esc(a.nama) + '</b><small>' + esc(a.jenis.toUpperCase()) + ' · ' + kb(a.kode.length) + '</small></span>'
        + '<button class="btn" data-art="' + a.id + '" title="Buka di ruang kerja">' + ic('panel-right', 15) + '<span>Buka</span></button>'
        + '<button class="btn" data-artdl="' + a.id + '" title="Unduh berkas">' + ic('download', 15) + '<span>Unduh</span></button>';
      bub.appendChild(kartu);
    });
  }
  function kosongkanFeed() {
    /* pesan sistem/alat/galat dipertahankan; hanya papan sambutan yang dibuang */
    var simpan = [].slice.call(feed.querySelectorAll('.msg.catatan'));
    feed.innerHTML = ''; feedIn = null;
    if (simpan.length) {
      var wadah = pastikanFeed();
      simpan.forEach(function (r) { wadah.appendChild(r); });
    }
  }

  function sambut() {
    var wadah = pastikanFeed();
    wadah.innerHTML = '<div class="hero"><div class="hero-ic"><span class="hero-cincin"></span>'
      + '<img src="assets/logo.png" alt="Van Chat.SPY" width="76" height="76"></div>'
      + '<h2>Ada yang bisa saya bantu?</h2><p>Tanya apa saja, atau minta saya membuat halaman web, komponen, atau skrip — hasilnya muncul di ruang kerja sebelah.</p>'
      + '<div class="saran">'
      + '<button data-saran="Buatkan halaman landing page kedai kopi dengan menu dan peta lokasi">' + ic('file-code', 15) + 'Landing page kedai kopi</button>'
      + '<button data-saran="Buatkan kartu profil HTML+CSS dengan foto bulat dan tombol kontak">' + ic('image', 15) + 'Kartu profil HTML</button>'
      + '<button data-saran="Buatkan skrip Python untuk merapikan nama file di satu folder">' + ic('terminal', 15) + 'Skrip Python</button>'
      + '<button data-saran="Ringkas cara kerja model bahasa besar untuk orang awam">' + ic('sparkles', 15) + 'Cara kerja AI</button>'
      + '</div></div>';
  }

  /* ── 5a. Alat lokal: dihitung di perangkat, bukan dikira-kira AI ──── */
  function hitungAman(ekspresi) {
    var bersih = String(ekspresi).replace(/[^0-9+\-*/().,%^ ]/g, '').replace(/\^/g, '**').replace(/,/g, '.');
    if (!/[0-9]/.test(bersih) || !/[+\-*/]/.test(bersih)) return null;
    try {
      var h = Function('"use strict";return (' + bersih + ')')();
      if (typeof h === 'number' && isFinite(h)) return Math.round(h * 1e6) / 1e6;
    } catch (e) {}
    return null;
  }
  var SATUAN = {
    km: 1000, m: 1, cm: 0.01, mm: 0.001, mil: 1609.344, kaki: 0.3048, inci: 0.0254,
    kg: 1000, g: 1, mg: 0.001, ton: 1e6, ons: 100,
    l: 1, liter: 1, ml: 0.001, cc: 0.001, galon: 3.78541,
    jam: 1, menit: 1 / 60, detik: 1 / 3600, hari: 24, minggu: 168,
    kb: 1024, mb: 1048576, gb: 1073741824
  };
  function angkaID(n) {
    return (Math.round(n * 1e6) / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 6 });
  }
  /* "hitung(18*7+5)" atau "berapa (12+8)*3" — rapikan kurung yang tidak berpasangan */
  function seimbangkanTandaKurung(ekspresi) {
    var e = String(ekspresi || '').trim();
    var buka = (e.match(/\(/g) || []).length, tutup = (e.match(/\)/g) || []).length;
    while (tutup > buka && /\)$/.test(e)) { e = e.replace(/\)$/, '').trim(); tutup--; }
    while (buka > tutup && /^\(/.test(e)) { e = e.replace(/^\(/, '').trim(); buka--; }
    return e;
  }
  function alatLokal(teks) {
    var t = String(teks || '').trim();
    var keluar = [];

    /* 1) hitungan: "hitung 18*7+5" atau "berapa 120/4" atau ekspresi murni */
    var mHitung = t.match(/^(?:tolong\s+)?(?:hitung|berapa|hasil dari|calculate|berapakah)\s*[:=]?\s*([0-9+\-*/().,%^ ]{3,60})\s*$/i)
      || (/^[0-9+\-*/().,%^ ]{3,60}$/.test(t) && /[+\-*/]/.test(t) ? [t, t] : null);
    if (mHitung) {
      var ekspresi = seimbangkanTandaKurung(mHitung[1]);
      var h = hitungAman(ekspresi);
      if (h !== null) keluar.push('hitung(' + ekspresi + ') = ' + angkaID(h));
    }

    /* 2) waktu & tanggal menurut WIB */
    if (/\b(jam berapa|pukul berapa|tanggal berapa|hari (ini|apa) tanggal|sekarang jam|jam sekarang)\b/i.test(t)) {
      var kini = new Date();
      var wib = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).format(kini);
      keluar.push('waktu sekarang (WIB) = ' + wib + ' (zona pengguna: ' + (Intl.DateTimeFormat().resolvedOptions().timeZone || 'tidak diketahui') + ')');
    }

    /* 3) konversi satuan: "12 km ke m", "30 celsius ke fahrenheit" */
    var mKonversi = t.match(/([0-9.,]+)\s*(celsius|c|fahrenheit|f|kelvin|km|m|cm|mm|mil|kaki|inci|kg|g|mg|ton|ons|l|liter|ml|cc|galon|jam|menit|detik|hari|minggu|kb|mb|gb)\s*(?:ke|to|jadi|->|→)\s*(celsius|c|fahrenheit|f|kelvin|km|m|cm|mm|mil|kaki|inci|kg|g|mg|ton|ons|l|liter|ml|cc|galon|jam|menit|detik|hari|minggu|kb|mb|gb)/i);
    if (mKonversi) {
      var nilai = parseFloat(String(mKonversi[1]).replace(',', '.'));
      var dari = mKonversi[2].toLowerCase(), ke = mKonversi[3].toLowerCase();
      var suhu = function (v, a, b) {
        var c = a === 'celsius' || a === 'c' ? v : a === 'fahrenheit' || a === 'f' ? (v - 32) * 5 / 9 : v - 273.15;
        return b === 'celsius' || b === 'c' ? c : b === 'fahrenheit' || b === 'f' ? c * 9 / 5 + 32 : c + 273.15;
      };
      var suhuDari = /^(celsius|c|fahrenheit|f|kelvin)$/.test(dari), suhuKe = /^(celsius|c|fahrenheit|f|kelvin)$/.test(ke);
      if (suhuDari && suhuKe) keluar.push('konversi = ' + angkaID(suhu(nilai, dari, ke)) + '° ' + ke);
      else if (!suhuDari && !suhuKe && SATUAN[dari] && SATUAN[ke]) {
        keluar.push('konversi = ' + angkaID(nilai * SATUAN[dari] / SATUAN[ke]) + ' ' + ke);
      }
    }

    /* 4) hitung kata/karakter */
    var mTeks = t.match(/^(?:hitung|berapa)\s+(?:jumlah\s+)?(kata|karakter|huruf)\s*(?:dari|pada)?\s*[:\-]?\s*([\s\S]{3,600})$/i);
    if (mTeks) {
      var isi = mTeks[2].trim();
      keluar.push(mTeks[1].toLowerCase() === 'kata'
        ? 'jumlah kata = ' + isi.split(/\s+/).filter(Boolean).length
        : 'jumlah karakter = ' + isi.length + ' (tanpa spasi: ' + isi.replace(/\s/g, '').length + ')');
    }

    return keluar.length ? keluar.join('\n') : '';
  }

  /* ── 5b. Referensi nyata dari Wikipedia Indonesia (tanpa kunci API) ──
     Diambil langsung oleh browser, lalu disisipkan sebagai bahan tambahan
     untuk AI. Kalau gagal (luring / diblokir), percakapan tetap jalan. */
  function ambilReferensi(teks) {
    var inti = String(teks).replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
    if (inti.length < 4) return Promise.resolve(null);
    var w = 'https://id.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1';
    return fetch(w + '&list=search&srlimit=3&srsearch=' + encodeURIComponent(inti))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var judul = ((j && j.query && j.query.search) || []).map(function (x) { return x.title; }).slice(0, 3);
        if (!judul.length) return null;
        return fetch(w + '&prop=extracts&exintro=1&explaintext=1&titles=' + encodeURIComponent(judul.join('|')))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (e) {
            var hal = (e && e.query && e.query.pages) || {};
            var daftar = Object.keys(hal).map(function (k) { return hal[k]; })
              .filter(function (h) { return h && h.extract && h.extract.trim(); })
              .map(function (h) { return '- ' + h.title + ': ' + h.extract.replace(/\s+/g, ' ').slice(0, 520).trim(); });
            if (!daftar.length) return null;
            return {
              n: daftar.length,
              konteks: '\n\n--- referensi dari Wikipedia Indonesia (pakai hanya bila relevan; sebutkan sebagai referensi) ---\n' + daftar.join('\n')
            };
          });
      })
      .catch(function () { return null; });
  }

  /* ── 6. Kirim & streaming ──────────────────────────────────────────── */
  var ta = $('ta'), btnSend = $('btnSend'), btnStop = $('btnStop'), hint = $('hint');

  function perbaruiKirim() {
    var ada = ta.value.trim().length > 0;
    btnSend.disabled = !ada || sedangJalan;
    ta.style.height = 'auto';
    ta.style.height = Math.min(200, ta.scrollHeight) + 'px';
  }
  ta.addEventListener('input', perbaruiKirim);
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      if (SET.enterKirim && !e.shiftKey) { e.preventDefault(); kirim(); }
      if (!SET.enterKirim && (e.ctrlKey || e.metaKey)) { e.preventDefault(); kirim(); }
    }
  });
  btnSend.addEventListener('click', kirim);
  btnStop.addEventListener('click', function () { if (kendali) kendali.abort(); });

  function kirim() {
    var teks = ta.value.trim();
    if (!teks || sedangJalan) return;
    var s = sesiAktif() || sesiBaru();
    ta.value = ''; perbaruiKirim();

    var tambahan = '';
    var gambar = [];
    var daftarLampiran = lampiran.map(function (l) {
      if (l.gambar) {                       /* foto/screenshot → dikirim sebagai gambar */
        gambar.push(l.data);
        tambahan += '\n\n(pengguna melampirkan gambar "' + l.nama + '" — jelaskan/analisis isinya)';
      } else if (l.isi) {                   /* berkas teks/kode → isinya ikut dikirim */
        tambahan += '\n\n--- isi berkas "' + l.nama + '" ---\n```' + (l.bahasa || '') + '\n' + l.isi + '\n```';
      } else {
        tambahan += '\n\n(lampiran: ' + l.nama + ' · ' + kb(l.ukuran) + ')';
      }
      return { nama: l.nama, ukuran: l.ukuran, gambar: !!l.gambar, mini: l.mini || '' };
    });

    /* alat lokal: hasil hitung/tanggal/satuan dihitung di sini, bukan oleh AI */
    var pesanAlat = null;
    var alat = alatLokal(teks);
    var pakaiAlat = '';
    if (alat) pakaiAlat = '\n\n--- hasil alat lokal (PASTI BENAR, pakai angka/tanggal ini) ---\n' + alat;
    pesanAlat = alat ? { nama: 'alat lokal', teks: alat } : null;

    var pesanUser = {
      id: uid(), role: 'user', text: teks,
      apiText: teks + tambahan + pakaiAlat,
      gambar: gambar, lampiran: daftarLampiran.length ? daftarLampiran : null,
      ts: Date.now()
    };
    s.messages.push(pesanUser);
    if (!s.tugas && s.messages.filter(function (m) { return m.role === 'user'; }).length === 1) {
      s.judul = teks.slice(0, 52) + (teks.length > 52 ? '…' : '');
      $('chatTitle').textContent = s.judul;
      gambarRiwayat();
    }
    lampiran = []; perbaruiLampiran();
    if (feedIn && feedIn.querySelector('.hero')) kosongkanFeed();
    tambahPesan(pesanUser);
    if (pesanAlat) {
      pesanUser.alat = pesanAlat;
      catat('alat', pesanAlat.teks);
    }
    gulirBawah(true);
    simpanSesi();

    if (SET.cariWeb) {
      cariWebUntuk(teks, pesanUser)
        .then(function () { mintaJawaban(s); })
        .catch(function (e) { catatGalat('Pencarian web gagal: ' + ((e && e.message) || e)); mintaJawaban(s); });
      return;
    }
    if (SET.refWiki) {
      hint.innerHTML = '<span class="tulis"><i></i><i></i><i></i></span> mencari referensi Wikipedia…';
      ambilReferensi(teks).then(function (r) {
        if (r) {
          pesanUser.ref = r.n;
          pesanUser.apiText = (pesanUser.apiText || teks) + r.konteks;
          /* tampilkan lencana sumber di balon pengguna (baris sudah tergambar) */
          var barisUser = document.querySelector('.msg[data-id="' + pesanUser.id + '"]');
          var bd = barisUser && barisUser.querySelector('.msg-bd');
          if (bd && !bd.querySelector('.msg-meta')) {
            var metaBaru = document.createElement('div');
            metaBaru.innerHTML = metaJawaban(pesanUser);
            if (metaBaru.firstChild) bd.insertBefore(metaBaru.firstChild, bd.querySelector('.msg-tools'));
          }
        }
        mintaJawaban(s);
      });
      return;
    }
    mintaJawaban(s);
  }

  var tahapKata = ['menyiapkan jawaban…', 'menimbang konteks…', 'menyusun jawaban…', 'merapikan…'];
  var tahapT = null, tahapI = 0;
  function statusProses(mulai) {
    clearInterval(tahapT);
    if (!mulai) { $('hint').textContent = ''; return; }
    tahapI = 0;
    $('hint').innerHTML = '<span class="tulis"><i></i><i></i><i></i></span> ' + tahapKata[0];
    tahapT = setInterval(function () {
      tahapI = (tahapI + 1) % tahapKata.length;
      if ($('hint')) $('hint').innerHTML = '<span class="tulis"><i></i><i></i><i></i></span> ' + tahapKata[tahapI];
    }, 2200);
  }
  function statusJalan(on) {
    if (on) statusProses(true); else statusProses(false);
    sedangJalan = on;
    btnSend.hidden = on;
    btnStop.hidden = !on;
    hint.innerHTML = on ? '<span class="tulis"><i></i><i></i><i></i></span> menyusun jawaban…' : '';
    perbaruiKirim();
    sibuk(on);
  }
  function sibuk(on) {
    var b = document.querySelector('.sibuk');
    if (on && !b) {
      b = document.createElement('div'); b.className = 'sibuk'; b.innerHTML = '<i></i>';
      document.querySelector('.work').appendChild(b);
    } else if (!on && b) b.remove();
  }

  /* apakah permintaan ini minta dibuatkan halaman/website utuh? */
  function perluBangun(teks) {
    var t = String(teks || '').trim();
    if (t.indexOf('```') >= 0) return false;                       /* sudah ada kode: cukup dijawab */
    if (/^(apa|apakah|kenapa|mengapa|bagaimana|jelaskan|jelasin|kapan|siapa|dimana|di mana|berapa)\b/i.test(t)) return false;
    /* 1) ada kata kerja membuat + objeknya */
    if (/(buat|bikin|rancang|generate|create|desain|modif|ubah|perbaiki)[a-z]*\s*(kan)?\s+(halaman|website|web|situs|landing|html|kartu|form|portofolio|portfolio|profil|profile|game|toko|dashboard|undangan|poster digital)/i.test(t)) return true;
    /* 2) menyebut bentuk produknya secara langsung (tanpa kata tanya) */
    return /\b(landing page|website|situs web|halaman web|web app)\b/i.test(t) && t.length > 12;
  }
  function kartuGalat(judul, pesan) {
    return '<div class="art" style="border-color:color-mix(in srgb,var(--err) 40%,transparent)">'
      + '<span class="art-ic" style="background:color-mix(in srgb,var(--err) 14%,transparent);color:var(--err)">' + ic('alert-triangle', 18) + '</span>'
      + '<span class="art-tx"><b>' + esc(judul) + '</b><small>' + esc(pesan) + '</small></span></div>';
  }
  /* jalur khusus: minta satu berkas HTML utuh ke /api/builder */
  function jalankanBangun(s, messages) {
    var prompt = messages[messages.length - 1];
    var baris = tambahPesan({ id: uid(), role: 'ai', text: '', html: '<span class="tulis"><i></i><i></i><i></i></span> menyusun halaman web… <small style="color:var(--tx3)">(biasanya 10–30 detik)</small>', ms: 0 });
    var bub = baris.querySelector('.bub');
    statusJalan(true);
    kendali = new AbortController();
    var t0 = Date.now();
    fetch('/api/builder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt, mode: SET.mode === 'fast' ? 'think' : SET.mode }),
      signal: kendali.signal
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.ok || !j.html) throw new Error(j.pesan || j.error || ('HTTP ' + r.status));
        return j;
      });
    }).then(function (j) {
      var a = { id: uid(), nama: 'index.html', jenis: 'html', kode: j.html, ts: Date.now() };
      s.artifacts.push(a);
      var ms = Date.now() - t0;
      var catatan = 'Halaman web siap dibuat — berkas **`' + a.nama + '`** (' + kb(a.kode.length) + ') sudah ada di Ruang Kerja: bisa dipratinjau, diubah ukurannya, dan diunduh.';
      var pesanAI = { id: baris.dataset.id, role: 'ai', text: catatan, ts: Date.now(), model: j.model || MODE[SET.mode].model, ms: ms, artifacts: [a] };
      s.messages.push(pesanAI);
      simpanSesi();
      var baru = tambahPesan(pesanAI);
      baris.replaceWith(baru);
      tampilArtefak(a); bukaKerja(true); tabAktif = 'prev'; perbaruiTab(); gambarKerja();
      $('artCount').textContent = s.artifacts.length;
      statusJalan(false); kendali = null; hitungPakai();
      $('chatSub').textContent = 'halaman jadi dalam ' + (ms / 1000).toFixed(1) + ' detik';
      toast('Halaman siap di ruang kerja', 'ok');
      gulirBawah(true);
    }).catch(function (e) {
      if (e && e.name === 'AbortError') {
        bub.innerHTML = '<p>Pembuatan halaman dihentikan.</p>';
        statusJalan(false); kendali = null; $('chatSub').textContent = 'dihentikan';
        return;
      }
      bub.innerHTML = kartuGalat('Tidak bisa membuat halaman', e.message || 'gagal terhubung');
      baris.dataset.gagal = '1';
      catatGalat('Tidak bisa membuat halaman: ' + (e.message || 'gagal terhubung'));
      statusJalan(false); kendali = null;
    });
  }

  function mintaJawaban(s, ulangDariPesan) {
    var messages;
    var pesanUserTerakhir = s.messages.filter(function (m) { return m.role === 'user'; }).slice(-1)[0];
    var gambarKirim = (pesanUserTerakhir && pesanUserTerakhir.gambar) || [];
    if (ulangDariPesan) {
      var idx = s.messages.indexOf(ulangDariPesan);
      s.messages = s.messages.slice(0, idx + 1);
      messages = s.messages.filter(function (m) { return m.role === 'user'; }).slice(-4).map(function (m) { return m.apiText || m.text; });
    } else {
      messages = s.messages.filter(function (m) { return m.role === 'user'; }).slice(-4).map(function (m) { return m.apiText || m.text; });
    }

    /* permintaan "buatkan halaman web" diarahkan ke mesin pembuat HTML
       supaya hasilnya satu berkas utuh yang bisa langsung dipratinjau */
    if (perluBangun(messages[messages.length - 1])) return jalankanBangun(s, messages);

    var baris = tambahPesan({ id: uid(), role: 'ai', text: '', html: '<span class="tulis"><i></i><i></i><i></i></span>', ms: 0 });
    var bub = baris.querySelector('.bub');
    statusJalan(true);
    kendali = new AbortController();
    var t0 = Date.now(), teks = '', modelDipakai = '', sudahRender = 0, terakhirRender = 0;

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: messages[messages.length - 1],
        riwayat: messages.slice(0, -1).slice(-3),
        mode: SET.mode,
        model: modelUntukMode(SET.mode),
        stream: SET.stream && !gambarKirim.length,
        gambar: gambarKirim,
        memori: memoriUntukApi(),
        proyek: (function () {
          /* apa yang TERLIHAT di halaman Proyek = apa yang DIKIRIM ke AI
             (bahasa jawaban, aturan coding, gaya desain, arahan tambahan) */
          var pr = proyekSesi(s);
          var nama = SET.nama ? 'Panggil pengguna dengan nama ' + SET.nama + '. ' : '';
          if (pr) return (nama + 'Proyek aktif: ' + pr.nama + '. ' + arahanProyek(pr)).trim();
          var bahasa = SET.bahasa === 'en' ? 'Jawab dalam bahasa Inggris.' : 'Jawab dalam bahasa Indonesia.';
          return (nama + bahasa).trim();
        })()
      }),
      signal: kendali.signal
    }).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      try {
        var minta = r.headers.get('x-model-diminta'), pakai = r.headers.get('x-model-dipakai');
        var catat = r.headers.get('x-catatan-model');
        if (minta && pakai && minta !== pakai) toast(catat ? decodeURIComponent(catat) : ('Model ' + minta + ' tidak bisa dipakai — jawaban ini dari ' + pakai + '.'), 'warn');
      } catch (e) {}
      if (!r.ok && ct.indexOf('json') >= 0) {
        return r.json().then(function (j) {
          /* penyedia bilang batas permintaan tercapai → aplikasi mencatatnya,
             supaya lembar Mode AI menyampaikan keadaan sebenarnya */
          if (j && j.kuota) { tandaKuotaHabis(true); }
          throw new Error(j.pesan || j.error || ('HTTP ' + r.status));
        });
      }
      if (!SET.stream || ct.indexOf('text/event-stream') < 0) {
        return r.json().then(function (j) {
          if (!j.text) throw new Error(j.pesan || 'jawaban kosong');
          teks = j.text; modelDipakai = j.model || '';
          if (j.bentukTidakPas) toast(j.catatanBentuk || 'Bentuk jawaban belum persis seperti permintaan', 'warn');
          tandaKuotaHabis(false);
          gambar();
        });
      }
      var rd = r.body.getReader(), dec = new TextDecoder(), buf = '';
      return (function baca() {
        return rd.read().then(function (x) {
          if (x.done) return;
          buf += dec.decode(x.value, { stream: true });
          var potongan = buf.split('\n');
          buf = potongan.pop();
          potongan.forEach(function (ln) {
            ln = ln.trim();
            if (!ln || ln.indexOf('data:') !== 0) return;
            var isi = ln.slice(5).trim();
            if (isi === '[DONE]') return;
            try {
              var j = JSON.parse(isi);
              if (j.error) throw new Error(j.error);
              if (j.model) modelDipakai = j.model;
              var d = j.choices && j.choices[0] && j.choices[0].delta;
              if (d && d.content) {
                teks += d.content;
                if (Date.now() - terakhirRender > 70) { terakhirRender = Date.now(); gambar(); }
              }
            } catch (e) { if (String(e.message || '').length > 3 && !/^Unexpected/.test(e.message)) throw e; }
          });
          return baca();
        });
      })();
    }).then(function () {
      gambar(true);
      commit();
    }).catch(function (e) {
      if (e && e.name === 'AbortError') { gambar(true); commit('dihentikan'); return; }
      bub.innerHTML = '<div class="art" style="border-color:color-mix(in srgb,var(--err) 40%,transparent)">'
        + '<span class="art-ic" style="background:color-mix(in srgb,var(--err) 14%,transparent);color:var(--err)">' + ic('alert-triangle', 18) + '</span>'
        + '<span class="art-tx"><b>Tidak bisa mengambil jawaban</b><small>' + esc(e.message || 'gagal terhubung') + '</small></span></div>';
      baris.dataset.gagal = '1';
      catatGalat(e.message || 'gagal terhubung');
      statusJalan(false); kendali = null;
    });

    function gambar(final) {
      var hasil = renderMarkdown(teks, s);
      bub.innerHTML = hasil.html + (final ? '' : '<span class="kursor"></span>');
      gulirBawah(false);
    }
    function commit(catatan) {
      var ms = Date.now() - t0;
      var hasil = renderMarkdown(teks, s);
      var pesanAI = {
        id: baris.dataset.id, role: 'ai', text: teks, ts: Date.now(),
        model: modelDipakai || MODE[SET.mode].model, ms: ms,
        artifacts: hasil.artifacts, catatan: catatan || ''
      };
      s.messages.push(pesanAI);
      hasil.artifacts.forEach(function (a) { s.artifacts.push(a); });
      simpanSesi();
      /* gambar ulang pesan lengkap dengan kartu berkas */
      var baru = tambahPesan(pesanAI);
      baris.replaceWith(baru);
      if (hasil.artifacts.length) {
        var pilihan = hasil.artifacts.filter(function (a) { return a.jenis === 'html' || a.jenis === 'svg'; })[0] || hasil.artifacts[0];
        tampilArtefak(pilihan);
        $('artCount').textContent = s.artifacts.length;
        if (window.innerWidth > 900) bukaKerja(true);
        toast('Hasil siap di ruang kerja', 'ok');
      }
      statusJalan(false); kendali = null;
      hitungPakai();
      if (SET.autoTTS && !catatan) bacakan(teks);
      if (!catatan) $('chatSub').textContent = 'selesai dalam ' + (ms / 1000).toFixed(1) + ' detik';
      gulirBawah(true);
    }
  }

  var dekatBawah = true;
  feed.addEventListener('scroll', function () {
    dekatBawah = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 140;
  });
  function gulirBawah(paksa) { if (paksa || dekatBawah) feed.scrollTop = feed.scrollHeight; }

  function hitungPakai() {
    var tgl = new Date().toISOString().slice(0, 10);
    if (SET.pakai.tanggal !== tgl) SET.pakai = { tanggal: tgl, jumlah: 0 };
    SET.pakai.jumlah++;
    simpanSet();
    if ($('setModal').hidden === false) isiSetelan();
  }

  /* ── 7. Aksi pada pesan ────────────────────────────────────────────── */
  feed.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act],[data-art],[data-artdl],[data-copy],[data-dl],[data-saran],[data-perbesar],[data-jalan],[data-hapusweb]');
    if (!t) return;
    var s = sesiAktif();

    if (t.dataset.perbesar != null || t.dataset.jalan != null) {
      var kbIdx = String(t.dataset.perbesar != null ? t.dataset.perbesar : t.dataset.jalan);
      var kbKode = kodeDariPesan(cariPesanDari(t), kbIdx);
      if (!kbKode) return;
      if (t.dataset.perbesar != null) besarKode(kbKode.kode, kbKode.bahasa);
      else jalankanKode(kbKode.kode, kbKode.bahasa);
      return;
    }
    if (t.dataset.hapusweb != null) { hapusHasilWeb(t); return; }

    if (t.dataset.saran) { ta.value = t.dataset.saran; perbaruiKirim(); kirim(); return; }

    if (t.dataset.artdl) {
      var a = cariArtefak(t.dataset.artdl);
      if (a) unduh(a.nama, a.kode, a.jenis === 'html' ? 'text/html' : a.jenis === 'svg' ? 'image/svg+xml' : 'text/plain');
      return;
    }
    if (t.dataset.art) { var a2 = cariArtefak(t.dataset.art); if (a2) { tampilArtefak(a2); bukaKerja(true); } return; }

    if (t.dataset.copy != null || t.dataset.dl != null) {
      var idxKb = t.dataset.copy != null ? t.dataset.copy : t.dataset.dl;
      var msg = cariPesanDari(t);
      var kode = (msg && msg.text.match(/```[\s\S]*?```/g) || [])[+idxKb];
      if (!kode) return;
      var isi = kode.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
      var bhs = (kode.match(/^```([^\n]*)/) || [, 'txt'])[1].trim();
      if (t.dataset.copy != null) salin(isi, t);
      else unduh((NAMA_BERKAS[LANGS_BERKAS[bhs.toLowerCase()]] || 'kode.txt').replace(/(\.\w+)$/, '-kode$1'), isi);
      return;
    }

    var row = t.closest('.msg'), peran = row.classList.contains('me') ? 'user' : 'ai';
    var pesan = s && s.messages.filter(function (m) { return m.id === row.dataset.id; })[0];
    if (!pesan) return;

    if (t.dataset.act === 'copy') salin(pesan.text, t);
    else if (t.dataset.act === 'dl') unduh('van-chat-' + pesan.id + '.md', pesan.text, 'text/markdown');
    else if (t.dataset.act === 'tts') bacakan(pesan.text);
    else if (t.dataset.act === 'memori') {
      var inti = prompt('Simpan sebagai catatan memori AI:', bersihTeks(pesan.text).slice(0, 200));
      if (inti && inti.trim()) {
        SET.memori.unshift({ id: uid(), teks: inti.trim().slice(0, 300), ts: Date.now() });
        simpanSet(); toast('Disimpan ke memori AI', 'ok');
      }
    }
    else if (t.dataset.act === 'lagi' && peran === 'ai') { ulang(row, pesan); }
    else if (t.dataset.act === 'cabang') { cabangkanPesan(pesan); }
    else if (t.dataset.act === 'bagikan') { bagikanPesan(pesan); }
    else if (t.dataset.act === 'hapuspesan') { hapusPesan(row, pesan, s); }
    else if (t.dataset.act === 'alatulang') { ulangiAlat(row, pesan, s); }
    else if (t.dataset.act === 'suka' || t.dataset.act === 'kurang') {
      t.classList.add('on'); toast(t.dataset.act === 'suka' ? 'Terima kasih!' : 'Masukan dicatat', 'ok');
    }
  });
  function kodeDariPesan(pesan, idx) {
    if (!pesan) return null;
    var kode = (String(pesan.text || '').match(/```[\s\S]*?```/g) || [])[+idx];
    if (!kode) return null;
    var bahasa = (kode.match(/^```([^\n]*)/) || [, 'txt'])[1].trim();
    return { kode: kode.replace(/^```[^\n]*\n?/, '').replace(/```$/, ''), bahasa: bahasa };
  }
  function cariPesanDari(el) {
    var row = el.closest('.msg'), s = sesiAktif();
    if (!row || !s) return null;
    return s.messages.filter(function (m) { return m.id === row.dataset.id; })[0];
  }
  function cariArtefak(id) {
    var s = sesiAktif();
    return (s ? s.artifacts.filter(function (a) { return a.id === id; })[0] : null)
      || (sesi.reduce(function (ak, x) { return ak.concat(x.artifacts || []); }, []).filter(function (a) { return a.id === id; })[0])
      || SET.berkas.filter(function (a) { return a.id === id; })[0];
  }
  /* semua berkas yang tersedia: hasil AI (semua percakapan) + berkas saya */
  function semuaBerkas() {
    var hasil = [];
    sesi.forEach(function (s) {
      (s.artifacts || []).forEach(function (a) {
        hasil.push({ id: a.id, nama: a.nama, jenis: a.jenis, kode: a.kode, ts: a.ts, asal: 'Percakapan: ' + s.judul, sesiId: s.id, dari: 'ai', proyekId: a.proyekId || null, tag: a.tag || [] });
      });
    });
    SET.berkas.forEach(function (a) {
      hasil.push({ id: a.id, nama: a.nama, jenis: a.jenis, kode: a.kode, ts: a.ts, asal: a.asal || 'Berkas saya', dari: 'saya', proyekId: a.proyekId || null, tag: a.tag || [] });
    });
    return hasil.sort(function (a, b) { return b.ts - a.ts; });
  }
  function simpanBerkasSaya(nama, kode, jenis) {
    var a = { id: uid(), nama: nama, jenis: jenis || 'txt', kode: kode, ts: Date.now(), asal: 'Berkas saya', proyekId: SET.proyekAktif || null, tag: [] };
    SET.berkas.unshift(a);
    SET.berkas = SET.berkas.slice(0, 60);
    simpanSet();
    return a;
  }
  function ulang(row, pesan) {
    var s = sesiAktif();
    var sebelum = s.messages.filter(function (m) { return m.role === 'user'; }).slice(-1)[0];
    if (!sebelum) return;
    var idx = s.messages.indexOf(pesan);
    if (idx >= 0) s.messages.splice(idx - 0, s.messages.length - idx);
    row.remove();
    mintaJawaban(s, sebelum);
  }

  /* ── 8. Suara ──────────────────────────────────────────────────────── */
  function bersihTeks(s) {
    return String(s).replace(/```[\s\S]*?```/g, ' (kode) ').replace(/[#*_>`~|-]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function bacakan(teks) {
    if (!window.speechSynthesis) { toast('Browser ini tidak punya suara bawaan', 'err'); return; }
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
    var u = new SpeechSynthesisUtterance(bersihTeks(teks).slice(0, 4000));
    u.lang = 'id-ID';
    var daftar = speechSynthesis.getVoices() || [];
    var pilih = daftar.filter(function (v) { return v.name === SET.suara; })[0]
      || daftar.filter(function (v) { return /^id(-|_)/i.test(v.lang); })[0] || daftar[0];
    if (pilih) u.voice = pilih;
    speechSynthesis.speak(u);
  }
  var micAktif = false;
  $('btnMic').addEventListener('click', function () {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Browser ini belum mendukung input suara', 'err'); return; }
    if (micAktif) return;
    var rec = new SR();
    rec.lang = 'id-ID'; rec.interimResults = true; rec.continuous = false;
    micAktif = true;
    $('btnMic').classList.add('on');
    var dasar = ta.value;
    rec.onresult = function (e) {
      var teks = '';
      for (var i = e.resultIndex; i < e.results.length; i++) teks += e.results[i][0].transcript;
      ta.value = (dasar + ' ' + teks).trim(); perbaruiKirim();
    };
    rec.onerror = function (e) { toast('Input suara gagal: ' + (e.error || 'tidak diketahui'), 'err'); };
    rec.onend = function () { micAktif = false; $('btnMic').classList.remove('on'); };
    try { rec.start(); } catch (e) { micAktif = false; $('btnMic').classList.remove('on'); }
  });

  /* ── 9. Lampiran: berkas teks (isinya dibaca) & foto (dilihat AI) ── */
  var BAHASA_BERKAS = { txt: '', md: 'md', markdown: 'md', json: 'json', csv: 'csv', js: 'js', mjs: 'js', ts: 'js', jsx: 'js', tsx: 'js',
    py: 'python', html: 'html', htm: 'html', css: 'css', sql: 'sql', php: 'php', java: 'java', c: 'c', cpp: 'c', sh: 'bash', yml: 'yaml', yaml: 'yaml', xml: 'xml', svg: 'svg', log: '' };
  var MAKS_FOTO = 3, MAKS_FOTO_MB = 4;
  var MODEL_VISI = 'nex-agi/nex-n2.5-pro';   /* keterangan di antarmuka */

  $('btnFile').addEventListener('click', function () { $('fileIn').click(); });
  $('fileIn').addEventListener('change', function (e) {
    tambahLampiranDariFiles(e.target.files);
    e.target.value = '';
  });
  $('imgIn').addEventListener('change', function (e) {
    [].forEach.call(e.target.files, function (f) { bacaSatuLampiran(f); });
    e.target.value = '';
  });

  /* perkecil foto supaya hemat kuota & muat di penyimpanan browser,
     lalu simpan versi mini untuk ditampilkan di balon percakapan */
  function kecilkanGambar(dataURL) {
    return new Promise(function (selesai) {
      var img = new Image();
      img.onload = function () {
        var gambarKe = function (maks) {
          var skala = Math.min(1, maks / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * skala));
          c.height = Math.max(1, Math.round(img.height * skala));
          var x = c.getContext('2d');
          x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
          x.drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL('image/jpeg', 0.82);
        };
        selesai({ besar: gambarKe(1024), mini: gambarKe(240) });
      };
      img.onerror = function () { selesai({ besar: dataURL, mini: '' }); };
      img.src = dataURL;
    });
  }

  function perbaruiLampiran() {
    var kotak = $('attachList');
    if (!lampiran.length) { kotak.hidden = true; kotak.innerHTML = ''; return; }
    kotak.hidden = false;
    kotak.innerHTML = lampiran.map(function (l, i) {
      var isi = l.gambar
        ? '<img class="lampiran-mini" src="' + (l.mini || l.data) + '" alt="">'
        : '<span class="lampiran-ic">' + ic(l.isi ? 'file-text' : 'paperclip', 14) + '</span>';
      return '<span class="lampiran" data-i="' + i + '">' + isi
        + '<b>' + esc(l.nama) + '</b><small>' + kb(l.ukuran) + (l.gambar ? ' · dilihat AI' : l.isi ? ' · dibaca AI' : '') + '</small>'
        + '<button class="ib sm" data-hapus-lampiran="' + i + '" title="Hapus lampiran">' + ic('x', 13) + '</button></span>';
    }).join('');
  }
  $('attachList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-hapus-lampiran]');
    if (!b) return;
    lampiran.splice(Number(b.dataset.hapusLampiran), 1);
    perbaruiLampiran();
  });

  /* ── 10. Ruang kerja ──────────────────────────────────────────────── */
  function tampilArtefak(a) {
    artefakAktif = a;
    $('artName').textContent = a.nama;
    $('artMeta').textContent = a.jenis.toUpperCase() + ' · ' + kb(a.kode.length);
    $('empty').hidden = true;
    /* halaman/SVG → pratinjau; berkas lain (js/css/…) → tampilkan kodenya */
    tabAktif = (a.jenis === 'html' || a.jenis === 'svg') ? 'prev' : 'code';
    perbaruiTab();
    gambarKerja();
  }
  function gambarKerja() {
    var a = artefakAktif;
    var pratinjauBisa = a && (a.jenis === 'html' || a.jenis === 'svg');
    if (tabAktif === 'files') {
      $('stage').hidden = true; $('filesView').hidden = false; $('devBar').style.visibility = 'hidden';
      gambarBerkas(); return;
    }
    $('filesView').hidden = true; $('stage').hidden = false;
    $('devBar').style.visibility = pratinjauBisa && tabAktif === 'prev' ? 'visible' : 'hidden';
    if (!a) { $('empty').hidden = false; $('frame').hidden = true; $('codeView').hidden = true; return; }
    $('empty').hidden = true;
    if (tabAktif === 'prev') {
      $('codeView').hidden = true; $('frame').hidden = false;
      var src = a.jenis === 'svg'
        ? '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;display:grid;place-items:center;background:#0c0c0e}svg{max-width:92%;max-height:92%}</style></head><body>' + a.kode + '</body></html>'
        : a.kode;
      var fr = $('frame');
      var kartu = $('prevTahan');
      var risikoP = bgnRisiko({ berkas: [{ path: a.nama || 'berkas.html', isi: src }] });
      if (risikoP.length) {
        prevTahan = { src: src, nama: a.nama, tempat: 'kerja' };
        fr.hidden = true; fr.removeAttribute('srcdoc');
        if (!kartu) {
          kartu = document.createElement('div');
          kartu.id = 'prevTahan'; kartu.className = 'pratinjau-tahan';
          fr.parentNode.insertBefore(kartu, fr);
        }
        kartu.hidden = false;
        kartu.innerHTML = kartuTahanHtml(risikoP);
        toast('Pratinjau ditahan — berkas berisi perulangan tanpa henti', 'warn');
        return;
      }
      if (kartu) { kartu.hidden = true; kartu.innerHTML = ''; }
      prevTahan = null;
      fr.hidden = false;
      fr.classList.add('muat');
      fr.onload = function () { fr.classList.remove('muat'); };
      fr.srcdoc = src;
    } else {
      $('frame').hidden = true; $('codeView').hidden = false;
      var baris = a.kode.replace(/\n$/, '').split('\n');
      var warna = warnai(a.kode, a.jenis === 'md' ? 'text' : a.jenis);
      $('codeView').innerHTML = baris.map(function (b, n) {
        return '<span class="ln"><span class="no">' + (n + 1) + '</span><span class="cd">' + (warna.split('\n')[n] || '') + '</span></span>';
      }).join('');
    }
    terapkanLebar();
  }
  function terapkanLebar() {
    var w = lebarPerangkat;
    var dalam = $('stageIn');
    dalam.classList.toggle('lebar', w !== 'fit');
    dalam.style.maxWidth = w === 'fit' ? '100%' : w + 'px';
  }
  var filterBerkas = 'semua';
  function ikonBerkas(jenis) { return jenis === 'html' ? 'file-code' : jenis === 'svg' ? 'image' : 'file-text'; }
  function gambarBerkas() {
    var box = $('filesView');
    var semua = semuaBerkas();
    $('artCount').textContent = semua.length;
    var bagian = '';
    if (!semua.length) {
      bagian = '<div class="empty" style="position:static;padding:34px 10px">' + ic('folder-open', 24)
        + '<b>Belum ada berkas</b><p>Setiap kode/halaman yang dibuat AI otomatis muncul di sini, dan kamu juga bisa menyimpan berkas sendiri.</p></div>';
    } else {
      var saring = { semua: function () { return true; }, ai: function (a) { return a.dari === 'ai'; }, saya: function (a) { return a.dari === 'saya'; } };
      var daftar = semua.filter(saring[filterBerkas] || saring.semua);
      bagian = daftar.length ? daftar.map(function (a) {
        return '<div class="fitem' + (artefakAktif && artefakAktif.id === a.id ? ' on' : '') + '" data-art="' + a.id + '">'
          + '<span class="art-ic">' + ic(ikonBerkas(a.jenis), 17) + '</span>'
          + '<span class="fitem-tx"><b>' + esc(a.nama) + '</b><small>' + a.jenis.toUpperCase() + ' · ' + kb(a.kode.length) + ' · ' + esc(a.asal) + '</small></span>'
          + '<span class="fitem-act">'
          + '<button class="ib sm" data-artpakai="' + a.id + '" title="Pakai isinya di percakapan berikutnya">' + ic('corner-down-left', 15) + '</button>'
          + '<button class="ib sm" data-artganti="' + a.id + '" title="Ganti nama">' + ic('pencil', 15) + '</button>'
          + '<button class="ib sm" data-artdl="' + a.id + '" title="Unduh">' + ic('download', 15) + '</button>'
          + '<button class="ib sm" data-arthapus="' + a.id + '" title="Hapus">' + ic('trash', 15) + '</button>'
          + '</span></div>';
      }).join('') : '<div class="empty" style="position:static;padding:26px 10px"><p>Belum ada berkas pada saringan ini.</p></div>';
    }
    box.innerHTML = '<div class="lib-bar">'
      + ['semua:Semua', 'ai:Hasil AI', 'saya:Berkas saya'].map(function (x) {
        var k = x.split(':')[0], t = x.split(':')[1];
        return '<button class="seg-btn' + (filterBerkas === k ? ' on' : '') + '" data-filter="' + k + '">' + t + '</button>';
      }).join('')
      + '<div class="grow"></div>'
      + '<button class="btn" id="libUnggah">' + ic('upload', 15) + '<span>Unggah</span></button>'
      + '<button class="btn" id="libBaru">' + ic('plus', 15) + '<span>Berkas baru</span></button>'
      + '</div>' + bagian;
  }
  $('filesView').addEventListener('click', function (e) {
    var f = e.target.closest('[data-filter]');
    if (f) { filterBerkas = f.dataset.filter; gambarBerkas(); return; }
    if (e.target.closest('#libUnggah')) { $('fileIn').click(); return; }
    if (e.target.closest('#libBaru')) {
      var nama = prompt('Nama berkas baru (sertakan ekstensi, mis. catatan.md):', 'catatan.md');
      if (!nama) return;
      var jenis = (nama.split('.').pop() || 'txt').toLowerCase();
      var a3 = simpanBerkasSaya(nama, '', jenis);
      tampilArtefak(a3); bukaKerja(true); tabAktif = 'code'; perbaruiTab(); gambarKerja(); ubahArtefak(true);
      return;
    }
    var pakai = e.target.closest('[data-artpakai]');
    if (pakai) {
      var ap = cariArtefak(pakai.dataset.artpakai);
      if (ap) { pakaiDiPercakapan(ap); }
      return;
    }
    var ganti = e.target.closest('[data-artganti]');
    if (ganti) {
      var ag = cariArtefak(ganti.dataset.artganti);
      var namaBaru = prompt('Nama baru berkas:', ag.nama);
      if (namaBaru && namaBaru.trim()) { ag.nama = namaBaru.trim(); simpanSesi(); simpanSet(); gambarBerkas(); if (artefakAktif && artefakAktif.id === ag.id) $('artName').textContent = ag.nama; toast('Nama berkas diganti', 'ok'); }
      return;
    }
    var hapus = e.target.closest('[data-arthapus]');
    if (hapus) {
      var id = hapus.dataset.arthapus;
      if (!confirm('Hapus berkas ini?')) return;
      sesi.forEach(function (s) { s.artifacts = (s.artifacts || []).filter(function (a) { return a.id !== id; }); });
      SET.berkas = SET.berkas.filter(function (a) { return a.id !== id; });
      simpanSesi(); simpanSet();
      if (artefakAktif && artefakAktif.id === id) { artefakAktif = null; $('artName').textContent = 'belum ada berkas'; $('artMeta').textContent = ''; $('empty').hidden = false; }
      gambarBerkas(); toast('Berkas dihapus');
      return;
    }
    var dl = e.target.closest('[data-artdl]');
    if (dl) { var a = cariArtefak(dl.dataset.artdl); if (a) unduhBerkas(a); return; }
    var it = e.target.closest('[data-art]');
    if (it) { var a2 = cariArtefak(it.dataset.art); if (a2) tampilArtefak(a2); }   /* tab menyesuaikan jenis berkas */
  });

  function unduhBerkas(a) {
    var tipe = a.jenis === 'html' ? 'text/html' : a.jenis === 'svg' ? 'image/svg+xml' : a.jenis === 'md' ? 'text/markdown' : 'text/plain';
    unduh(a.nama, a.kode, tipe);
  }
  /* kirim isi berkas ke percakapan sebagai bahan untuk AI */
  function pakaiDiPercakapan(a) {
    var teks = 'Gunakan berkas "' + a.nama + '" berikut sebagai acuan:\n\n```' + (a.jenis || '') + '\n' + String(a.kode).slice(0, 12000) + '\n```\n\n';
    ta.value = teks; ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    perbaruiKirim();
    bukaKerja(false);
    toast('Isi berkas dimasukkan ke kotak tulis');
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { tabAktif = t.dataset.tab; perbaruiTab(); gambarKerja(); });
  });
  function perbaruiTab() { document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('on', x.dataset.tab === tabAktif); }); }
  document.querySelectorAll('.dvb').forEach(function (b) {
    b.addEventListener('click', function () {
      lebarPerangkat = b.dataset.w;
      document.querySelectorAll('.dvb').forEach(function (x) { x.classList.toggle('on', x === b); });
      terapkanLebar();
    });
  });
  $('btnReload').addEventListener('click', function () { gambarKerja(); toast('Pratinjau dimuat ulang'); });
  $('btnOpen').addEventListener('click', function () {
    if (!artefakAktif) { toast('Belum ada berkas', 'err'); return; }
    var tipe = artefakAktif.jenis === 'html' ? 'text/html' : artefakAktif.jenis === 'svg' ? 'image/svg+xml' : 'text/plain';
    var url = URL.createObjectURL(new Blob([artefakAktif.kode], { type: tipe }));
    window.open(url, '_blank');
    setTimeout(function () { URL.revokeObjectURL(url); }, 20000);
  });
  $('btnDl').addEventListener('click', function () {
    if (!artefakAktif) { toast('Belum ada berkas', 'err'); return; }
    unduh(artefakAktif.nama, artefakAktif.kode, artefakAktif.jenis === 'html' ? 'text/html' : artefakAktif.jenis === 'svg' ? 'image/svg+xml' : 'text/plain');
  });
  function bukaKerja(on) {
    document.body.classList.toggle('tanpa-kerja', !on);
    document.body.classList.toggle('kerja-terbuka', on);
    SET.kerjaTerbuka = on; simpanSet();
    $('btnWork').classList.toggle('on', on);
  }
  $('btnWork').addEventListener('click', function () { bukaKerja(document.body.classList.contains('tanpa-kerja')); });
  $('btnWorkHide').addEventListener('click', function () { bukaKerja(false); });
  $('btnWorkShow').addEventListener('click', function () { bukaKerja(true); });

  /* ── 11. Riwayat ──────────────────────────────────────────────────── */
  var hist = $('hist'), cari = '';
  $('q').addEventListener('input', function () { cari = this.value.toLowerCase().trim(); gambarRiwayat(); });
  function grupWaktu(ts) {
    var d = new Date(ts), kini = new Date();
    var hari = (kini - d) / 86400000;
    if (d.toDateString() === kini.toDateString()) return 'Hari ini';
    if (hari < 2) return 'Kemarin';
    if (hari < 7) return '7 hari terakhir';
    if (hari < 30) return 'Bulan ini';
    return 'Lebih lama';
  }
  function gambarRiwayat() {
    var daftar = sesi.filter(function (s) {
      /* saat proyek aktif: tampilkan percakapan proyek itu + percakapan umum/versi lama
         (tanpa proyek) agar tidak pernah "hilang" dari daftar */
      if (SET.proyekAktif && s.proyekId && s.proyekId !== SET.proyekAktif) return false;
      if (!cari) return true;
      var isi = (s.judul + ' ' + s.messages.map(function (m) { return m.text; }).join(' ')).toLowerCase();
      return isi.indexOf(cari) >= 0;
    });
    if (!daftar.length) {
      hist.innerHTML = '<div class="grp">' + (cari ? 'tidak ditemukan'
        : (SET.proyekAktif ? 'belum ada percakapan di proyek ini' : 'belum ada percakapan')) + '</div>';
      return;
    }
    var grup = {}, urut = [];
    daftar.slice().filter(function (s) { return s.pin; }).sort(function (a, b) { return b.ts - a.ts; }).forEach(function (s) {
      if (!grup['Disematkan']) { grup['Disematkan'] = []; urut.push('Disematkan'); }
      grup['Disematkan'].push(s);
    });
    var pr = SET.proyekAktif ? proyekDari(SET.proyekAktif) : null;
    daftar.slice().filter(function (s) { return !s.pin; }).sort(function (a, b) { return b.ts - a.ts; }).forEach(function (s) {
      var g = pr ? (s.proyekId === pr.id ? ('Proyek: ' + pr.nama) : 'Umum (tanpa proyek)') : grupWaktu(s.ts);
      if (!grup[g]) { grup[g] = []; urut.push(g); }
      grup[g].push(s);
    });
    hist.innerHTML = urut.map(function (g) {
      return '<div class="grp">' + g + '</div>' + grup[g].map(function (s) {
        return '<button class="item' + (s.id === aktif ? ' on' : '') + '" data-sesi="' + s.id + '" role="listitem">'
          + '<span data-ic="message-square" data-ic-size="16"></span>'
          + '<span class="it-tx"><b>' + esc(s.judul) + '</b><small>' + jam(s.ts) + ' · ' + s.messages.length + ' pesan</small></span>'
          + '<span class="it-act"><span class="ib sm" data-pin="' + s.id + '" title="' + (s.pin ? 'Lepas sematan' : 'Sematkan') + '">' + ic('pin', 14) + '</span>'
          + '<span class="ib sm" data-ganti="' + s.id + '" title="Ganti nama">' + ic('pencil', 14) + '</span>'
          + '<span class="ib sm" data-hapus="' + s.id + '" title="Hapus">' + ic('trash', 14) + '</span></span></button>';
      }).join('');
    }).join('');
    window.IC.hydrate(hist);
  }
  hist.addEventListener('click', function (e) {
    var pin = e.target.closest('[data-pin]');
    if (pin) {
      e.stopPropagation();
      var sp = sesi.filter(function (x) { return x.id === pin.dataset.pin; })[0];
      sp.pin = !sp.pin; simpanSesi(); gambarRiwayat();
      toast(sp.pin ? 'Percakapan disematkan' : 'Sematan dilepas');
      return;
    }
    var hapus = e.target.closest('[data-hapus]');
    if (hapus) {
      e.stopPropagation();
      var id = hapus.dataset.hapus;
      if (!confirm('Hapus percakapan ini?')) return;
      sesi = sesi.filter(function (s) { return s.id !== id; });
      simpanSesi();
      if (aktif === id) { aktif = null; kosongkanFeed(); sambut(); if (sesi[0]) bukaSesi(sesi[0].id); else sesiBaru(); }
      gambarRiwayat(); toast('Percakapan dihapus');
      return;
    }
    var ganti = e.target.closest('[data-ganti]');
    if (ganti) {
      e.stopPropagation();
      var s = sesi.filter(function (x) { return x.id === ganti.dataset.ganti; })[0];
      var baru = prompt('Nama baru untuk percakapan ini:', s.judul);
      if (baru && baru.trim()) { s.judul = baru.trim().slice(0, 80); simpanSesi(); gambarRiwayat(); if (s.id === aktif) $('chatTitle').textContent = s.judul; }
      return;
    }
    var it = e.target.closest('[data-sesi]');
    if (it) { bukaSesi(it.dataset.sesi); document.body.classList.remove('rel-terbuka'); }
  });
  function bukaSesi(id) {
    aktif = id;
    var s = sesiAktif(); if (!s) return;
    kosongkanFeed();
    $('chatTitle').textContent = s.judul;
    $('chatSub').textContent = s.messages.length ? 'terakhir ' + jam(s.ts) : 'mulai percakapan';
    gambarProyek();
    if (!s.messages.length) sambut();
    else {
      var wadah = pastikanFeed();
      s.messages.forEach(function (m) { tambahPesan(m); });
      wadah.querySelectorAll('.msg .msg-tools').forEach(function (t) { t.classList.add('tetap'); });
      feed.scrollTop = feed.scrollHeight;
    }
    notaProyek();
    if (s.artifacts && s.artifacts.length) { tampilArtefak(s.artifacts[s.artifacts.length - 1]); $('artCount').textContent = s.artifacts.length; }
    else { artefakAktif = null; $('artName').textContent = 'belum ada berkas'; $('artMeta').textContent = ''; $('empty').hidden = false; }
    gambarKerja(); gambarRiwayat();
  }
  $('btnNew').addEventListener('click', function () { sesiBaru(); ta.focus(); document.body.classList.remove('rel-terbuka'); });

  /* saran cepat: isi kotak tulis dengan kerangka permintaan */
  $('chips').addEventListener('click', function (e) {
    var ref = e.target.closest('#chipRef');
    if (ref) {
      SET.refWiki = !SET.refWiki; simpanSet(); isiSetelan();
      ref.classList.toggle('on', SET.refWiki);
      toast(SET.refWiki ? 'Referensi Wikipedia aktif — pertanyaan berikutnya akan diperkuat sumber' : 'Referensi Wikipedia nonaktif', SET.refWiki ? 'ok' : '');
      ta.focus();
      return;
    }
    var b = e.target.closest('[data-templat]');
    if (!b) return;
    var isi = b.dataset.templat.replace(/\\n/g, '\n');
    ta.value = isi;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    perbaruiKirim();
  });

  /* ── 12. Setelan ──────────────────────────────────────────────────── */
  function terapkanSet() {
    document.documentElement.setAttribute('data-theme', SET.tema);
    document.documentElement.style.setProperty('--fs', SET.fs + 'px');
    document.documentElement.style.setProperty('--feed-w', SET.feedW + 'px');
    if (SET.railW) document.documentElement.style.setProperty('--rail-w', SET.railW);
    else document.documentElement.style.removeProperty('--rail-w');
    if (SET.workW) document.documentElement.style.setProperty('--work-w', SET.workW);
    else document.documentElement.style.removeProperty('--work-w');
    document.body.classList.toggle('tanpa-kerja', !SET.kerjaTerbuka);
    $('btnWork').classList.toggle('on', SET.kerjaTerbuka);
    $('btnTheme').querySelector('[data-ic],svg').outerHTML = ic(SET.tema === 'dark' ? 'moon' : 'sun', 17);
    $('themeTx').textContent = SET.tema === 'dark' ? 'Tema gelap' : 'Tema terang';
    $('modeTx').textContent = MODE[SET.mode].label;
    $('modeTx2').textContent = MODE[SET.mode].label;
    $('btnMode').querySelector('svg').outerHTML = ic(MODE[SET.mode].ikon, 15);
    $('btnModeC').querySelector('svg').outerHTML = ic(MODE[SET.mode].ikon, 15);
    $('btnModeC').classList.toggle('on', SET.mode !== 'fast');
    $('chatSub').textContent = labelMode(SET.mode);
  }
  document.querySelectorAll('.seg').forEach(function (seg) {
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var kunci = seg.id;
      var v = b.dataset.v;
      if (kunci === 'setTheme') SET.tema = v;
      if (kunci === 'setFont') SET.fs = parseFloat(v);
      if (kunci === 'setWidth') SET.feedW = parseInt(v, 10);
      if (kunci === 'setMode') SET.mode = v;
      simpanSet(); terapkanSet(); isiSetelan();
      if (kunci === 'setMode') toast('Mode: ' + MODE[v].label);
    });
  });
  $('btnTheme').addEventListener('click', function () {
    SET.tema = SET.tema === 'dark' ? 'light' : 'dark'; simpanSet(); terapkanSet(); isiSetelan();
  });
  function sw(el, aktif, saatUbah) {
    el.classList.toggle('on', !!aktif);
    el.onclick = function () { saatUbah(!el.classList.contains('on')); };
  }
  function isiSetelan() {
    document.querySelectorAll('#setTheme button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === SET.tema); });
    document.querySelectorAll('#setFont button').forEach(function (b) { b.classList.toggle('on', parseFloat(b.dataset.v) === SET.fs); });
    document.querySelectorAll('#setWidth button').forEach(function (b) { b.classList.toggle('on', parseInt(b.dataset.v, 10) === SET.feedW); });
    document.querySelectorAll('#setMode button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === SET.mode); });
    var ubahStream = function (v) { SET.stream = v; simpanSet(); sw($('setStream'), v, ubahStream); };
    sw($('setStream'), SET.stream, ubahStream);
    sw($('setAutoTTS'), SET.autoTTS, function (v) { SET.autoTTS = v; simpanSet(); });
    sw($('setEnter'), SET.enterKirim, function (v) { SET.enterKirim = v; simpanSet(); });
    sw($('setRefWiki'), SET.refWiki, function (v) { SET.refWiki = v; simpanSet(); toast(v ? 'Referensi Wikipedia aktif' : 'Referensi Wikipedia nonaktif'); });
    var sel = $('setVoice');
    var daftar = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    sel.innerHTML = '<option value="">(bawaan browser)</option>' + daftar.map(function (v) {
      return '<option value="' + esc(v.name) + '"' + (v.name === SET.suara ? ' selected' : '') + '>' + esc(v.name) + ' — ' + esc(v.lang) + '</option>';
    }).join('');
    sw($('setMemoriAktif'), SET.memoriAktif, function (v) { SET.memoriAktif = v; simpanSet(); });
    gambarMemori();
    gambarTugas();
    $('setUsage').textContent = String(SET.pakai.jumlah || 0);   /* hitungan perangkat ini saja — batas resmi ada di dasbor 9Router */
    $('setCount').textContent = sesi.length;
    $('setArts').textContent = sesi.reduce(function (n, s) { return n + (s.artifacts || []).length; }, 0);
  }
  $('setVoice').addEventListener('change', function () { SET.suara = this.value; simpanSet(); });
  $('setExport').addEventListener('click', function () {
    unduh('van-chat-spy-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ versi: 1, setelan: SET, sesi: sesi }, null, 2), 'application/json');
  });
  $('setImport').addEventListener('click', function () {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var j = JSON.parse(rd.result);
          if (j.sesi && j.sesi.length) { sesi = j.sesi.concat(sesi); simpanSesi(); gambarRiwayat(); toast(j.sesi.length + ' percakapan diimpor', 'ok'); }
          else toast('Berkas tidak berisi percakapan', 'err');
        } catch (e) { toast('Berkas tidak valid', 'err'); }
      };
      rd.readAsText(f);
    };
    inp.click();
  });
  $('setWipe').addEventListener('click', function () {
    if (!confirm('Hapus SEMUA percakapan, berkas hasil, dan setelan?')) return;
    localStorage.removeItem(LS_SES); localStorage.removeItem(LS_SET);
    location.reload();
  });
  document.querySelectorAll('[data-close]').forEach(function (x) {
    x.addEventListener('click', function () { x.closest('.modal').hidden = true; });
  });
  $('btnSettings').addEventListener('click', function () { isiSetelan(); $('setModal').hidden = false; });
  $('btnMode').addEventListener('click', function () { isiMode(); $('modeModal').hidden = false; });
  $('btnModeC').addEventListener('click', function () { isiMode(); $('modeModal').hidden = false; });
  /* nama penyedia yang sebenarnya (9router / gateway kustom) untuk tulisan di layar */
  function labelPenyedia() {
    var t = SET.penyedia && SET.penyedia.teks;
    if (!t) return 'penyedia AI';
    if (t.label) return t.label;                                  /* dari server: nama yang jujur */
    if (t.penyedia === '9router' || t.penyedia === '9router') return '9Router';
    return t.penyedia || 'penyedia AI';
  }
  function tandaKuotaHabis(habis) {
    SET.pakai = SET.pakai || { tanggal: '', jumlah: 0 };
    SET.pakai.habis = !!habis;    /* batas asli ditentukan paket 9Router — kita hanya mencatat apa yang dikatakan penyedia */
    if (habis) SET.pakai.kena = (SET.pakai.kena || 0) + 1;
    simpanSet();
    var el = document.getElementById('modeKepala');
    if (el) el.textContent = ringkasKuota();
  }
  function ringkasKuota() {
    var habis = !!(SET.pakai && SET.pakai.habis);
    var pakai = (SET.pakai && SET.pakai.jumlah) || 0;
    if (habis) return 'batas penyedia tercapai (dari ' + labelPenyedia() + ') · tunggu sebentar atau naikkan paket di dasbor';
    return pakai
      ? 'pemakaian hari ini ' + pakai + ' permintaan · batas mengikuti paket akunmu di ' + labelPenyedia()
      : 'batas permintaan mengikuti paket akunmu di ' + labelPenyedia();
  }
  function isiMode() {
    var kepala = '<div class="mode-kepala"><span class="art-ic">' + ic('activity', 17) + '</span>'
      + '<span><b>Mode AI</b><small id="modeKepala">' + ringkasKuota() + '</small></span></div>';
    $('modeList').innerHTML = kepala + Object.keys(MODE).map(function (k) {
      var m = MODE[k];
      return '<button class="mode-it' + (k === SET.mode ? ' on' : '') + '" data-mode="' + k + '" style="animation-delay:' + (Object.keys(MODE).indexOf(k) * 45) + 'ms">'
        + '<span class="art-ic">' + ic(m.ikon, 17) + '</span>'
        + '<span><b>' + m.label + ' — ' + esc(labelMode(k)) + '</b><small>' + esc(m.ket) + '</small></span>'
        + (k === SET.mode ? '<span class="cek">' + ic('check', 16) + '</span>' : '') + '</button>';
    }).join('')
      + '<p class="mode-ket">Yang ditampilkan ke kamu hanya <b>status proses</b>, <b>ringkasan alasan</b> bila perlu, dan <b>jawaban akhir</b> — proses berpikir internal model tidak ditampilkan. Status proses muncul di kotak tulis saat jawaban sedang disusun.</p>';
  }
  $('modeList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]'); if (!b) return;
    SET.mode = b.dataset.mode; simpanSet(); terapkanSet(); $('modeModal').hidden = true; toast('Mode: ' + MODE[SET.mode].label);
  });

  /* ── 12b. Editor berkas (Code Builder: ubah lalu simpan) ───────────── */
  var ubahAktif = false;
  function ubahArtefak(aktifkan) {
    if (aktifkan && !artefakAktif) { toast('Belum ada berkas untuk diubah', 'err'); return; }
    ubahAktif = !!aktifkan;
    $('editor').hidden = !ubahAktif;
    $('btnUbah').classList.toggle('on', ubahAktif);
    if (ubahAktif) {
      $('codeView').hidden = true; $('frame').hidden = true; $('empty').hidden = true;
      $('editorTa').value = artefakAktif.kode;
      $('editorInfo').textContent = artefakAktif.nama + ' · ' + kb(artefakAktif.kode.length) + ' · ' + artefakAktif.kode.split('\n').length + ' baris';
      $('editorTa').focus();
    } else {
      gambarKerja();
    }
  }
  $('btnUbah').addEventListener('click', function () { ubahArtefak(!ubahAktif); });
  $('btnUbahBatal').addEventListener('click', function () { ubahArtefak(false); });
  $('btnUbahSimpan').addEventListener('click', function () {
    if (!artefakAktif) return;
    var isiBaru = $('editorTa').value;
    var lama = artefakAktif.kode.length;
    artefakAktif.kode = isiBaru;
    artefakAktif.ts = Date.now();
    simpanSesi(); simpanSet();
    $('artMeta').textContent = artefakAktif.jenis.toUpperCase() + ' · ' + kb(isiBaru.length);
    ubahArtefak(false);
    toast('Berkas disimpan (' + kb(lama) + ' → ' + kb(isiBaru.length) + ')', 'ok');
  });

  /* ── 12c. Proyek (kelompok percakapan + arahan tetap) ──────────────── */
  /* Catatan jujur di atas kotak tulis: kalau ada proyek aktif tetapi obrolan
     yang dibuka belum masuk proyek itu, arahan proyek TIDAK dikirim ke AI.
     Ditampilkan jelas + satu klik untuk memasukkannya. */
  function notaProyek() {
    var el = $('prjNota'); if (!el) return;
    var s0 = sesiAktif();
    var pr = SET.proyekAktif ? proyekDari(SET.proyekAktif) : null;
    if (!pr || !s0) { el.hidden = true; el.innerHTML = ''; return; }
    if (s0.proyekId === pr.id) {
      el.hidden = false;
      el.className = 'prj-nota on';
      el.innerHTML = ic('folder', 14) + '<span>Obrolan ini masuk proyek <b>' + esc(pr.nama) + '</b> — arahan proyek dikirim pada setiap pesan.</span>'
        + '<span class="grow"></span><button class="btn" id="prjNotaLihat">' + ic('sliders', 13) + 'Lihat arahan</button>';
      return;
    }
    el.hidden = false;
    el.className = 'prj-nota warn';
    el.innerHTML = ic('alert-triangle', 14) + '<span>Obrolan ini belum masuk proyek <b>' + esc(pr.nama) + '</b> — arahan proyek belum dikirim ke AI.</span>'
      + '<span class="grow"></span><button class="btn pr" id="prjNotaPakai">' + ic('plus', 13) + 'Pakai arahan proyek</button>';
  }
  function pakaiArahanProyek() {
    var pr = SET.proyekAktif ? proyekDari(SET.proyekAktif) : null;
    var s0 = sesiAktif();
    if (!pr || !s0) return;
    s0.proyekId = pr.id;
    simpanSesi(); gambarRiwayat(); notaProyek();
    toast('Obrolan ini masuk proyek "' + pr.nama + '" — arahan proyek dipakai mulai pesan berikutnya', 'ok');
  }
  if ($('prjNota')) $('prjNota').addEventListener('click', function (e) {
    if (e.target.closest('#prjNotaPakai')) { pakaiArahanProyek(); return; }
    if (e.target.closest('#prjNotaLihat')) {
      location.hash = '#/projects';
      setTimeout(function () { var it = document.querySelector('[data-prj="' + SET.proyekAktif + '"]'); if (it) it.scrollIntoView({ block: 'center' }); }, 250);
    }
  });
  function gambarProyek() {
    var box = $('proyekList');
    var aktifObj = SET.proyekAktif ? proyekDari(SET.proyekAktif) : null;
    if (!SET.proyek.length && !aktifObj) {
      box.innerHTML = '<div class="proyek-kosong">Belum ada proyek. Proyek mengelompokkan percakapan + memberi arahan tetap ke AI.</div>';
    } else {
      box.innerHTML = '<button class="proyek-it' + (!SET.proyekAktif ? ' on' : '') + '" data-proyek="">'
        + ic('layers', 14) + '<span>Semua percakapan</span><small>' + sesi.length + '</small></button>'
        + SET.proyek.map(function (pr) {
          var n = sesi.filter(function (x) { return x.proyekId === pr.id; }).length;
          return '<button class="proyek-it' + (SET.proyekAktif === pr.id ? ' on' : '') + '" data-proyek="' + pr.id + '" title="' + esc(pr.instruksi || '') + '">'
            + ic('folder', 14) + '<span>' + esc(pr.nama) + '</span><small>' + n + '</small>'
            + '<span class="proyek-act"><span class="ib sm" data-proyek-ubah="' + pr.id + '" title="Nama & arahan">' + ic('sliders', 13) + '</span>'
            + '<span class="ib sm" data-proyek-hapus="' + pr.id + '" title="Hapus proyek">' + ic('trash', 13) + '</span></span></button>';
        }).join('');
    }
    var judul = aktifObj ? aktifObj.nama : null;
    $('chatTitle').textContent = judul ? judul + ' · ' + (sesiAktif() ? sesiAktif().judul : 'Percakapan baru') : (sesiAktif() ? sesiAktif().judul : 'Percakapan baru');
  }
  $('proyekList').addEventListener('click', function (e) {
    var ubah = e.target.closest('[data-proyek-ubah]');
    if (ubah) {
      e.stopPropagation();
      var pr = proyekDari(ubah.dataset.proyekUbah);
      var nama = prompt('Nama proyek:', pr.nama);
      if (nama === null) return;
      var arahan = prompt('Arahan tetap untuk AI di proyek ini (dikirim pada setiap pertanyaan):', pr.instruksi || '');
      if (nama.trim()) pr.nama = nama.trim().slice(0, 60);
      if (arahan !== null) pr.instruksi = arahan.trim().slice(0, 600);
      simpanSet(); gambarProyek(); toast('Proyek diperbarui', 'ok');
      return;
    }
    var hapus = e.target.closest('[data-proyek-hapus]');
    if (hapus) {
      e.stopPropagation();
      if (!confirm('Hapus proyek ini? Percakapannya tetap ada (menjadi tanpa proyek).')) return;
      var id = hapus.dataset.proyekHapus;
      SET.proyek = SET.proyek.filter(function (x) { return x.id !== id; });
      sesi.forEach(function (x) { if (x.proyekId === id) x.proyekId = null; });
      if (SET.proyekAktif === id) SET.proyekAktif = null;
      simpanSet(); simpanSesi(); gambarProyek(); gambarRiwayat(); toast('Proyek dihapus');
      return;
    }
    var it = e.target.closest('[data-proyek]');
    if (it) {
      SET.proyekAktif = it.dataset.proyek || null;
      simpanSet(); gambarProyek(); gambarRiwayat(); notaProyek();
      var p2 = SET.proyekAktif ? proyekDari(SET.proyekAktif) : null;
      toast(p2 ? 'Proyek: ' + p2.nama : 'Menampilkan semua percakapan');
    }
  });
  $('btnProyekBaru').addEventListener('click', function () {
    var nama = prompt('Nama proyek baru:', '');
    if (!nama || !nama.trim()) return;
    var arahan = prompt('Arahan tetap untuk AI di proyek ini (boleh dikosongkan):', '');
    var pr = { id: uid(), nama: nama.trim().slice(0, 60), instruksi: (arahan || '').trim().slice(0, 600), ts: Date.now() };
    SET.proyek.unshift(pr);
    SET.proyekAktif = pr.id;
    simpanSet(); gambarProyek(); gambarRiwayat();
    sesiBaru();
    toast('Proyek dibuat — percakapan baru masuk ke proyek ini', 'ok');
  });

  /* ── 12d. Memori AI ───────────────────────────────────────────────── */
  function gambarMemori() {
    var box = $('memList');
    if (!SET.memori.length) { box.innerHTML = '<p class="note">Belum ada catatan. Tambahkan hal yang ingin selalu diingat AI (nama, gaya jawaban, konteks pekerjaan).</p>'; return; }
    box.innerHTML = SET.memori.map(function (m) {
      return '<div class="mini-it"><span>' + esc(m.teks) + '</span>'
        + '<button class="ib sm" data-mem-ubah="' + m.id + '" title="Ubah">' + ic('pencil', 14) + '</button>'
        + '<button class="ib sm" data-mem-hapus="' + m.id + '" title="Hapus">' + ic('trash', 14) + '</button></div>';
    }).join('');
  }
  $('memTambah').addEventListener('click', function () {
    var v = $('memTeks').value.trim();
    if (!v) { toast('Tulis dulu catatannya', 'err'); return; }
    SET.memori.unshift({ id: uid(), teks: v.slice(0, 300), ts: Date.now() });
    SET.memori = SET.memori.slice(0, 40);
    $('memTeks').value = '';
    simpanSet(); gambarMemori(); isiSetelan();
    toast('Catatan disimpan ke memori AI', 'ok');
  });
  $('memTeks').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('memTambah').click(); });
  $('memList').addEventListener('click', function (e) {
    var ubah = e.target.closest('[data-mem-ubah]');
    if (ubah) {
      var m = SET.memori.filter(function (x) { return x.id === ubah.dataset.memUbah; })[0];
      var baru = prompt('Ubah catatan memori:', m.teks);
      if (baru && baru.trim()) { m.teks = baru.trim().slice(0, 300); simpanSet(); gambarMemori(); }
      return;
    }
    var hapus = e.target.closest('[data-mem-hapus]');
    if (hapus) { SET.memori = SET.memori.filter(function (x) { return x.id !== hapus.dataset.memHapus; }); simpanSet(); gambarMemori(); isiSetelan(); toast('Catatan dihapus'); }
  });

  /* ── 12e. Tugas terjadwal (jalan selama halaman terbuka) ───────────── */
  function waktuTugas(t) { return new Date(t.waktu).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); }
  function gambarTugas() {
    var box = $('tgList');
    if (!SET.tugas.length) { box.innerHTML = '<p class="note">Belum ada tugas. Contoh: "Ringkas 5 berita teknologi" setiap hari pukul 08.00.</p>'; return; }
    box.innerHTML = SET.tugas.map(function (t) {
      return '<div class="mini-it' + (t.aktif ? '' : ' mati') + '"><span><b>' + esc(t.judul) + '</b><small>' + esc(t.prompt.slice(0, 70)) + ' · ' + (t.ulang === 'harian' ? 'setiap hari' : 'sekali') + ' · ' + waktuTugas(t) + '</small></span>'
        + '<button class="ib sm" data-tg-jalan="' + t.id + '" title="Jalankan sekarang">' + ic('play', 14) + '</button>'
        + '<button class="ib sm" data-tg-aktif="' + t.id + '" title="Aktif/nonaktif">' + ic(t.aktif ? 'pause' : 'play', 14) + '</button>'
        + '<button class="ib sm" data-tg-hapus="' + t.id + '" title="Hapus">' + ic('trash', 14) + '</button></div>';
    }).join('');
  }
  $('tgTambah').addEventListener('click', function () {
    var judul = $('tgJudul').value.trim();
    var promptT = $('tgPrompt').value.trim();
    var waktu = $('tgWaktu').value;
    if (!judul || !promptT || !waktu) { toast('Isi nama, perintah, dan waktunya', 'err'); return; }
    SET.tugas.unshift({ id: uid(), judul: judul.slice(0, 60), prompt: promptT.slice(0, 800), waktu: new Date(waktu).getTime(), ulang: $('tgUlang').value, aktif: true, terakhir: 0 });
    simpanSet(); gambarTugas(); isiSetelan();
    $('tgJudul').value = ''; $('tgPrompt').value = '';
    if (window.Notification && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (e) {}
    }
    toast('Tugas dibuat', 'ok');
  });
  $('tgList').addEventListener('click', function (e) {
    var j = e.target.closest('[data-tg-jalan]');
    if (j) { var t = SET.tugas.filter(function (x) { return x.id === j.dataset.tgJalan; })[0]; $('setModal').hidden = true; jalankanTugas(t); return; }
    var a = e.target.closest('[data-tg-aktif]');
    if (a) { var t2 = SET.tugas.filter(function (x) { return x.id === a.dataset.tgAktif; })[0]; t2.aktif = !t2.aktif; simpanSet(); gambarTugas(); return; }
    var h = e.target.closest('[data-tg-hapus]');
    if (h) { SET.tugas = SET.tugas.filter(function (x) { return x.id !== h.dataset.tgHapus; }); simpanSet(); gambarTugas(); isiSetelan(); toast('Tugas dihapus'); }
  });
  function jalankanTugas(t) {
    var sesiTugas = { id: uid(), judul: 'Tugas: ' + t.judul, ts: Date.now(), messages: [], artifacts: [], proyekId: SET.proyekAktif || null, tugas: true };
    sesi.unshift(sesiTugas);
    simpanSesi(); gambarRiwayat(); bukaSesi(sesiTugas.id);
    if (window.Notification && Notification.permission === 'granted') {
      try { new Notification('Van Chat.SPY — tugas dijalankan', { body: t.judul }); } catch (e) {}
    }
    toast('Menjalankan tugas: ' + t.judul, 'ok');
    ta.value = t.prompt;
    perbaruiKirim();
    kirim();
  }
  function cekTugas() {
    var kini = Date.now();
    SET.tugas.forEach(function (t) {
      if (!t.aktif || !t.waktu || t.waktu > kini) return;
      if (t.ulang === 'harian') {
        while (t.waktu <= kini) t.waktu += 86400000;
      } else {
        t.aktif = false;
      }
      t.terakhir = kini;
      simpanSet();
      if (!sedangJalan) jalankanTugas(t);
      if (!$('setModal').hidden) gambarTugas();
    });
  }

  /* ── 12f. Riset dalam: rencana → sumber Wikipedia → laporan ────────── */
  function cariWiki(tanya) {
    var w = 'https://id.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1';
    return fetch(w + '&list=search&srlimit=2&srsearch=' + encodeURIComponent(tanya))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var hasil = ((j && j.query && j.query.search) || []).slice(0, 2);
        if (!hasil.length) return [];
        var judul = hasil.map(function (x) { return x.title; });
        return fetch(w + '&prop=extracts&exintro=1&explaintext=1&titles=' + encodeURIComponent(judul.join('|')))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (e) {
            var hal = (e && e.query && e.query.pages) || {};
            return judul.map(function (t) {
              var h = Object.keys(hal).map(function (k) { return hal[k]; }).filter(function (x) { return x && x.title === t; })[0];
              return { judul: t, ringkas: h && h.extract ? h.extract.replace(/\s+/g, ' ').slice(0, 700) : '', url: 'https://id.wikipedia.org/wiki/' + encodeURIComponent(t.replace(/ /g, '_')) };
            }).filter(function (x) { return x.ringkas; });
          });
      })
      .catch(function () { return []; });
  }
  /* Permintaan INTERNAL (builder, riset, perbaiki berkas) ditandai
     `internal: true`: jawabannya diperiksa kode program, bukan oleh pemeriksa
     perintah ketat — pemeriksa itu untuk pertanyaan pengguna, dan kalau
     dikenakan ke prompt internal ia menolak jawaban JSON yang sah
     (mis. "balas HANYA JSON … tanpa pagar kode" dianggap minta "hanya kode")
     lalu memakan 3 putaran perbaikan yang tidak perlu. */
  function mintaTeks(prompt, maks) {
    return fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt, mode: maks || 'think', stream: false, memori: memoriUntukApi(), internal: true })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok || !j.text) throw new Error((j && j.pesan) || 'gagal');
      return j.text;
    });
  }
  function escapeHtmlDoc(t) { return esc(t); }
  function laporanHtml(judul, isiMarkdown, sumber, tambahan) {
    var info = tambahan || {};
    return '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>' + esc(judul) + '</title><style>'
      + ':root{color-scheme:dark}body{margin:0;background:#0c0c0e;color:#ededf2;font:16px/1.7 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
      + '.wrap{max-width:780px;margin:0 auto;padding:40px 22px 70px}'
      + '.kop{display:flex;align-items:center;gap:12px;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:14px;margin-bottom:22px}'
      + '.kop b{font-size:15px}h1{font-size:30px;line-height:1.25;margin:0 0 6px}.meta{color:#8a8a96;font-size:12.5px;margin-bottom:22px}'
      + 'h2{font-size:20px;margin:30px 0 10px;border-left:3px solid #fa0102;padding-left:10px}'
      + 'h3{font-size:16.5px;margin:22px 0 8px}p{margin:11px 0}ul,ol{padding-left:22px}li{margin:6px 0}'
      + 'code{background:#1a1a1f;border:1px solid rgba(255,255,255,.09);border-radius:6px;padding:1.5px 6px;font:13.5px ui-monospace,monospace}'
      + 'pre{background:#0b0d12;border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:12px;overflow:auto;font:13px ui-monospace,monospace}'
      + 'blockquote{margin:14px 0;padding:6px 0 6px 14px;border-left:3px solid rgba(255,255,255,.18);color:#a2a2ad}'
      + 'a{color:#ff6a6d}.src{margin-top:34px;border-top:1px solid rgba(255,255,255,.12);padding-top:16px;font-size:13.5px;color:#a2a2ad}'
      + '.src a{color:#ff8a8d;text-decoration:none}.metode{margin:26px 0;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px 16px;background:#101014}.metode b{display:block;margin-bottom:6px}.metode ul{margin:0;padding-left:18px;font-size:13.5px;color:#b9b9c3}.badge{display:inline-flex;align-items:center;gap:7px;background:rgba(250,1,2,.12);border:1px solid rgba(250,1,2,.4);color:#ff8a8d;border-radius:99px;padding:4px 11px;font-size:11.5px}'
      + '</style></head><body><div class="wrap"><div class="kop"><span class="badge">VAN CHAT.SPY · RISET DALAM</span></div>'
      + '<h1>' + esc(judul) + '</h1><div class="meta">Disusun ' + new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }) + ' WIB · sumber utama: Wikipedia Indonesia</div>'
      + (info.analisis ? '<div class="metode"><b>Metode riset</b><ul>'
        + '<li>Pertanyaan tercakup: ' + info.analisis.pertanyaanTercakup + '/' + info.analisis.pertanyaanTotal + '</li>'
        + '<li>Sumber diperiksa: ' + ((info.periksa && info.periksa.sah.length) || sumber.length) + ' dari ' + Object.keys((info.periksa && info.periksa.penyedia) || {}).length + ' penyedia</li>'
        + '<li>Tingkat kepercayaan: ' + info.analisis.kepercayaan + '</li>'
        + '<li>Tema utama: ' + ((info.analisis.tema || []).slice(0, 5).join(', ') || '—') + '</li>'
        + '<li>Langkah: ' + ((info.langkah || []).join(' → ') || '—') + '</li>'
        + (info.durasi ? '<li>Durasi: ' + (info.durasi / 1000).toFixed(1) + ' detik</li>' : '')
        + '</ul>' + ((info.periksa && info.periksa.catatan.length) ? '<p>Catatan pemeriksaan: ' + esc(info.periksa.catatan.join('; ')) + '</p>' : '') + '</div>' : '')
      + renderMarkdown(isiMarkdown, null).html
      + '<div class="src"><b>Sumber & sitasi</b><ol>' + sumber.map(function (u, i) {
        return '<li>[<b>' + (i + 1) + '</b>] <a href="' + esc(u.url) + '" target="_blank" rel="noopener">' + esc(u.judul) + '</a> — ' + esc(u.penyedia || 'Wikipedia Indonesia') + '</li>';
      }).join('') + '</ol><p>Setiap nomor di dalam laporan mengacu ke daftar ini. Sumber diperiksa otomatis: alamat tidak sah dan duplikat dibuang sebelum laporan ditulis.</p></div>'
      + '</div></body></html>';
  }
  function jalankanRiset(tanya) {
    var s = sesiAktif() || sesiBaru();
    var baris = tambahPesan({ id: uid(), role: 'ai', text: '', html: '<b>Riset dalam</b><div class="riset-langkah" id="rl">' + ic('search', 14) + '<span>1/4 Menyusun rencana pertanyaan…</span></div>', ms: 0 });
    var bub = baris.querySelector('.bub');
    function langkah(n, teks, ikon) {
      bub.innerHTML = '<b>Riset dalam</b><div class="riset-langkah">' + ic(ikon || 'search', 14) + '<span>' + n + '/4 ' + esc(teks) + '</span><span class="tulis"><i></i><i></i><i></i></span></div>';
      gulirBawah(false);
    }
    var t0 = Date.now();
    statusJalan(true);
    langkah(1, 'Menyusun rencana pertanyaan…');
    mintaTeks('Buat 4 pertanyaan riset singkat (masing-masing maksimal 8 kata) untuk mendalami topik berikut. Balas hanya daftar bernomor, tanpa pembuka atau penutup.\n\nTopik: ' + tanya, 'think')
      .then(function (rencana) {
        var daftar = rencana.split('\n').map(function (b) { return b.replace(/^\s*\d+[.)]\s*/, '').trim(); }).filter(function (b) { return b.length > 4; }).slice(0, 4);
        if (!daftar.length) daftar = [tanya];
        langkah(2, 'Mencari sumber untuk ' + daftar.length + ' pertanyaan…');
        return Promise.all(daftar.map(cariWiki)).then(function (hasil) {
          var sumber = [], bahan = [];
          hasil.forEach(function (h, i) {
            if (!h.length) return;
            h.forEach(function (x) {
              if (!sumber.some(function (y) { return y.url === x.url; })) sumber.push(x);
              bahan.push('[' + (i + 1) + '] ' + daftar[i] + '\nJudul: ' + x.judul + '\n' + x.ringkas);
            });
          });
          langkah(3, 'Menulis laporan dari ' + sumber.length + ' sumber…');
          var prompt = 'Tulis laporan riset dalam bahasa Indonesia (markdown) tentang: ' + tanya + '\n\n'
            + 'Struktur: pendahuluan singkat, 3–5 bagian berjudul (##), lalu simpulan. Gunakan hanya bahan di bawah; kalau kurang, katakan apa yang belum jelas. Jangan menulis sumber palsu.\n\n'
            + 'BAHAN DARI WIKIPEDIA INDONESIA:\n' + (bahan.join('\n\n') || '(tidak ada bahan ditemukan — tulis laporan yang jujur menyebutkan keterbatasan ini)');
          return mintaTeks(prompt, 'deep').then(function (teksLaporan) {
            var judul = tanya.length > 60 ? tanya.slice(0, 60) + '…' : tanya;
            var html = laporanHtml(judul, teksLaporan, sumber);
            var a = { id: uid(), nama: 'riset-' + uid() + '.html', jenis: 'html', kode: html, ts: Date.now(), riset: true };
            s.artifacts.push(a);
            var catatan = 'Laporan riset selesai — **' + sumber.length + ' sumber** dipakai, berkas `' + a.nama + '` siap dipratinjau/diunduh di Ruang Kerja.\n\n' + teksLaporan;
            var pesanAI = { id: baris.dataset.id, role: 'ai', text: catatan, ts: Date.now(), model: 'riset dalam · 2 permintaan AI', ms: Date.now() - t0, artifacts: [a] };
            s.messages.push(pesanAI);
            simpanSesi();
            var baru = tambahPesan(pesanAI);
            baris.replaceWith(baru);
            tampilArtefak(a); bukaKerja(true); tabAktif = 'prev'; perbaruiTab(); gambarKerja();
            $('artCount').textContent = s.artifacts.length;
            hitungPakai(); hitungPakai();
            statusJalan(false);
            $('chatSub').textContent = 'riset selesai dalam ' + ((Date.now() - t0) / 1000).toFixed(1) + ' detik';
            toast('Laporan riset siap di ruang kerja', 'ok');
            gulirBawah(true);
          });
        });
      })
      .catch(function (e) {
        bub.innerHTML = kartuGalat('Riset gagal', e.message || 'gagal terhubung');
        catatGalat('Riset dalam gagal: ' + (e.message || 'gagal terhubung'));
        statusJalan(false);
      });
  }
  /* Konfirmasi riset memakai bilah DI DALAM aplikasi, bukan dialog bawaan
     browser: dialog bawaan membekukan seluruh halaman (dan pengujian otomatis)
     sampai ditekan, sedangkan bilah ini bisa dibatalkan dan terlihat jelas. */
  function risetKonfirmasiTutup() { var el = $('risetKonfirmasi'); if (el) { el.hidden = true; el.innerHTML = ''; } }
  function risetTanya(tanya) {
    var el = $('risetKonfirmasi'); if (!el) { risetMendalam(tanya); return; }
    el.hidden = false;
    el.innerHTML = ic('search', 15)
      + '<span>Jalankan <b>riset mendalam</b> untuk “' + esc(tanya.slice(0, 70)) + '”? Alur 7 langkah: rencana → cari sumber → kumpulkan → analisis → bandingkan → periksa → laporan bersitasi. <b>Memakai 2 permintaan AI.</b></span>'
      + '<span class="grow"></span>'
      + '<button class="btn" id="risetBatal">Batal</button>'
      + '<button class="btn pr" id="risetLanjut">' + ic('play', 14) + 'Lanjutkan</button>';
  }
  if ($('risetKonfirmasi')) $('risetKonfirmasi').addEventListener('click', function (e) {
    var lanjut = e.target.closest('#risetLanjut'), batal = e.target.closest('#risetBatal');
    if (!lanjut && !batal) return;
    var tanya = ta.value.trim();
    risetKonfirmasiTutup();
    if (lanjut && tanya) risetMendalam(tanya);
  });
  $('chipRiset').addEventListener('click', function () {
    var tanya = ta.value.trim();
    if (!tanya) { ta.value = 'Riset tentang: '; ta.focus(); toast('Tulis dulu topik risetnya di kotak tulis'); return; }
    risetTanya(tanya);
  });

  /* ── 13. Geser pembatas ───────────────────────────────────────────── */
  function pasangGeser(el, jenis) {
    var mulai = 0, awal = 0, aktifGeser = false;
    el.addEventListener('pointerdown', function (e) {
      aktifGeser = true; el.classList.add('aktif'); el.setPointerCapture(e.pointerId);
      mulai = e.clientX; awal = el.getBoundingClientRect().left;
      document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    });
    el.addEventListener('pointermove', function (e) {
      if (!aktifGeser) return;
      var d = e.clientX - mulai;
      if (jenis === 'rail') {
        var w = Math.max(210, Math.min(430, awal + d));
        SET.railW = w + 'px';
      } else {
        var w2 = Math.max(320, Math.min(window.innerWidth - 420, window.innerWidth - (awal + d)));
        SET.workW = w2 + 'px';
      }
      terapkanSet();
    });
    var selesai = function () {
      if (!aktifGeser) return;
      aktifGeser = false; el.classList.remove('aktif'); simpanSet();
      document.body.style.cursor = ''; document.body.style.userSelect = '';
    };
    el.addEventListener('pointerup', selesai);
    el.addEventListener('pointercancel', selesai);
    el.addEventListener('dblclick', function () {
      if (jenis === 'rail') SET.railW = null; else SET.workW = null;   /* otomatis: ikut ukuran layar */
      terapkanSet(); simpanSet();
      toast('Lebar panel dikembalikan ke otomatis');
    });
    el.addEventListener('keydown', function (e) {
      var naik = e.key === 'ArrowRight', turun = e.key === 'ArrowLeft';
      if (!naik && !turun) return;
      e.preventDefault();
      if (jenis === 'rail') {
        var wRail = SET.railW ? parseInt(SET.railW, 10) : document.querySelector('.rail').getBoundingClientRect().width;
        SET.railW = Math.max(210, Math.min(430, wRail + (naik ? 16 : -16))) + 'px';
      } else {
        var wKerja = SET.workW ? parseInt(SET.workW, 10) : document.querySelector('.work').getBoundingClientRect().width;
        SET.workW = Math.max(320, Math.min(window.innerWidth - 420, wKerja + (turun ? 16 : -16))) + 'px';
      }
      terapkanSet(); simpanSet();
    });
  }
  pasangGeser($('splitL'), 'rail');
  pasangGeser($('splitR'), 'kerja');

  /* ── 14. Status server ────────────────────────────────────────────── */
  function cekServer() {
    var st = $('stat'), tx = $('statTx');
    fetch('/api/health').then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok && j.keyConfigured) { st.className = 'stat ok'; tx.textContent = 'server AI siap'; }
      else if (j && j.ok) { st.className = 'stat warn'; tx.textContent = 'kunci AI belum dipasang'; }
      else { st.className = 'stat warn'; tx.textContent = 'server menjawab tidak biasa'; }
    }).catch(function () {
      st.className = 'stat err'; tx.textContent = 'server tidak terjangkau (cek /api)';
    });
  }

  /* ── 15. Pintasan keyboard & tombol panel ─────────────────────────── */
  $('btnRailHide').addEventListener('click', function () { document.body.classList.toggle('tanpa-rel'); });
  /* tombol di bilah atas: di layar kecil membuka panel geser, di desktop
     menyembunyikan/menampilkan kolom riwayat (jadi selalu ada jalan kembali) */
  $('btnRailShow').addEventListener('click', function () {
    if (window.innerWidth <= 900) { document.body.classList.toggle('rel-terbuka'); this.classList.toggle('on', document.body.classList.contains('rel-terbuka')); return; }
    document.body.classList.toggle('tanpa-rel');
    this.classList.toggle('on', !document.body.classList.contains('tanpa-rel'));
  });
  document.addEventListener('click', function (e) {
    if (document.body.classList.contains('rel-terbuka') && !e.target.closest('.rail') && !e.target.closest('#btnRailShow')) document.body.classList.remove('rel-terbuka');
  });
  document.addEventListener('keydown', function (e) {
    var meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === 'k') { e.preventDefault(); $('q').focus(); }
    else if (meta && e.key.toLowerCase() === 'b') { e.preventDefault(); document.body.classList.toggle('tanpa-rel'); }
    else if (meta && e.key.toLowerCase() === 'j') { e.preventDefault(); bukaKerja(document.body.classList.contains('tanpa-kerja')); }
    else if (e.key === 'Escape') {
      if (!$('setModal').hidden) $('setModal').hidden = true;
      else if (!$('modeModal').hidden) $('modeModal').hidden = true;
      else if (sedangJalan && kendali) kendali.abort();
    }
  });

  /* ── 16. Nyalakan ─────────────────────────────────────────────────── */
  function mulai() {
    terapkanSet();
    perbaruiKirim();
    gambarProyek();
    if (!sesi.length) sesiBaru(); else bukaSesi(sesi[0].id);
    perbaruiTab(); gambarKerja();
    $('artCount').textContent = (sesiAktif() && sesiAktif().artifacts.length) || 0;
    cekServer();
    cekTugas();                              /* tugas yang sudah lewat waktunya */
    setInterval(cekTugas, 20000);            /* periksa tiap 20 detik selama halaman terbuka */
    if (window.speechSynthesis) { speechSynthesis.onvoiceschanged = function () { if (!$('setModal').hidden) isiSetelan(); }; }
    if (window.innerWidth <= 900) { document.body.classList.add('tanpa-kerja'); SET.kerjaTerbuka = false; }
    ta.focus();
  }

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
    if (b === 'js' || b === 'mjs' || b === 'javascript') {
      /* kode pengguna dibungkus eval supaya galat sintaks pun tertangkap, bukan diam-diam gagal */
      var sumber = JSON.stringify(String(kode)).replace(/<\//g, '<\\/');
      return '<!doctype html><html><body style="font:14px ui-monospace,monospace;background:#0f1117;color:#e6e8ee;padding:16px">'
        + '<div id="keluaran"></div>'
        + '<' + 'script>'
        + 'var k=document.getElementById("keluaran");'
        + 'function kirim(){try{parent.postMessage({jenis:"vcs-jalan",keluaran:k.textContent},"*")}catch(e){}}'
        + 'function tulis(x,w){var p=document.createElement("pre");if(w)p.style.color=w;p.textContent=typeof x==="string"?x:String(x);k.appendChild(p);kirim();}'
        + 'var log=console.log,galatLog=console.error,peringatanLog=console.warn;'
        + 'function rapikan(a){return Array.prototype.map.call(a,function(x){try{return typeof x==="object"?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(" ")}'
        + 'console.log=function(){tulis(rapikan(arguments));log.apply(console,arguments)};'
        + 'console.error=function(){tulis(rapikan(arguments),"#ff6b6b");galatLog.apply(console,arguments)};'
        + 'console.warn=function(){tulis(rapikan(arguments),"#ffd479");peringatanLog.apply(console,arguments)};'
        + 'window.onerror=function(m){tulis("Galat: "+m,"#ff6b6b")};'
        + '<' + '/script>'
        + '<' + 'script>try{(0,eval)(' + sumber + ')}catch(e){tulis("Galat: "+((e&&e.message)||e),"#ff6b6b")}'
        + 'if(!k.textContent.trim())tulis("(kode selesai tanpa keluaran)");'
        + 'try{parent.postMessage({jenis:"vcs-jalan",keluaran:k.textContent,selesai:true},"*")}catch(e){}'
        + '<' + '/script>'
        + '</body></html>';
    }
    return kode;
  }
  function jalankanKode(kode, bahasa) {
    /* panel "Keluaran": hasil dari iframe kotak pasir dikirim lewat postMessage
       (iframe sengaja TANPA allow-same-origin, jadi induk tidak boleh menyentuh DOM-nya) */
    if (!window.__vcsKeluar) {
      window.__vcsKeluar = true;
      window.addEventListener('message', function (ev) {
        var d = ev && ev.data;
        if (!d || d.jenis !== 'vcs-jalan') return;
        var kotak = document.getElementById('runOut');
        if (!kotak) return;
        kotak.hidden = false;
        kotak.textContent = String(d.keluaran || '').trim() || '(tidak ada keluaran)';
      });
    }
    var dok = dokumenJalan(kode, bahasa);
    var bingkai = $('runFrame');
    var keluar = document.getElementById('runOut');
    if (!keluar) {
      keluar = document.createElement('div');
      keluar.id = 'runOut'; keluar.className = 'run-out';
      bingkai.parentNode.insertBefore(keluar, bingkai.nextSibling);
    }
    keluar.hidden = true; keluar.textContent = keluar.innerHTML = '';
    bingkai.srcdoc = dok;
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
    toast('Pesan dihapus');
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
  function letakkanMenuPlus() {
    var m = $('menuPlus'), b = $('btnPlus').getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(b.left, innerWidth - m.offsetWidth - 8)) + 'px';
    var tinggi = m.offsetHeight;
    if (b.top - tinggi - 10 < 8) {
      /* tidak cukup ruang di atas → tampilkan di bawah kotak tulis */
      m.classList.add('atas');
      m.style.top = Math.min(innerHeight - tinggi - 8, b.bottom + 10) + 'px';
      m.style.bottom = 'auto';
    } else {
      m.classList.remove('atas');
      m.style.bottom = (innerHeight - b.top + 10) + 'px';
      m.style.top = 'auto';
    }
  }
  $('btnPlus').addEventListener('click', function (e) {
    e.stopPropagation();
    var m = $('menuPlus');
    m.hidden = !m.hidden;
    $('btnPlus').classList.toggle('on', !m.hidden);
    if (!m.hidden) { pasangSakelarMenu(); letakkanMenuPlus(); }
  });
  window.addEventListener('resize', function () { if (!$('menuPlus').hidden) letakkanMenuPlus(); });
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
    else if (aksi === 'gambar') { bukaStudioGambar(ta.value.trim()); }
    else if (aksi === 'belajar') {
      ta.value = 'Jelaskan bertahap untuk pemula, lalu beri 3 pertanyaan kuis singkat dengan jawabannya: ';
      ta.focus(); perbaruiKirim();
      catat('sistem', 'Mode belajar: penjelasan bertahap + kuis singkat.');
    }
    else if (aksi === 'builder') {
      location.hash = '#/builder';
      toast('Halaman AI Builder dibuka — tulis perintah bahasamu');
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
        + '<button class="ib sm" data-libubah="' + a.id + '" title="Ganti nama">' + ic('square-pen', 15) + '</button>'
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
    var ubah = e.target.closest('[data-libubah]');
    if (ubah) { ubahNamaBerkas(ubah.dataset.libubah); return; }
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
    if (hps) { hapusBerkasPustaka(hps.dataset.libhapus); return; }
    var kartu = e.target.closest('[data-lib]');
    if (kartu) pratinjauBerkas(kartu.dataset.lib);
  });
  function ubahNamaBerkas(id) {
    var a = cariArtefak(id); if (!a) return;
    var baru = prompt('Nama baru untuk berkas ini:', a.nama);
    if (baru === null) return;
    baru = baru.trim().slice(0, 90);
    if (!baru) { toast('Nama tidak boleh kosong', 'err'); return; }
    a.nama = baru;
    simpanSet(); simpanSesi(); gambarPerpus();
    if (!$('libPrev').hidden) pratinjauBerkas(id);
    toast('Nama berkas diubah', 'ok');
  }
  function hapusBerkasPustaka(id) {
    if (!confirm('Hapus berkas ini dari pustaka?')) return;
    SET.berkas = SET.berkas.filter(function (x) { return x.id !== id; });
    sesi.forEach(function (s) { s.artifacts = (s.artifacts || []).filter(function (x) { return x.id !== id; }); });
    simpanSet(); simpanSesi(); gambarPerpus();
    if (!$('libPrev').hidden) $('libPrev').hidden = true;
    toast('Berkas dihapus');
  }
  function pratinjauBerkas(id) {
    var a = cariArtefak(id); if (!a) return;
    var isi = String(a.kode || '');
    $('libPrevNama').textContent = a.nama;
    var jenis = String(a.jenis || '').toLowerCase();
    if (jenis === 'html' || jenis === 'htm') {
      var risikoL = bgnRisiko({ berkas: [{ path: a.nama || 'berkas.html', isi: isi }] });
      if (risikoL.length) {
        prevTahan = { src: isi, nama: a.nama, tempat: 'pustaka' };
        $('libPrevIsi').innerHTML = '<div class="pratinjau-tahan">' + kartuTahanHtml(risikoL) + '</div>';
      } else {
        prevTahan = null;
        $('libPrevIsi').innerHTML = '<iframe class="prev-frame" sandbox="allow-scripts" srcdoc="' + esc(isi) + '"></iframe>';
      }
    }
    else if (jenis === 'svg') $('libPrevIsi').innerHTML = '<div class="prev-svg">' + isi + '</div>';
    else if (/^(png|jpg|jpeg|gif|webp|bmp|ico)$/.test(jenis) && /^data:image/.test(isi)) $('libPrevIsi').innerHTML = '<img src="' + isi + '" alt="">';
    else $('libPrevIsi').innerHTML = '<pre class="prev-teks">' + esc(isi.slice(0, 20000)) + '</pre>';
    var m = metaBerkas(a);
    $('libPrevIsi').insertAdjacentHTML('afterbegin', '<div class="prev-meta">'
      + '<span>' + esc(m.jenis) + '</span><span>' + esc(m.ukuran) + '</span><span>' + esc(m.pemilik) + '</span>'
      + '<span>' + esc(m.tanggal) + '</span><span>Proyek: ' + esc(m.proyek) + '</span>'
      + (m.tag.length ? '<span>' + m.tag.map(function (t) { return '#' + esc(t); }).join(' ') + '</span>' : '') + '</div>');
    $('libPrevIsi').insertAdjacentHTML('beforeend', '<div class="prev-aksi">'
      + '<button class="kb-btn" data-prevubah="' + a.id + '">' + ic('square-pen', 15) + '<span>Ganti nama</span></button>'
      + '<button class="kb-btn" data-prevpakai="' + a.id + '">' + ic('corner-down-left', 15) + '<span>Ke percakapan</span></button>'
      + '<button class="kb-btn" data-prevdl="' + a.id + '">' + ic('download', 15) + '<span>Unduh</span></button>'
      + '<button class="kb-btn" data-prevhapus="' + a.id + '">' + ic('trash', 15) + '<span>Hapus</span></button>'
      + '</div>');
    $('libPrev').hidden = false;
  }
  $('libPrevIsi').addEventListener('click', function (e) {
    var u = e.target.closest('[data-prevubah]'); if (u) { ubahNamaBerkas(u.dataset.prevubah); return; }
    var k = e.target.closest('[data-prevpakai]');
    if (k) { var a = cariArtefak(k.dataset.prevpakai); if (a) { pakaiDiPercakapan(a); $('libPrev').hidden = true; } return; }
    var d = e.target.closest('[data-prevdl]'); if (d) { var a2 = cariArtefak(d.dataset.prevdl); if (a2) unduhBerkas(a2); return; }
    var h = e.target.closest('[data-prevhapus]'); if (h) hapusBerkasPustaka(h.dataset.prevhapus);
  });

  /* ── 17j. pintasan tambahan ──────────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    var a = e.altKey;
    if (a && e.key.toLowerCase() === 'k') { e.preventDefault(); $('btnPlus').click(); }
    else if (a && e.key.toLowerCase() === 'l') { e.preventDefault(); location.hash = location.hash === '#/library' ? '#/' : '#/library'; }
    else if (a && e.key.toLowerCase() === 'c') { e.preventDefault(); bukaKamera(); }
  });

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
    if (typeof h.pasang === 'function') h.pasang();
  }
  HAL.builder = { judul: 'AI Builder', sub: 'membangun website & aplikasi dari perintah bahasa', gambar: function () { return ''; } };

  var RUTE = { builder: 1, projects: 1, scheduled: 1, settings: 1, admin: 1, plugins: 1, share: 1 };
  function ruteHalaman() {
    var h = String(location.hash || '');
    var dariHash = h.match(/^#\/([a-z]+)/i);
    var dariJalur = String(location.pathname || '').match(/^\/([a-z]+)\/?$/i);
    var nama = (dariHash && dariHash[1]) || (dariJalur && dariJalur[1]) || '';
    nama = nama.toLowerCase();
    if (nama === 'library') { tampilHalaman(null); rutePerpus(); return; }   /* pustaka punya halamannya sendiri */
    if (nama === 'bagi' || /^#\/bagi=/.test(h)) {
      if (/^#\/bagi=/.test(h) && !(HAL.share && false)) { tampilHalaman('share'); return; }
    }
    if (RUTE[nama]) { tampilHalaman(nama); return; }
    tampilHalaman(null);
  }
  window.addEventListener('hashchange', ruteHalaman);
  $('halKembali').addEventListener('click', function (e) {
    e.preventDefault();
    if (/^\/(builder|projects|scheduled|settings|admin|plugins|share)\/?$/.test(location.pathname)) { location.href = '/'; return; }
    location.hash = '#/';
  });

  var sudahPasang = {};
  function sekali(kunci, fn) { if (sudahPasang[kunci]) return; sudahPasang[kunci] = true; fn(); }

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
  /* ── model AI: pilihan pengguna per mode (Setelan → Model AI) ─────── */
  /* Cadangan nama model (dipakai hanya bila daftar dari server belum termuat).
     Daftar sungguhan datang dari 9Router lewat GET /api/chat. */
  var MODEL_PILIHAN_BAWAAN = [
    ['kr/claude-haiku-4.5', 'Claude Haiku 4.5 — paling cepat'],
    ['kr/claude-sonnet-4.5', 'Claude Sonnet 4.5 — paling teliti'],
    ['kr/claude-sonnet-4.5-agentic', 'Claude Sonnet 4.5 Agentic — tugas panjang'],
    ['kr/auto', 'Kiro Auto — dipilih otomatis'],
    ['FreeTiers', 'FreeTiers — gabungan model gratis'],
  ];
  /* ── tampilan bagian "Penyedia AI" di Pengaturan ── */
  function penyediaTerpilih() {
    if (SET.penyediaSet && SET.penyediaSet.provider) return SET.penyediaSet.provider;
    var dariServer = (SET.penyedia && SET.penyedia.penyedia) ? String(SET.penyedia.penyedia).toLowerCase() : '';
    return PRESET_PENYEDIA[dariServer] ? dariServer : '9router';
  }
  function opsiProv() {
    var kini = penyediaTerpilih();
    return Object.keys(PRESET_PENYEDIA).map(function (k) {
      return '<option value="' + esc(k) + '"' + (k === kini ? ' selected' : '') + '>' + esc(PRESET_PENYEDIA[k].label) + '</option>';
    }).join('');
  }
  function opsiGaya() {
    var kini = (SET.penyediaSet && SET.penyediaSet.gaya) || (PRESET_PENYEDIA[penyediaTerpilih()] || {}).gaya || 'openai';
    var pilihan = [['openai', 'OpenAI (/chat/completions)'], ['gemini', 'Google asli (/v1beta generateContent)']];
    return pilihan.map(function (x) {
      return '<option value="' + x[0] + '"' + (x[0] === kini ? ' selected' : '') + '>' + esc(x[1]) + '</option>';
    }).join('');
  }
  function opsiImgProv() {
    var kini = (SET.penyediaSet && SET.penyediaSet.gambar && SET.penyediaSet.gambar.provider) || '';
    var pilihan = [['', 'Gratis bawaan (Pollinations, tanpa kunci)'], ['cloudflare', 'Cloudflare Workers AI (FLUX)'], ['gemini', 'Google Gemini (jika kuotanya ada)'], ['off', 'Matikan pembuat gambar']];
    return pilihan.map(function (x) {
      return '<option value="' + x[0] + '"' + (x[0] === kini ? ' selected' : '') + '>' + esc(x[1]) + '</option>';
    }).join('');
  }
  function daftarModelUI() {
    var ps = SET.penyediaSet || {};
    var p = PRESET_PENYEDIA[ps.provider] || {};
    var daftar = (ps.daftar && ps.daftar.length) ? ps.daftar : ((SET.modelServer && SET.modelServer.semua) || []);
    /* daftar bawaan Apinex: 6 model yang diminta */
    if (!daftar.length && ps.provider === 'apinex') {
      daftar = ['free/gpt-6-luna', 'free/glm-5.3-flash', 'free/deepseek-v4.1-flash', 'free/deepseek-v4-pro-0813', 'free/mimo-v2.6-pro', 'free/minimax-m3.1'];
    }
    return daftar.slice(0, 200);
  }
  function opsiModelPenyedia(fitur) {
    var ps = SET.penyediaSet || {};
    var terpilih = (ps.model && ps.model[fitur]) || '';
    var daftar = daftarModelUI();
    return '<option value="">(bawaan penyedia)</option>' + daftar.map(function (m) {
      return '<option value="' + esc(m) + '"' + (String(m) === String(terpilih) ? ' selected' : '') + '>' + esc(m) + '</option>';
    }).join('');
  }
  function statusPenyedia() {
    if (!SET.penyediaSet || (!SET.penyediaSet.provider && !SET.penyediaSet.base)) return 'memakai penyedia server (env)';
    var jml = (SET.penyediaSet.daftar && SET.penyediaSet.daftar.length) || 0;
    return 'aktif: ' + ((PRESET_PENYEDIA[SET.penyediaSet.provider] || {}).label || SET.penyediaSet.provider || 'kustom')
      + (jml ? ' · ' + jml + ' model terbaca' : '') + (SET.penyediaSet.kunci ? ' · kunci tersimpan di browser' : ' · tanpa kunci');
  }

  function pasangBagianPenyedia() {
    var prov = $('penProv');
    var url = $('penUrl');
    if (prov) prov.addEventListener('change', function () {
      var p = PRESET_PENYEDIA[prov.value] || {};
      if (url && p.url) url.value = p.url;
      var g = $('penGaya'); if (g && p.gaya) g.value = p.gaya;
      toast((p.label || prov.value) + ' dipilih — tekan "Uji & Aktifkan" untuk memakainya', 'info');
    });
    var act = $('penAct');
    if (act) act.addEventListener('click', function () {
      var provider = prov ? prov.value : 'kustom';
      var base = url ? String(url.value || '').trim() : '';
      var kunci = ($('penKunci') || {}).value || '';
      var gaya = ($('penGaya') || {}).value || '';
      var st = $('penStatus');
      if (!base) { toast('Isi alamat (base URL) penyedia dulu', 'warn'); return; }
      act.disabled = true;
      if (st) st.textContent = 'menguji…';
      toast('Menguji penyedia & kunci…');
      fetch('/api/providers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider, base: base, kunci: kunci, gaya: gaya, uji: true })
      }).then(function (r) { return r.json(); }).then(function (j) {
        act.disabled = false;
        if (!j || !j.ok) {
          var pesan = (j && j.pesan) ? String(j.pesan).slice(0, 120) : 'penyedia menolak';
          if (st) st.textContent = 'gagal: ' + pesan;
          toast('Gagal mengaktifkan: ' + pesan, 'err');
          return;
        }
        var lama = SET.penyediaSet || {};
        SET.penyediaSet = {
          provider: provider, base: j.alamat || base, kunci: kunci, gaya: j.protokol || gaya || 'openai',
          daftar: (j.model || []).slice(0, 200),
          model: lama.model || {}, gambar: lama.gambar || {},
        };
        simpanSet();
        ['fast', 'think', 'deep', 'expert', 'visi', 'pembangun'].forEach(function (f) {
          var el = $('penM_' + f);
          if (el) el.innerHTML = opsiModelPenyedia(f);
        });
        if (st) st.textContent = statusPenyedia() + ' · ' + (j.uji && j.uji.jawaban ? 'uji jawab: ' + String(j.uji.jawaban).slice(0, 30) : 'siap');
        toast('Penyedia aktif: ' + (j.label || provider) + ' (' + (j.model || []).length + ' model)', 'ok');
        muatModelServer();
      }).catch(function (e) {
        act.disabled = false;
        if (st) st.textContent = 'gagal menghubungi server';
        toast('Tidak bisa menghubungi server: ' + (e && e.message ? e.message : e), 'err');
      });
    });
    var off = $('penOff');
    if (off) off.addEventListener('click', function () {
      SET.penyediaSet = null;
      SET.modelServer = null;
      simpanSet();
      var st = $('penStatus'); if (st) st.textContent = statusPenyedia();
      ['fast', 'think', 'deep', 'expert', 'visi', 'pembangun'].forEach(function (f) {
        var el = $('penM_' + f); if (el) el.innerHTML = opsiModelPenyedia(f);
      });
      toast('Kembali memakai penyedia server (env hosting)', 'info');
      muatModelServer();
    });
    ['fast', 'think', 'deep', 'expert', 'visi', 'pembangun'].forEach(function (f) {
      var el = $('penM_' + f);
      if (!el) return;
      el.addEventListener('change', function () {
        SET.penyediaSet = SET.penyediaSet || { provider: penyediaTerpilih(), model: {} };
        SET.penyediaSet.model = SET.penyediaSet.model || {};
        if (el.value) SET.penyediaSet.model[f] = el.value; else delete SET.penyediaSet.model[f];
        simpanSet();
        toast('Model ' + f + ': ' + (el.value || 'bawaan penyedia'), 'ok');
      });
    });
    var ip = $('penImgProv');
    if (ip) ip.addEventListener('change', function () {
      SET.penyediaSet = SET.penyediaSet || { provider: penyediaTerpilih(), model: {} };
      SET.penyediaSet.gambar = SET.penyediaSet.gambar || {};
      SET.penyediaSet.gambar.provider = ip.value || '';
      simpanSet();
      toast('Pembuat gambar: ' + (ip.value || 'gratis bawaan (Pollinations)'), 'ok');
    });
  }

  function modelUntukMode(m) { return (SET.mPilih && SET.mPilih[m]) || ''; }
  function labelMode(m) {
    var pilih = modelUntukMode(m);
    return pilih ? labelModel(pilih) || pilih : MODE[m].model;
  }
  function labelModel(id) {
    var d = MODEL_PILIHAN_BAWAAN.filter(function (x) { return x[0] === id; })[0];
    return d ? d[1] : '';
  }
  /* Daftar model untuk bilah obrolan:
     1) daftar dari penyedia yang aktif (GET /api/chat → daftarModel), lalu
     2) daftar dari penyedia yang kamu aktifkan sendiri di Pengaturan, lalu
     3) daftar bawaan. Jadi begitu Apinex aktif, yang tampil 6 model Apinex. */
  function daftarPilihanModel() {
    var ms = (SET.modelServer && SET.modelServer.semua) || null;
    if (ms && ms.length) return ms;
    var ps = SET.penyediaSet;
    if (ps && ps.daftar && ps.daftar.length) return ps.daftar.map(function (m) { return [m, m]; });
    return MODEL_PILIHAN_BAWAAN;
  }
  function opsiModel(terpilih) {
    var daftar = daftarPilihanModel();
    return '<option value="">(bawaan penyedia)</option>' + daftar.map(function (d) {
      return '<option value="' + esc(d[0]) + '"' + (String(d[0]) === String(terpilih) ? ' selected' : '') + '>' + esc(d[1]) + '</option>';
    }).join('');
  }
  function muatModelServer() {
    return fetch('/api/chat').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok || !j.daftarModel) return;
      var lihat = {}, semua = [['', '(bawaan penyedia)']];
      function tambah(id, ket) {
        if (!id || lihat[id]) return; lihat[id] = 1;
        var label = labelModel(id);
        semua.push([id, label || (id + (ket ? ' — ' + ket : ''))]);
      }
      (j.daftarModel.fast || []).forEach(function (m) { tambah(m, 'kilat'); });
      (j.daftarModel.think || []).forEach(function (m) { tambah(m, 'berpikir'); });
      (j.daftarModel.deep || []).forEach(function (m) { tambah(m, 'mendalam'); });
      (j.daftarModel.expert || []).forEach(function (m) { tambah(m, 'expert'); });
      (j.daftarVisi || []).forEach(function (m) { tambah(m, 'bisa melihat gambar'); });
      (j.modelTambahan || []).forEach(function (m) { tambah(m, 'model tambahanmu'); });
      SET.modelServer = { semua: semua.slice(1), mentah: j };
      if (halKini === 'settings') {
        ['fast', 'think', 'deep', 'expert'].forEach(function (m) {
          var el = document.getElementById('set18M_' + m);
          if (el) el.innerHTML = opsiModel(modelUntukMode(m));
        });
      }
    }).catch(function () { });
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
    return '<div class="mini-it"><span><b>Penyedia teks: ' + esc(t.penyedia || '9router') + '</b>'
      + '<small>' + esc(t.alamat || '') + ' · kunci ' + (t.adaKunci ? 'ada (' + esc(t.kunci || '') + ')' : 'belum ada')
      + (t.modelTetap ? ' · model tetap ' + esc(t.modelTetap) : '') + '</small></span></div>'
      + '<div class="mini-it"><span><b>Pembuat gambar: ' + esc((p.gambar && p.gambar.penyedia) || '(belum diatur)') + '</b>'
      + '<small>' + ((p.gambar && p.gambar.siap) ? 'siap · ' + esc(p.gambar.model) : 'belum aktif — biarkan IMAGE_PROVIDER kosong untuk Pollinations (gratis, tanpa kunci)') + '</small></span></div>'
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
        + '<section class="hal-sec"><h3>' + ic('user', 16) + 'Profil & Akun</h3>'
        + barisSet('Nama panggilan', 'dipakai AI saat menyapa & menyebut kamu', '<input class="inp" id="set18Nama" maxlength="40" placeholder="Contoh: Rian" value="' + esc(SET.nama || '') + '">')
        + barisSet('Bahasaku', 'bahasa yang kupakai untuk berbicara dengan AI', seg18('set18Bahasaku', [['id', 'Indonesia'], ['en', 'English']], SET.bahasa === 'en' ? 'en' : 'id'))
        + barisSet('Peran', 'aplikasi ini tidak punya server akun — tidak ada sandi yang disimpan', '<span class="pill-note">pemilik perangkat</span>')
        + '</section>'

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

        + '<section class="hal-sec"><h3>' + ic('globe', 16) + 'Bahasa & Wilayah</h3>'
        + barisSet('Bahasa jawaban AI', 'dikirim sebagai instruksi ke model', seg18('set18Bahasa', [['id', 'Indonesia'], ['en', 'English']], SET.bahasa === 'en' ? 'en' : 'id'))
        + barisSet('Format tanggal', 'dipakai di riwayat & tugas', seg18('set18Tanggal', [['id', 'Indonesia (18 Sep 2026)'], ['en', 'Inggris (18 Sep 2026)']], SET.tanggal === 'en' ? 'en' : 'id'))
        + barisSet('Zona waktu', 'patokan jadwal tugas & jam WIB', '<select class="sel" id="set18Zona">' + ZONA.map(function (z) { return '<option' + (SET.zona === z ? ' selected' : '') + '>' + z + '</option>'; }).join('') + '</select>')
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

        + '<section class="hal-sec"><h3>' + ic('plug', 16) + 'Penyedia AI</h3>'
        + '<p class="note">Pilih penyedia, tempel <b>alamat</b> dan <b>API key</b>-nya, lalu tekan <b>Uji &amp; Aktifkan</b> — AI langsung hidup memakai penyedia itu, tanpa mengubah berkas atau hosting. Kunci disimpan <b>di browser ini saja</b> dan ikut pada setiap permintaan ke server <i>hanya saat dipakai</i>; server tidak menyimpannya. Penyedia aktif sekarang: <b>' + esc(labelPenyediaAktif()) + '</b></p>'
        + barisSet('Penyedia', 'daftar siap pakai — pilih lalu isi kuncinya', '<select class="sel" id="penProv">' + opsiProv() + '</select>')
        + barisSet('Alamat (base URL)', 'mis. https://api.apinex.bond/v1', '<input class="inp" id="penUrl" style="min-width:250px" value="' + esc((SET.penyediaSet && SET.penyediaSet.base) || '') + '" placeholder="https://…/v1">')
        + barisSet('API key', 'hanya tersimpan di browser ini', '<input class="inp" id="penKunci" type="password" style="min-width:250px" value="' + esc((SET.penyediaSet && SET.penyediaSet.kunci) || '') + '" placeholder="' + esc((PRESET_PENYEDIA[(SET.penyediaSet && SET.penyediaSet.provider) || 'apinex'] || {}).contoh || '') + '">')
        + barisSet('Protokol', 'sudah otomatis pas untuk tiap penyedia', '<select class="sel" id="penGaya">' + opsiGaya() + '</select>')
        + barisSet('Aktifkan', 'kunci diuji sungguhan + daftar model dimuat', '<div class="img-aksi"><button class="btn" id="penAct">' + ic('zap', 15) + 'Uji &amp; Aktifkan</button><button class="btn" id="penOff">' + ic('rotate-ccw', 15) + 'Kembalikan ke server</button></div>')
        + barisSet('Status', 'hasil uji terakhir', '<span class="pill-note" id="penStatus">' + esc(statusPenyedia()) + '</span>')
        + barisSet('Model Normal (cepat)', 'dipakai mode Normal', '<select class="sel" id="penM_fast">' + opsiModelPenyedia('fast') + '</select>')
        + barisSet('Model Berpikir', 'dipakai mode Berpikir', '<select class="sel" id="penM_think">' + opsiModelPenyedia('think') + '</select>')
        + barisSet('Model Berpikir Mendalam', 'dipakai mode Mendalam', '<select class="sel" id="penM_deep">' + opsiModelPenyedia('deep') + '</select>')
        + barisSet('Model Expert', 'dipakai mode Expert', '<select class="sel" id="penM_expert">' + opsiModelPenyedia('expert') + '</select>')
        + barisSet('Model lihat foto', 'dipakai saat kamu kirim gambar', '<select class="sel" id="penM_visi">' + opsiModelPenyedia('visi') + '</select>')
        + barisSet('Model Builder', 'dipakai halaman Builder', '<select class="sel" id="penM_pembangun">' + opsiModelPenyedia('pembangun') + '</select>')
        + barisSet('Pembuat gambar', 'kosongkan = Pollinations gratis tanpa kunci', '<select class="sel" id="penImgProv">' + opsiImgProv() + '</select>')
        + '</section>'

        + '<section class="hal-sec"><h3>' + ic('cpu', 16) + 'Model AI</h3>'
        + '<p class="note">Model per mode berpikir bisa kamu ganti sendiri. Daftar ini diambil dari server (<code>GET /api/chat</code>), dan server mengambilnya dari penyedia yang aktif (<code>GET /v1/models</code>) — jadi yang tampil hanya model yang benar-benar tersedia untukmu. Penyedia yang dipakai sekarang: <b>' + esc(labelPenyediaAktif()) + '</b> · kalau diatur dari halaman Pengaturan, kuncinya hidup di browser ini (<code>localStorage</code>) dan tidak disimpan server; kalau tidak diatur, server memakai env <code>AI_API_KEY</code>/<code>APINEX_API_KEY</code>/<code>GEMINI_API_KEY</code>. Batas jumlah & tarif mengikuti paket akunmu di penyedia itu.</p>'
        + barisSet('Normal', MODE.fast.ket, '<select class="sel" id="set18M_fast">' + opsiModel(modelUntukMode('fast')) + '</select>')
        + barisSet('Berpikir', MODE.think.ket, '<select class="sel" id="set18M_think">' + opsiModel(modelUntukMode('think')) + '</select>')
        + barisSet('Berpikir Mendalam', MODE.deep.ket, '<select class="sel" id="set18M_deep">' + opsiModel(modelUntukMode('deep')) + '</select>')
        + barisSet('Expert (tambahan)', MODE.expert.ket, '<select class="sel" id="set18M_expert">' + opsiModel(modelUntukMode('expert')) + '</select>')
        + barisSet('Penyedia teks aktif', 'hanya status yang tampil — kunci tidak pernah ke browser', '<span class="pill-note">' + esc(labelPenyedia()) + '</span>')
        + barisSet('Uji koneksi', 'memanggil GET /api/chat tanpa memakai kuota', '<button class="btn" id="set18UjiModel">' + ic('activity', 15) + 'Uji koneksi</button>')
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
        + barisSet('Pemakaian hari ini', ringkasKuota(),
          '<button class="btn" id="set18Pakai">' + ic('refresh-cw', 15) + 'Muat ulang status</button>')
        + '</section>'

        + '<section class="hal-sec"><h3>' + ic('info', 16) + 'Tentang</h3>'
        + '<p class="note">Van Chat.SPY — ruang kerja AI satu halaman. Semua uji tampilan memakai Chromium sungguhan; daftar per butir ada di <b>PESAN-BERKAS-8-14.md</b> dan <b>BUTIR-15-53.md</b>. Riwayat, berkas, memori, dan setelan hidup di browser ini.</p>'
        + '</section>';
    },
    pasang: function () { pasangSetelan(); pasangBagianPenyedia(); muatModelServer(); }
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

    /* Profil & Akun */
    var nm = $('set18Nama');
    if (nm) nm.addEventListener('change', function () {
      SET.nama = nm.value.trim().slice(0, 40); simpanSet();
      toast(SET.nama ? 'Nama disimpan: ' + SET.nama : 'Nama dihapus', 'ok');
    });
    seg18Pasang('set18Bahasaku', function (v) { SET.bahasa = v; simpanSet(); toast(v === 'en' ? 'Bahasa: English' : 'Bahasa: Indonesia'); });

    /* Bahasa & Wilayah */
    seg18Pasang('set18Bahasa', function (v) { SET.bahasa = v; simpanSet(); toast('Bahasa jawaban AI: ' + (v === 'en' ? 'English' : 'Indonesia')); });
    seg18Pasang('set18Tanggal', function (v) { SET.tanggal = v; simpanSet(); });
    var zn = $('set18Zona');
    if (zn) zn.addEventListener('change', function () { SET.zona = zn.value; simpanSet(); toast('Zona waktu: ' + SET.zona); });

    /* Model AI per mode */
    ['fast', 'think', 'deep', 'expert'].forEach(function (m) {
      var el = $('set18M_' + m);
      if (!el) return;
      el.addEventListener('change', function () {
        SET.mPilih = SET.mPilih || {};
        if (el.value) SET.mPilih[m] = el.value; else delete SET.mPilih[m];
        simpanSet();
        var d = el.options[el.selectedIndex];
        toast('Model ' + MODE[m].label + ': ' + (el.value ? d.textContent.trim() : 'bawaan penyedia'), 'ok');
      });
    });
    var um = $('set18UjiModel');
    if (um) um.addEventListener('click', function () {
      toast('Menguji koneksi ke server…');
      fetch('/api/chat').then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ready) { toast('Server menjawab, tetapi kunci AI belum dipasang', 'warn'); return; }
        /* cek sungguhan: satu pertanyaan sangat pendek (1 permintaan kuota) */
        return fetch('/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'ping', mode: 'fast', stream: false })
        }).then(function (r2) { return r2.json(); }).then(function (h) {
          if (h.ok) { tandaKuotaHabis(false); toast('Koneksi AI sehat — model ' + (h.model || j.model || '—') + ' menjawab', 'ok'); }
          else if (h.kuota) { tandaKuotaHabis(true); toast('Terhubung, tetapi batas permintaan penyedia tercapai — coba lagi sebentar', 'warn'); }
          else toast('Terhubung, tetapi AI menjawab: ' + (h.pesan || 'gagal'), 'warn');
        });
      }).catch(function () { toast('Server AI tidak terjangkau', 'err'); });
    });
    sw18('set18Memori', SET.memoriAktif, function (v) { SET.memoriAktif = v; simpanSet(); });
    var suara = $('set18Suara');
    if (suara) suara.addEventListener('change', function () { SET.suara = suara.value; simpanSet(); toast('Suara dipilih'); });
    var notif = $('set18Notif');
    if (notif) notif.addEventListener('click', function () {
      if (!window.Notification) { toast('Browser ini tidak mendukung notifikasi', 'err'); return; }
      Notification.requestPermission().then(function () { toast('Izin notifikasi: ' + Notification.permission, Notification.permission === 'granted' ? 'ok' : 'warn'); });
    });
    sekali('setBody', function () {
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
      sekali('prjBody', function () {
      $('halBody').addEventListener('click', function (e) {
        var c = e.target.closest('[data-prj-contoh]');

        if (c) { buatProyek18(c.dataset.prjContoh); return; }
        var a = e.target.closest('[data-prj-aktif]');
        if (a) { SET.proyekAktif = a.dataset.prjAktif; simpanSet(); gambarProyek(); gambarRiwayat(); notaProyek(); tampilHalaman('projects'); toast('Proyek aktif diganti', 'ok'); return; }
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
    simpanSet(); gambarProyek(); gambarRiwayat(); notaProyek();
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
    simpanSet(); gambarProyek(); notaProyek(); tampilHalaman('projects'); toast('Proyek disimpan', 'ok');
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
  function tgsServerTeks(sv) {
    sv = sv || {};
    return sv.ok
      ? 'Penjadwal server aktif — ' + (sv.jumlah || 0) + ' tugas tersimpan di penyimpanan KV.'
      : 'Belum aktif: ' + esc(sv.pesan || 'butuh penyimpanan KV (KV_REST_API_URL + KV_REST_API_TOKEN).') + ' Tanpa itu, tugas berjalan di browser selama halaman ini terbuka — bukan diam-diam diklaim jalan terus.';
  }
  function muatJadwalServer() {
    /* perbarui bagian penjadwal di tempat (tanpa menggambar ulang halaman) supaya
       isian yang sedang diketik tidak hilang dan tidak terjadi putaran tanpa henti */
    fetch('/api/cron').then(function (r) { return r.json(); }).then(function (j) {
      SET.penjadwalServer = j;
      if (halKini !== 'scheduled') return;
      var el = document.getElementById('tgsServerNote');
      if (el) el.innerHTML = tgsServerTeks(j);
      var sub = document.getElementById('halSub');
      if (sub && HAL.scheduled) sub.textContent = HAL.scheduled.sub();
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
        + '<label>Zona waktu<select id="tgsZona" class="sel">' + ZONA.map(function (z) { return '<option' + (SET.zona === z ? ' selected' : '') + '>' + z + '</option>'; }).join('') + '</select></label>'
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
        + '<p class="note" id="tgsServerNote">' + tgsServerTeks(sv) + '</p>'
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
      sekali('tgsBody', function () {
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
    { nama: 'Pembuat Gambar', ikon: 'image', desk: 'Membuat gambar dari prompt (rasio & kualitas). Bawaannya Pollinations — gratis, tanpa kunci (gambar bertanda air); Cloudflare Workers AI (FLUX, tanpa tanda air) bila token diisi.', penyedia: 'Pollinations (bawaan, gratis) · atau IMAGE_PROVIDER + IMAGE_API_KEY', izin: ['jaringan keluar ke penyedia gambar', 'dihitung per kuota penyedia gambar'], endpoint: '/api/image/generate', auth: '(Pollinations: tanpa kunci) IMAGE_API_KEY bila memakai penyedia lain', aksi: ['Generate'] },
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
        + '<div class="mini-it"><span><b>Pemakaian AI hari ini</b><small>' + ((SET.pakai && SET.pakai.jumlah) || 0) + ' permintaan (batas mengikuti paket ' + esc(labelPenyedia()) + ')</small></span></div>'
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
  var penyediaJson = null;
  function muatPenyedia() {
    return fetch('/api/providers').then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok) { SET.penyedia = j; tulis(LS_PENYEDIA, j); }
    }).catch(function () { }).then(function () {
      /* hanya gambar ulang kalau statusnya benar-benar berubah — mencegah putaran
         tanpa henti antara pasang() dan pemuatan penyedia */
      var s = JSON.stringify(SET.penyedia || null);
      if (s === penyediaJson) return;
      penyediaJson = s;
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
    var sumber = [];                 /* dikumpulkan dari semua pertanyaan, dipakai sampai laporan */
    langkah(0, LANGKAH_RISET[0]);
    catat('sistem', 'Riset mendalam dimulai untuk: “' + esc(tanya.slice(0, 80)) + '” — 2 permintaan AI + pencarian multi-penyedia.');
    mintaTeks('Buat 4 pertanyaan riset singkat (masing-masing maksimal 8 kata) untuk mendalami topik berikut. Balas hanya daftar bernomor, tanpa pembuka atau penutup.\n\nTopik: ' + tanya, 'think')
      .then(function (rencana) {
        var daftar = rencana.split('\n').map(function (b) { return b.replace(/^\s*\d+[.)]\s*/, '').trim(); }).filter(function (b) { return b.length > 4; }).slice(0, 4);
        if (!daftar.length) daftar = [tanya];
        langkah(1, LANGKAH_RISET[1] + ' (' + daftar.length + ' pertanyaan)');
        return Promise.all(daftar.map(cariSumberRiset)).then(function (perPertanyaan) {
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
            if (bb) {
              /* jejak langkah tetap terlihat setelah selesai (bukti alur, bukan proses berpikir internal) */
              bb.insertAdjacentHTML('afterbegin', '<b>Riset Mendalam</b><ol class="riset-jejak">'
                + LANGKAH_RISET.map(function (x) { return '<li class="beres">' + esc(x) + '</li>'; }).join('') + '</ol>');
              bb.insertAdjacentHTML('beforeend', blokSumber);
            }
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
      return '<li class="' + (l.s === 'beres' ? 'beres' : l.s === 'siap' ? 'siap' : l.s === 'kini' ? 'kini' : l.s === 'galat' ? 'galat' : '') + '">'
        + '<i>' + (l.s === 'beres' ? '✓' : l.s === 'siap' ? '✓' : l.s === 'galat' ? '!' : (i + 1)) + '</i><span>' + esc(l.t) + '</span></li>';
    }).join('');
  }
  /* ── 19i. editor kode (butir 28) ──────────────────────────────────── */
  var EDITOR_BHS = {
    js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx', ts: 'ts', tsx: 'tsx',
    html: 'html', htm: 'html', svg: 'svg', css: 'css', scss: 'css', json: 'json',
    py: 'python', sql: 'sql', md: 'markdown', sh: 'bash', bash: 'bash',
    go: 'go', java: 'java', c: 'c', php: 'php', txt: 'text', gitignore: 'text', env: 'text'
  };
  function editorBahasa(nama) {
    var ekstensi = String(nama || '').split('.').pop().toLowerCase();
    return EDITOR_BHS[ekstensi] || 'text';
  }
  function editorGambarSorot() {
    var ta = $('editorIsi'), sorot = $('editorSorot'), no = $('editorNo');
    if (!ta || !sorot) return;
    var isi = ta.value;
    var jumlah = isi.split('\n').length;
    if (no) {
      var nomor = [];
      for (var i = 1; i <= jumlah; i++) nomor.push(i);
      no.textContent = nomor.join('\n');
    }
    var bhs = editorBahasa(($('editorJudul') || {}).dataset ? $('editorJudul').dataset.path : '');
    if (isi.length > 200000) {
      /* berkas besar: sorot dimatikan supaya mengetik tetap ringan — ditulis apa adanya */
      sorot.textContent = isi;
      if ($('editorBhs')) $('editorBhs').textContent = bhs.toUpperCase() + ' · sorot mati (berkas besar)';
    } else {
      sorot.innerHTML = warnai(isi, bhs);
      if ($('editorBhs')) $('editorBhs').textContent = bhs.toUpperCase();
    }
    sorot.scrollTop = ta.scrollTop; sorot.scrollLeft = ta.scrollLeft;
    if (no) no.scrollTop = ta.scrollTop;
  }
  function editorPilih(ta, pos, panjang) {
    ta.focus(); ta.setSelectionRange(pos, pos + panjang);
    var barisSebelum = ta.value.slice(0, pos).split('\n').length;
    var lh = parseFloat(window.getComputedStyle(ta).lineHeight) || 20;
    ta.scrollTop = Math.max(0, (barisSebelum - 4) * lh);
    editorGambarSorot();
  }
  function editorCariLagi(diam) {
    var ta = $('editorIsi'), kata = ($('editorCari') || {}).value || '';
    if (!kata) { if (!diam) toast('Isi dulu kata yang dicari', 'warn'); return false; }
    var mulai = ta.selectionEnd || 0, teks = ta.value.toLowerCase(), cari = kata.toLowerCase();
    var pos = teks.indexOf(cari, mulai);
    if (pos < 0) pos = teks.indexOf(cari);
    if (pos < 0) { if (!diam) toast('Tidak ditemukan: ' + kata, 'warn'); return false; }
    editorPilih(ta, pos, kata.length);
    return true;
  }
  function editorGantiSatu() {
    var ta = $('editorIsi'), kata = ($('editorCari') || {}).value || '', ganti = ($('editorGanti') || {}).value || '';
    if (!kata) { toast('Isi dulu kata yang dicari', 'warn'); return; }
    var terpilih = ta.value.substr(ta.selectionStart, kata.length);
    if (terpilih.toLowerCase() !== kata.toLowerCase()) { if (!editorCariLagi(true)) { toast('Tidak ditemukan: ' + kata, 'warn'); return; } return; }
    var pos = ta.selectionStart;
    ta.setRangeText(ganti, pos, pos + kata.length, 'end');
    editorGambarSorot();
    toast('1 penggantian', 'ok');
  }
  function editorGantiSemua() {
    var ta = $('editorIsi'), kata = ($('editorCari') || {}).value || '', ganti = ($('editorGanti') || {}).value || '';
    if (!kata) { toast('Isi dulu kata yang dicari', 'warn'); return; }
    var rx = new RegExp(kata.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    var jumlah = (ta.value.match(rx) || []).length;
    if (!jumlah) { toast('Tidak ditemukan: ' + kata, 'warn'); return; }
    ta.value = ta.value.replace(rx, ganti);
    editorGambarSorot();
    toast(jumlah + ' penggantian selesai', 'ok');
  }
  /* rapikan: indentasi heuristik per jenis berkas (bukan pengganti Prettier) */
  function editorRapikanTeks(teks, bhs) {
    teks = String(teks).replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
    if (bhs === 'json') { try { return JSON.stringify(JSON.parse(teks), null, 2) + '\n'; } catch (e) { return null; } }
    if (bhs === 'python') return teks.replace(/\t/g, '    ');
    if (bhs === 'css') {
      /* satu baris "sel { a:1; b:2; }" dipecah jadi blok bertingkat */
      teks = teks.replace(/([^{}\n]+)\{([^{}]*)\}/g, function (m, sel, isi) {
        var bagian = isi.split(';').map(function (s) { return s.trim(); }).filter(Boolean);
        if (bagian.length < 2) return m;
        return sel.trim() + ' {\n' + bagian.map(function (b2) { return '  ' + b2 + ';'; }).join('\n') + '\n}';
      });
    }
    var baris = teks.split('\n');
    if (bhs === 'html' || bhs === 'xml' || bhs === 'svg') {
      var VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
      var d2 = 0, keluaran2 = [];
      baris.forEach(function (b) {
        var s = b.trim();
        if (!s) { keluaran2.push(''); return; }
        var tutup = /^<\//.test(s);
        if (tutup && d2 > 0) d2--;
        keluaran2.push('  '.repeat(d2) + s);
        var buka = s.match(/^<([a-zA-Z][\w:-]*)/);
        var sendiri = /\/>$/.test(s) || (buka && VOID.test(buka[1]));
        var sebaris = /^<[^>]+>[\s\S]*<\/[a-zA-Z][\w:-]*>$/.test(s);
        if (buka && !tutup && !sendiri && !sebaris && !/^<!/.test(s)) d2++;
      });
      return keluaran2.join('\n');
    }
    if (bhs === 'css' || bhs === 'js' || bhs === 'jsx' || bhs === 'ts' || bhs === 'tsx' || bhs === 'go' || bhs === 'java' || bhs === 'c' || bhs === 'php') {
      var d = 0, keluaran = [];
      baris.forEach(function (b) {
        var s = b.trim();
        if (!s) { keluaran.push(''); return; }
        var buka = (s.match(/[{([]/g) || []).length, tutupJumlah = (s.match(/[})\]]/g) || []).length;
        if (tutupJumlah > buka) d = Math.max(0, d - (tutupJumlah - buka));
        keluaran.push('  '.repeat(d) + s);
        d += Math.max(0, buka - tutupJumlah);
      });
      return keluaran.join('\n');
    }
    return null;
  }
  function editorRapikan() {
    var ta = $('editorIsi');
    var bhs = editorBahasa(($('editorJudul') || {}).dataset ? $('editorJudul').dataset.path : '');
    var hasil = editorRapikanTeks(ta.value, bhs);
    if (hasil === null) { toast('Rapikan belum tersedia untuk jenis berkas ini', 'warn'); return; }
    if (hasil === ta.value) { toast('Sudah rapi', 'ok'); return; }
    ta.value = hasil; editorGambarSorot();
    toast('Indentasi dirapikan — tekan “Lihat diff & simpan” untuk menyimpan', 'ok');
  }
  function pasangEditor() {
    var ta = $('editorIsi'); if (!ta) return;
    ta.addEventListener('input', editorGambarSorot);
    ta.addEventListener('scroll', editorGambarSorot);
    var cl = $('editorCariLagi'); if (cl) cl.addEventListener('click', function () { editorCariLagi(); });
    var g1 = $('editorGantiSatu'); if (g1) g1.addEventListener('click', editorGantiSatu);
    var g2 = $('editorGantiSemua'); if (g2) g2.addEventListener('click', editorGantiSemua);
    var rp = $('editorRapi'); if (rp) rp.addEventListener('click', editorRapikan);
    var sl = $('editorSalin'); if (sl) sl.addEventListener('click', function () { salin(ta.value, null); });
    var un = $('editorUnduh'); if (un) un.addEventListener('click', function () {
      var path = ($('editorJudul') || {}).dataset ? $('editorJudul').dataset.path : '';
      unduh((path || 'berkas.txt').split('/').pop(), ta.value, 'text/plain');
    });
    var cari = $('editorCari');
    if (cari) cari.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); editorCariLagi(); } });
    /* Tab di dalam editor menyisipkan indentasi, bukan pindah fokus */
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var p = ta.selectionStart;
        ta.setRangeText('  ', p, ta.selectionEnd, 'end');
        editorGambarSorot();
      }
    });
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
  /* ── pengaman kotak pasir: kode yang bisa membuat halaman MACET ──────
     Perulangan tanpa henti (while(true) / for(;;)) di dalam pratinjau akan
     membekukan seluruh browser — termasuk aplikasi ini. Karena itu kode
     seperti itu TIDAK dijalankan otomatis: pratinjau ditahan, dan pengguna
     diberi dua pilihan yang aman (tanpa skrip, atau tab terpisah). */
  var POLA_MACET = [
    { rx: /\bwhile\s*\(\s*(true|1)\s*\)/g, nama: 'while(true)' },
    { rx: /\bfor\s*\(\s*;\s*;\s*\)/g, nama: 'for(;;)' },
    { rx: /\bdo\s*\{[\s\S]{0,400}?\}\s*while\s*\(\s*(true|1)\s*\)/g, nama: 'do…while(true)' },
  ];
  function bgnRisiko(b) {
    var temuan = [];
    (b && b.berkas || []).forEach(function (f) {
      if (!/\.(js|mjs|html?)$/i.test(f.path)) return;
      POLA_MACET.forEach(function (p2) {
        var m = String(f.isi || '').match(p2.rx);
        if (!m) return;
        var isi = String(f.isi || '');
        var pos = isi.search(p2.rx);
        var baris = isi.slice(0, pos < 0 ? 0 : pos).split('\n').length;
        temuan.push({ path: f.path, baris: baris, pola: p2.nama, jumlah: m.length });
      });
    });
    return temuan;
  }
  /* ── pratinjau HTML di luar Builder (ruang kerja & Pustaka) ──────────
     Memakai pengaman yang sama: kode berisi perulangan tanpa henti TIDAK
     dijalankan, halaman ditahan, pengguna diberi dua pilihan aman. */
  var prevTahan = null;   /* { src, nama, tempat } berkas yang sedang ditahan */
  function kartuTahanHtml(risiko) {
    var daftar = risiko.map(function (r) { return r.path + ' baris ' + r.baris + ' (' + r.pola + ')'; }).join(', ');
    return '<div class="pratinjau-tahan-tx">' + ic('alert-triangle', 16)
      + '<span><b>Pratinjau ditahan.</b> Berkas ini berisi <b>perulangan tanpa henti</b> — '
      + esc(daftar) + '. Kalau dijalankan, aplikasi bisa membeku dan harus ditutup paksa.</span></div>'
      + '<div class="pratinjau-tahan-aksi">'
      + '<button class="btn" id="prevTanpaSkrip">' + ic('eye', 14) + 'Tampilkan tanpa skrip</button>'
      + '<button class="btn" id="prevTabBaru">' + ic('external-link', 14) + 'Buka di tab baru</button>'
      + '</div>';
  }
  function bgnTanpaSkrip(dokumen) {
    /* buang semua <script> supaya halaman tetap bisa dilihat tanpa risiko macet */
    return String(dokumen)
      .replace(/<script[\s\S]*?<\/script>/gi, '<!-- skrip dilepas oleh pengaman kotak pasir -->')
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
  }
  var bgnPaksa = null;   /* {id, dokumen} saat pengguna memilih tetap menjalankan */
  function bgnRenderPratinjau() {
    var b = bgnAktif(); var kotak = $('bgnPratinjau'); if (!kotak || !b) return;
    var d = bgnDokumen(b, bgnPath && /\.html?$/i.test(bgnPath) ? bgnPath : 'index.html');
    d.catatan.forEach(function (c) { bgnKonsolTambah('warn', c); });
    var risiko = bgnRisiko(b);
    if (risiko.length) {
      var daftar = risiko.map(function (r) { return r.path + ' baris ' + r.baris + ' (' + r.pola + ')'; }).join(', ');
      bgnKonsolTambah('warn', 'Pratinjau ditahan: ditemukan perulangan tanpa henti → ' + daftar + '. Menjalankannya bisa membuat browser membeku.');
      kotak.removeAttribute('src');
      kotak.srcdoc = '<!doctype html><meta charset="utf-8"><style>'
        + 'body{margin:0;font:14px/1.6 system-ui;background:#0b0d13;color:#e7e9ee;padding:22px}'
        + 'b{color:#fa0102}code{background:#1a1a1f;padding:2px 6px;border-radius:6px}'
        + 'button{margin:10px 8px 0 0;padding:9px 14px;border-radius:9px;border:1px solid #333;background:#17171d;color:#e7e9ee;font:inherit;cursor:pointer}'
        + 'button.pr{background:#fa0102;border-color:#fa0102;color:#fff}</style>'
        + '<b>Pratinjau ditahan demi keamanan.</b>'
        + '<p>Kode proyek ini berisi <b>perulangan tanpa henti</b>: ' + esc(daftar) + '. Kalau dijalankan, halaman (dan aplikasi ini) bisa membeku dan harus ditutup paksa.</p>'
        + '<p>Pilihan yang aman:</p>'
        + '<button class="pr" id="bgnAman1">Tampilkan tanpa skrip</button>'
        + '<button id="bgnAman2">Buka di tab baru (skrip jalan di tab terpisah)</button>'
        + '<p style="color:#8b8b96">Minta AI memperbaikinya lewat tombol <b>Perbaiki error</b>, atau sunting berkasnya lalu simpan.</p>'
        + '<script>'
        + 'function kirim(p){try{parent.postMessage({jenis:"vcs-bgn-aman",pilih:p},"*")}catch(e){}}'
        + 'document.getElementById("bgnAman1").onclick=function(){kirim("tanpa-skrip")};'
        + 'document.getElementById("bgnAman2").onclick=function(){kirim("tab")};'
        + '<\/script>';
      bgnStatusBuild('Pratinjau ditahan — kode berisiko macet (' + risiko.length + ' temuan)');
      return;
    }
    kotak.srcdoc = d.dokumen;
    bgnStatusBuild('Pratinjau siap · ' + (b.berkas || []).length + ' berkas · ' + kb(d.dokumen.length) + ' dokumen');
  }
  /* tombol di dalam pratinjau yang ditahan memakai postMessage (iframe kotak pasir) */
  function bgnPratinjauAman(pilihan) {
    var b = bgnAktif(); if (!b) return;
    var d = bgnDokumen(b, bgnPath && /\.html?$/i.test(bgnPath) ? bgnPath : 'index.html');
    if (pilihan === 'tab') {
      var w = window.open('', '_blank');
      if (!w) { toast('Jendela baru diblokir browser', 'err'); return; }
      w.document.write(d.dokumen); w.document.close();
      toast('Dijalankan di tab terpisah — kalau macet, tutup saja tabnya');
      return;
    }
    var kotak = $('bgnPratinjau');
    if (kotak) kotak.srcdoc = bgnTanpaSkrip(d.dokumen);
    bgnKonsolTambah('info', 'Pratinjau ditampilkan tanpa skrip (HTML + CSS saja)');
    bgnStatusBuild('Pratinjau tanpa skrip · ' + (b.berkas || []).length + ' berkas');
    toast('Pratinjau tanpa skrip — tampilan saja', 'ok');
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
          setTimeout(function () {
          var hasil = bgnUjiStatik(b);
          bgnUji = hasil;
          bgnRenderUji();
          bgnTandai(6, hasil.gagal ? 'galat' : 'beres');
          if (hasil.gagal) {
            bgnTandai(7, 'kini'); bgnRenderJejak();
            bgnStatusBuild('Ada ' + hasil.gagal + ' masalah — tekan Perbaiki error untuk meminta AI membetulkan.');
          } else {
            bgnTandai(7, 'beres');
            bgnTandai(8, 'kini');
            bgnStatusBuild('Build: ' + (b.berkas || []).length + ' berkas · ' + kb(JSON.stringify(b.berkas).length) + ' siap');
            bgnTandai(8, 'beres');
            bgnTandai(9, 'siap');
            bgnRenderJejak();
            bgnStatusBuild('Siap deploy — unduh ZIP atau hubungkan penyedia deploy di Pengaturan.');
          }
          catat('sistem', 'AI Builder selesai membuat proyek “' + esc(b.nama) + '” (' + (b.berkas || []).length + ' berkas) dalam ' + ((Date.now() - t0) / 1000).toFixed(1) + ' detik.');
          toast('Proyek “' + b.nama + '” selesai dibangun', 'ok');
          }, 1100);
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
      var risikoF = bgnRisiko({ berkas: [f] });
      if (/\.(js|mjs|html?)$/i.test(f.path) && risikoF.length) {
        hasil.push({ nama: 'tidak ada perulangan tanpa henti: ' + f.path, lolos: false, ket: risikoF.map(function (r) { return 'baris ' + r.baris + ' (' + r.pola + ')'; }).join(', ') + ' — perbaiki dulu sebelum menjalankan' });
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
          + '<p class="note bgn-catatan">Pratinjau berjalan di iframe terisolasi (kotak pasir): kode di dalamnya tidak bisa memanggil API situs ini — browser memblokirnya sebagai lintas-asal. Panggilan seperti itu tetap terlihat di panel Konsol &amp; Jaringan. Untuk menguji API sungguhan, deploy dulu lalu buka di tab baru.</p>'
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
      sekali('bgnBody', function () {
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
      $('editorJudul').dataset.path = bgnPath;
      $('editorIsi').value = String(f.isi || '');
      $('editModal').hidden = false;
      editorGambarSorot();
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
    $('imgStatus').textContent = s && s.siap ? ('siap · ' + (s.penyedia || '') + ' · ' + (s.model || '')) : 'belum aktif — memakai jalur kode SVG (biarkan IMAGE_PROVIDER kosong untuk Pollinations gratis)';
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

    /* tombol halaman & pencarian global */
    document.querySelectorAll('.rail-nav [data-hal]').forEach(function (b) {
      b.addEventListener('click', function () {
        var tujuan = b.dataset.hal;
        if (tujuan === '#/library') { tampilHalaman(null); location.hash = tujuan; rutePerpus(); return; }
        location.hash = tujuan;
      });
    });
    var bp = $('btnPalet'); if (bp) bp.addEventListener('click', bukaPalet);
    var bv = $('btnVoice');
    if (bv) bv.addEventListener('click', function () { $('voiceBar').hidden = !$('voiceBar').hidden; toast('Bar suara: Mulai Voice untuk mulai bicara'); });
    var bb = $('btnBagi'); if (bb) bb.addEventListener('click', function () { $('bagiModal').hidden = false; $('bagiTautan').value = ''; $('bagiSalin').disabled = true; });

    /* diff: Terima / Tolak / Batalkan */
    $('diffTerima').addEventListener('click', function () {
      var f = diffNanti; tutupDiff();
      if (typeof f === 'function') f();
    });
    $('diffTolak').addEventListener('click', function () { tutupDiff(); toast('Perubahan ditolak', 'warn'); });
    $('diffBatal').addEventListener('click', function () { tutupDiff(); toast('Dibatalkan — tidak ada yang diubah'); });
    var es = $('editSimpan');
    if (es) es.addEventListener('click', function () {
      var b = bgnAktif(); if (!b || !bgnPath) { $('editModal').hidden = true; return; }
      var f = bgnBerkas(b, bgnPath);
      var baru = $('editorIsi').value;
      $('editModal').hidden = true;
      bukaDiff('Edit ' + bgnPath, String(f.isi || ''), baru, function () {
        bgnTulis(b, bgnPath, baru); bgnRenderSemua(); bgnRenderPratinjau(); toast('Berkas disimpan', 'ok');
      });
    });

    /* keluaran dari iframe pratinjau builder (sandbox tanpa allow-same-origin) */
    window.addEventListener('message', function (ev) {
      var d = ev && ev.data;
      if (!d || typeof d !== 'object') return;
      if (d.jenis === 'vcs-bgn' && d.t) bgnKonsolTambah(d.t === 'siap' ? 'log' : d.t, d.teks);
      if (d.jenis === 'vcs-bgn-aman' && d.pilih) bgnPratinjauAman(d.pilih);
    });

    /* tombol pada kartu "pratinjau ditahan" (ruang kerja & Pustaka) */
    document.addEventListener('click', function (e) {
      if (!prevTahan) return;
      if (e.target.closest('#prevTanpaSkrip')) {
        var aman = bgnTanpaSkrip(prevTahan.src);
        if (prevTahan.tempat === 'kerja') {
          var fr = $('frame'), k = $('prevTahan');
          if (k) { k.hidden = true; k.innerHTML = ''; }
          if (fr) { fr.hidden = false; fr.srcdoc = aman; }
        } else {
          $('libPrevIsi').innerHTML = '<iframe class="prev-frame" sandbox="allow-scripts"></iframe>';
          var f2 = $('libPrevIsi').querySelector('iframe');
          if (f2) f2.srcdoc = aman;
        }
        toast('Pratinjau tanpa skrip — tampilan saja', 'ok');
        return;
      }
      if (e.target.closest('#prevTabBaru')) {
        var w = window.open('', '_blank');
        if (!w) { toast('Jendela baru diblokir browser', 'err'); return; }
        w.document.write(prevTahan.src); w.document.close();
        toast('Dijalankan di tab terpisah — kalau macet, tutup saja tabnya');
      }
    });

    pasangEditor();
    ruteHalaman();
    muatPenyedia();
    suaraStatus(-1, false);
    if (!SET.bangunan) { SET.bangunan = []; simpanSet(); }
    if (bgnDaftar().length && !bgnAktifId) { bgnAktifId = bgnDaftar()[0].id; }
    /* pilihan model di bilah obrolan mengikuti penyedia yang aktif */
    muatModelServer();
  }

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
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai18); else mulai18();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai); else mulai();
})();
