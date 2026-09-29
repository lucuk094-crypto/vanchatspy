/*
 * uji-tampilan.mjs — uji sungguhan di Chromium (bukan jsdom).
 * Semua tombol diklik dengan tetikus asli (page.mouse.click) dan diperiksa
 * dulu dengan elementFromPoint supaya tidak "kelihatan bisa" padahal tertutup
 * lapisan lain — standar pemeriksaan yang dipakai sejak laporan bug klik.
 *
 *   node tools/uji-tampilan.mjs          (server harus jalan di port 8131)
 *   UJI_URL=… node tools/uji-tampilan.mjs
 *
 * Jawaban AI ditiru (mock SSE) supaya uji bisa jalan walau kuota harian
 * penyedia AI sedang habis. Hubungan ke backend asli diuji di bagian "B".
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/u/package.json');
const puppeteer = require('puppeteer');

const URL_UJI = process.env.UJI_URL || 'http://127.0.0.1:8131/';
const SHOT = process.env.SHOT_DIR || '/home/user/van-chat-spy/bukti-uji';
const DL = process.env.DL_DIR || '/tmp/unduhan-uji';
const AKAR_PROYEK = process.env.AKAR_PROYEK || '/home/user/van-chat-spy';
const CHROME = process.env.CHROME_PATH || '/tmp/pcache/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
fs.mkdirSync(SHOT, { recursive: true });
fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });

const catatan = [];
const tulis = (s) => { console.log(s); catatan.push(s); };

/* ── balasan AI tiruan (SSE) ─────────────────────────────────────────── */
const HTML_UJI = `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kopi Senja</title>
<style>
body{margin:0;font-family:system-ui;background:#0f1115;color:#f2f2f5}
.wrap{max-width:760px;margin:0 auto;padding:48px 20px}
h1{font-size:34px;margin:0 0 8px}span{color:#7c8cff}
.card{display:flex;gap:14px;flex-wrap:wrap;margin-top:26px}
.menu{flex:1 1 200px;border:1px solid #2a2d36;border-radius:16px;padding:16px}
b{display:block;font-size:17px;margin-bottom:4px}
button{margin-top:22px;padding:11px 18px;border:0;border-radius:12px;background:#7c8cff;color:#fff;font-size:15px}
</style></head>
<body><div class="wrap">
<h1>Kopi <span>Senja</span></h1>
<p>Kedai kopi kecil di Surabaya — biji lokal, seduhan manual.</p>
<div class="card"><div class="menu"><b>Kopi Tubruk</b>Rp 12.000</div><div class="menu"><b>Es Latte</b>Rp 18.000</div><div class="menu"><b>Manual Brew</b>Rp 25.000</div></div>
<button id="b">Pesan sekarang</button>
<script>document.getElementById('b').onclick=()=>{document.getElementById('b').textContent='Pesanan diterima';};<\/script>
</div></body></html>`;

const JAWABAN = [
  '# Halo! Ini jawaban uji\n\n',
  'Baik, saya rangkum dalam tiga poin:\n\n',
  '1. **Pertama** — pengenalan singkat.\n',
  '2. Kedua — contoh `kode sebaris` di tengah kalimat.\n',
  '3. Ketiga — tabel di bawah ini.\n\n',
  '| Bagian | Isi |\n| --- | --- |\n| Halaman | 1 berkas HTML |\n| Berkas | `index.html` |\n\n',
  'Contoh fungsi JavaScript:\n\n```js\nfunction sapa(nama) {\n  // menyapa pengguna\n  return `Halo, ${nama}!`;\n}\nconsole.log(sapa("Surabaya"));\n```\n\n',
  'Dan versi HTML yang bisa langsung dibuka:\n\n```html\n' + HTML_UJI + '\n```\n\n',
  'Selesai — silakan lihat ruang kerja sebelah.',
];
const SSE = ['data: ' + JSON.stringify({ model: 'uji/demo-stream' }) + '\n\n']
  .concat(JAWABAN.map((t) => 'data: ' + JSON.stringify({ choices: [{ delta: { content: t } }] }) + '\n\n'))
  .concat(['data: [DONE]\n\n']).join('');

/* ── alat bantu klik ─────────────────────────────────────────────────── */
async function klik(page, sel, { deskripsi } = {}) {
  /* gulirkan ke beberapa posisi dulu: elemen yang tertutup kepala panel
     ("rail-hd", topbar) dipindah lebih ke bawah, baru diklik betulan */
  const cek = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { ok: false, alasan: 'elemen tidak ditemukan' };
    const posisi = ['center', 'end', 'start'];
    let hasil = null;
    for (const blok of posisi) {
      el.scrollIntoView({ block: blok, inline: 'center' });
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const atas = document.elementFromPoint(x, y);
      const kena = !!atas && (el === atas || el.contains(atas) || atas.closest(s) === el);
      hasil = { ok: kena, x, y, alasan: kena ? '' : 'tertutup oleh ' + (atas ? atas.tagName + '.' + (atas.className || '') : 'null') };
      if (kena) break;
    }
    return hasil;
  }, sel);
  if (!cek.ok) throw new Error(`klik ${sel} (${deskripsi || ''}) gagal: ${cek.alasan}`);
  await page.mouse.click(cek.x, cek.y);
  await new Promise((r) => setTimeout(r, 140));
}

async function ada(page, sel) { return page.evaluate((s) => !!document.querySelector(s), sel); }
async function teks(page, sel) { return page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel); }

/* ── A. jalur tampilan dengan jawaban tiruan ─────────────────────────── */
async function ujiTampilan(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const galat = [];
  const badanApi = [];
  page.on('console', (m) => { if (m.type() === 'error') galat.push('console: ' + m.text()); });
  page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/chat')) {
      if (req.method() === 'GET') return req.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"ready":true}' });
      const badan = req.postData() || '';
      if (req.method() === 'POST') badanApi.push(badan);
      if (/Buat 4 pertanyaan riset/i.test(badan)) {
        return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: '1. Sejarah kopi\n2. Budidaya\n3. Pengolahan\n4. Konsumsi', model: 'uji/rencana' }) });
      }
      if (/BAHAN DARI WIKIPEDIA/i.test(badan)) {
        return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: '## Pendahuluan\n\nLaporan riset uji tentang topik.\n\n## Simpulan\n\nSemua sumber telah dirangkum.', model: 'uji/laporan' }) });
      }
      if (/"gambar":\s*\[\s*"/.test(badan)) {
        return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: 'Saya melihat gambar: kotak putih di atas latar merah, ada tulisan uji.', model: 'uji/visi' }) });
      }
      return req.respond({ status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }, body: SSE });
    }
    if (u.includes('/api/builder')) {
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, html: HTML_UJI, model: 'uji/demo-builder', bytes: HTML_UJI.length }) });
    }
    if (u.includes('/api/health')) {
      return req.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"keyConfigured":true}' });
    }
    if (u.includes('id.wikipedia.org')) {
      if (u.includes('list=search')) {
        return req.respond({ status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ query: { search: [{ title: 'Kopi' }, { title: 'Kedai kopi' }] } }) });
      }
      return req.respond({
        status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ query: { pages: {
          1: { title: 'Kopi', extract: 'Kopi adalah minuman hasil seduhan biji kopi yang telah disangrai dan dihaluskan.' },
          2: { title: 'Kedai kopi', extract: 'Kedai kopi adalah tempat usaha yang menyajikan kopi dan makanan ringan.' },
        } } }),
      });
    }
    req.continue();
  });

  await page.goto(URL_UJI, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });

  /* kerangka 3 kolom */
  const kolom = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width) }; };
    return { rail: r('.rail'), chat: r('.chat'), work: r('.work'), splitL: r('#splitL'), splitR: r('#splitR'), tema: document.documentElement.dataset.theme };
  });
  tulis('kolom → riwayat ' + kolom.rail.w + 'px · percakapan ' + kolom.chat.w + 'px · ruang kerja ' + kolom.work.w + 'px · tema ' + kolom.tema);
  if (kolom.rail.w < 200 || kolom.chat.w < 300 || kolom.work.w < 300) throw new Error('susunan 3 kolom tidak sesuai');

  /* ikon SVG semua terpasang, tidak ada data-ic yang belum jadi SVG */
  const ikon = await page.evaluate(() => ({ svg: document.querySelectorAll('svg.ic').length, sisa: document.querySelectorAll('[data-ic]').length }));
  tulis('ikon → ' + ikon.svg + ' SVG terpasang, sisa belum diproses: ' + ikon.sisa);
  if (ikon.svg < 20 || ikon.sisa > 0) throw new Error('hidrasi ikon belum beres');

  /* logo gambar (bukan ikon svg) benar-benar termuat */
  const logo = await page.evaluate(() => {
    const b = document.querySelector('.brand-mk');
    const h = document.querySelector('.hero-ic img');
    return {
      merek: !!b && b.tagName === 'IMG' && b.naturalWidth > 0,
      sambutan: !!h && h.naturalWidth > 0,
      favicon: (document.querySelector('link[rel="icon"]') || {}).getAttribute('href'),
      manifest: !!document.querySelector('link[rel="manifest"]'),
    };
  });
  tulis('logo → lencana merek ' + logo.merek + ' · logo sambutan ' + logo.sambutan + ' · favicon ' + logo.favicon + ' · manifest ' + logo.manifest);
  if (!logo.merek || !logo.sambutan || !logo.manifest) throw new Error('logo gambar tidak termuat');

  /* saran cepat mengisi kotak tulis */
  await klik(page, '#chips [data-templat*="Buatkan halaman web"]');
  const isiTemplat = await page.evaluate(() => document.querySelector('#ta').value);
  tulis('saran cepat → kotak tulis berisi "' + isiTemplat + '"');
  if (!/Buatkan halaman web/.test(isiTemplat)) throw new Error('saran cepat tidak mengisi kotak tulis');
  await page.evaluate(() => { document.querySelector('#ta').value = ''; document.querySelector('#ta').dispatchEvent(new Event('input')); });



  /* chip referensi Wikipedia: nyata (diuji dengan balasan tiruan Wikipedia) */
  await klik(page, '#chipRef');
  const refAktif = await page.evaluate(() => ({
    kelas: document.querySelector('#chipRef').classList.contains('on'),
    saklar: document.querySelector('#setRefWiki').classList.contains('on'),
  }));
  tulis('referensi → chip aktif ' + refAktif.kelas + ' · saklar di pengaturan ikut aktif ' + refAktif.saklar);
  if (!refAktif.kelas || !refAktif.saklar) throw new Error('saklar referensi tidak tersinkron');

  /* tombol pilih mode di kotak tulis */
  await klik(page, '#btnModeC', { deskripsi: 'tombol mode di kotak tulis' });
  if (!(await ada(page, '#modeModal:not([hidden])'))) throw new Error('lembar mode (dari kotak tulis) tidak terbuka');
  const kepalaMode = await teks(page, '.mode-kepala');
  tulis('lembar mode → kepala: "' + kepalaMode.replace(/\s+/g, ' ').trim().slice(0, 90) + '"');
  const pilihanMode = await page.evaluate(() => [...document.querySelectorAll('#modeList .mode-it')].map((b) => b.querySelector('b').textContent.trim()));
  tulis('lembar mode → pilihan: ' + pilihanMode.join(' · '));
  if (pilihanMode.length !== 4) throw new Error('lembar mode tidak berisi 4 pilihan');
  await page.screenshot({ path: path.join(SHOT, '13-lembar-mode.png') });
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 200));

  /* mode: ganti ke Think lewat modal */
  await klik(page, '#btnMode', { deskripsi: 'chip mode' });
  if (!(await ada(page, '#modeModal:not([hidden])'))) throw new Error('modal mode tidak terbuka');
  await klik(page, '#modeList [data-mode="think"]');
  const modeTx = await teks(page, '#modeTx');
  const modeTx2 = await teks(page, '#modeTx2');
  tulis('mode dipilih → bilah atas "' + modeTx.trim() + '" · kotak tulis "' + modeTx2.trim() + '"');
  /* label mode memakai istilah Indonesia sejak bagian H: Normal / Berpikir / Berpikir Mendalam / Expert */
  if (!/^(Berpikir|Think)$/.test(modeTx.trim()) || modeTx.trim() !== modeTx2.trim()) throw new Error('pergantian mode tidak bekerja');
  const warnaLencana = await page.evaluate(() => getComputedStyle(document.querySelector('#btnModeC')).borderColor);
  tulis('tombol mode aktif → warna garis ' + warnaLencana);

  /* tulis + kirim pesan */
  /* kalimat ini menyebut "halaman HTML" — harus tetap dijawab sebagai
     percakapan biasa (bukan dibangun jadi berkas), jadi sekaligus menguji
     penyaluran chat vs pembuat halaman */
  await page.type('#ta', 'Tolong rangkum tiga poin penting dan sertakan contoh halaman HTML.', { delay: 4 });
  await klik(page, '#btnSend', { deskripsi: 'tombol kirim' });
  await page.waitForFunction(() => !!document.querySelector('.msg.ai .bub .kb'), { timeout: 25000 });
  await page.waitForFunction(() => document.querySelector('#btnStop').hidden === true, { timeout: 25000 });
  await new Promise((r) => setTimeout(r, 400));

  const refBadge = await page.evaluate(() => /referensi Wikipedia/.test([...document.querySelectorAll('.msg.me')].map((m) => m.textContent).join(' ')));
  const keApi = badanApi.join(' ').includes('referensi dari Wikipedia Indonesia');
  tulis('referensi → lencana di pesan pengguna ' + refBadge + ' · konteks terkirim ke API ' + keApi);
  if (!keApi) throw new Error('konteks referensi tidak ikut terkirim ke API');
  if (!refBadge) throw new Error('lencana referensi tidak tampil di pesan pengguna');

  const hasil = await page.evaluate(() => {
    const ai = document.querySelector('.msg.ai .bub');
    return {
      pesan: document.querySelectorAll('.msg').length,
      heading: !!ai.querySelector('h1'),
      daftar: ai.querySelectorAll('li').length,
      tabel: !!ai.querySelector('table'),
      blok: ai.querySelectorAll('.kb').length,
      warna: ai.querySelectorAll('.kb .tk-kun, .kb .tk-tek, .kb .tk-kom').length,
      kartu: ai.querySelectorAll('.art').length,
      kursor: !!ai.querySelector('.kursor'),
    };
  });
  tulis('jawaban → pesan ' + hasil.pesan + ' · h1 ' + hasil.heading + ' · li ' + hasil.daftar + ' · tabel ' + hasil.tabel + ' · blok kode ' + hasil.blok + ' · token berwarna ' + hasil.warna + ' · kartu berkas ' + hasil.kartu);
  if (!hasil.heading || !hasil.tabel || hasil.blok < 2 || hasil.warna < 5 || hasil.kartu < 1) throw new Error('render jawaban tidak lengkap');

  /* riwayat bertambah */
  const jmlRiwayat = await page.evaluate(() => document.querySelectorAll('#hist .item').length);
  tulis('riwayat → ' + jmlRiwayat + ' percakapan');
  if (jmlRiwayat < 1) throw new Error('riwayat tidak tercatat');
  await page.screenshot({ path: path.join(SHOT, '01-tiga-kolom.png') });

  /* ruang kerja otomatis menampilkan berkas yang bisa dipratinjau (HTML) */
  const auto = await page.evaluate(() => {
    const f = document.querySelector('#frame');
    return {
      tab: (document.querySelector('.tab.on') || {}).textContent.trim(),
      nama: document.querySelector('#artName').textContent.trim(),
      panjang: (f.getAttribute('srcdoc') || '').length,
      jumlah: document.querySelector('#artCount').textContent.trim(),
    };
  });
  tulis('ruang kerja otomatis → tab "' + auto.tab + '" · berkas "' + auto.nama + '" · pratinjau ' + auto.panjang + ' karakter · total berkas ' + auto.jumlah);
  if (!/Pratinjau/.test(auto.tab) || auto.panjang < 200) throw new Error('pratinjau HTML tidak otomatis terbuka');

  /* berkas .js tidak bisa dipratinjau → tab Kode otomatis saat dipilih */
  await klik(page, '.tab[data-tab="files"]');
  const item = await page.evaluate(() => {
    const it = [...document.querySelectorAll('#filesView .fitem')].find((x) => /script\.js/.test(x.textContent));
    if (!it) return null;
    it.scrollIntoView({ block: 'center' });
    const r = it.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!item) throw new Error('berkas script.js tidak ada di daftar berkas');
  await page.mouse.click(item.x, item.y);
  await new Promise((r) => setTimeout(r, 300));
  const kodeJs = await page.evaluate(() => ({
    tab: (document.querySelector('.tab.on') || {}).textContent.trim(),
    kode: !document.querySelector('#codeView').hidden,
    baris: document.querySelectorAll('#codeView .ln').length,
    nama: document.querySelector('#artName').textContent.trim(),
  }));
  tulis('pilih script.js → tab "' + kodeJs.tab + '" · baris kode ' + kodeJs.baris + ' · tampil ' + kodeJs.kode);
  if (!kodeJs.kode || kodeJs.baris < 3) throw new Error('berkas non-pratinjau tidak dialihkan ke tab Kode');

  /* kembali ke berkas HTML dari daftar berkas */
  await klik(page, '.tab[data-tab="files"]');
  const itemHtml = await page.evaluate(() => {
    const it = [...document.querySelectorAll('#filesView .fitem')].find((x) => /index\.html/.test(x.textContent));
    if (!it) return null;
    it.scrollIntoView({ block: 'center' });
    const r = it.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!itemHtml) throw new Error('berkas index.html tidak ada di daftar berkas');
  await page.mouse.click(itemHtml.x, itemHtml.y);
  await new Promise((r) => setTimeout(r, 300));

  await klik(page, '.tab[data-tab="code"]');
  const barisKode = await page.evaluate(() => ({ tampil: !document.querySelector('#codeView').hidden, baris: document.querySelectorAll('#codeView .ln').length, warna: document.querySelectorAll('#codeView .tk-tag, #codeView .tk-atr, #codeView .tk-kun').length }));
  tulis('tab kode → baris ' + barisKode.baris + ' · token berwarna ' + barisKode.warna);
  if (!barisKode.tampil || barisKode.baris < 10) throw new Error('tab kode kosong');
  await page.screenshot({ path: path.join(SHOT, '02-ruang-kerja-kode.png') });

  await klik(page, '.tab[data-tab="files"]');
  const berkas = await page.evaluate(() => document.querySelectorAll('#filesView .fitem').length);
  tulis('tab berkas → ' + berkas + ' berkas');
  if (berkas < 1) throw new Error('daftar berkas kosong');

  await klik(page, '.tab[data-tab="prev"]');
  await klik(page, '.dvb[data-w="390"]');
  const lebar = await page.evaluate(() => document.querySelector('#stageIn').style.maxWidth);
  tulis('ukuran perangkat → ' + lebar);
  if (lebar !== '390px') throw new Error('tombol ukuran perangkat tidak bekerja');
  await page.screenshot({ path: path.join(SHOT, '03-pratinjau-ponsel.png') });
  await klik(page, '.dvb[data-w="fit"]');

  /* unduh sungguhan */
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
  await klik(page, '#btnDl', { deskripsi: 'unduh berkas hasil' });
  let terunduh = [];
  for (let i = 0; i < 30; i++) {
    terunduh = fs.readdirSync(DL).filter((f) => !f.endsWith('.crdownload'));
    if (terunduh.length) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  tulis('unduh → ' + (terunduh.join(', ') || 'TIDAK ADA BERKAS'));
  if (!terunduh.length) throw new Error('tombol unduh tidak menghasilkan berkas');

  /* tema terang */
  await klik(page, '#btnTheme');
  const tema2 = await page.evaluate(() => document.documentElement.dataset.theme);
  tulis('tema setelah tombol → ' + tema2);
  if (tema2 !== 'light') throw new Error('tombol tema tidak bekerja');
  await page.screenshot({ path: path.join(SHOT, '04-tema-terang.png') });

  /* keterbacaan: warna tulisan vs latar balon (lapisan warna disusun dulu) */
  const kontras = await page.evaluate(() => {
    const angka = (s) => {
      const m = (s.match(/[\d.]+/g) || ['0', '0', '0']).slice(0, 3).map(Number);
      const a = (s.match(/[\d.]+/g) || [])[3];
      return { r: m[0], g: m[1], b: m[2], a: a === undefined ? 1 : Number(a) };
    };
    const timpa = (atas, bawah) => ({
      r: atas.r * atas.a + bawah.r * (1 - atas.a),
      g: atas.g * atas.a + bawah.g * (1 - atas.a),
      b: atas.b * atas.a + bawah.b * (1 - atas.a),
      a: 1,
    });
    const bobot = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = (w) => 0.2126 * bobot(w.r) + 0.7152 * bobot(w.g) + 0.0722 * bobot(w.b);

    const el = document.querySelector('.msg.me .bub');
    const rangkai = [];
    for (let n = el; n; n = n.parentElement) rangkai.push(angka(getComputedStyle(n).backgroundColor));
    rangkai.push({ r: 255, g: 255, b: 255, a: 1 });          /* dasar halaman */
    let latar = rangkai[rangkai.length - 1];
    for (let i = rangkai.length - 2; i >= 0; i--) latar = timpa(rangkai[i], latar);

    const warna = angka(getComputedStyle(el).color);
    const a = lum(warna), b = lum(latar);
    return {
      rasio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100,
      tema: document.documentElement.dataset.theme,
    };
  });
  tulis('keterbacaan balon pengguna (tema ' + kontras.tema + ') → rasio kontras ' + kontras.rasio + ':1');
  if (kontras.rasio < 4.5) throw new Error('tulisan balon pengguna kurang terbaca di tema terang: ' + kontras.rasio);
  await klik(page, '#btnTheme');

  /* pengaturan */
  await klik(page, '#btnSettings');
  const pengaturan = await page.evaluate(() => ({
    buka: !document.querySelector('#setModal').hidden,
    penggunaan: document.querySelector('#setUsage').textContent.trim(),
    jumlah: document.querySelector('#setCount').textContent.trim(),
    berkas: document.querySelector('#setArts').textContent.trim(),
  }));
  tulis('pengaturan → buka ' + pengaturan.buka + ' · pemakaian ' + pengaturan.penggunaan + ' · percakapan ' + pengaturan.jumlah + ' · berkas ' + pengaturan.berkas);
  if (!pengaturan.buka) throw new Error('modal pengaturan tidak terbuka');
  await page.screenshot({ path: path.join(SHOT, '05-pengaturan.png') });
  await page.keyboard.press('Escape');
  if (await ada(page, '#setModal:not([hidden])')) throw new Error('Escape tidak menutup pengaturan');

  /* tutup ruang kerja + panel riwayat */
  await klik(page, '#btnWorkHide');
  const kerjaTutup = await page.evaluate(() => document.body.classList.contains('tanpa-kerja'));
  await klik(page, '#btnRailHide');
  const relTutup = await page.evaluate(() => document.body.classList.contains('tanpa-rel'));
  tulis('panel → ruang kerja tertutup ' + kerjaTutup + ' · riwayat tertutup ' + relTutup);
  if (!kerjaTutup || !relTutup) throw new Error('tombol panel tidak bekerja');
  await klik(page, '#btnWork');
  await klik(page, '#btnRailShow');
  const relKembali = await page.evaluate(() => !document.body.classList.contains('tanpa-rel'));
  tulis('panel → riwayat ditampilkan lagi lewat tombol di bilah atas: ' + relKembali);
  if (!relKembali) throw new Error('riwayat tidak bisa ditampilkan lagi');

  /* geser pembatas (pointer asli) — tunggu animasi lebar panel selesai dulu */
  await new Promise((r) => setTimeout(r, 600));
  const sebelum = await page.evaluate(() => document.querySelector('.rail').getBoundingClientRect().width);
  const box = await page.evaluate(() => { const r = document.querySelector('#splitL').getBoundingClientRect(); return { x: r.left + r.width / 2, y: 300 }; });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y, { steps: 12 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 450));   /* tunggu animasi lebar selesai */
  const sesudah = await page.evaluate(() => document.querySelector('.rail').getBoundingClientRect().width);
  tulis('geser pembatas riwayat → ' + Math.round(sebelum) + 'px menjadi ' + Math.round(sesudah) + 'px');
  if (sesudah - sebelum < 50) throw new Error('pembatas tidak bisa digeser (' + Math.round(sebelum) + ' → ' + Math.round(sesudah) + ')');

  /* bertahan setelah muat ulang */
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 600));
  const lanjut = await page.evaluate(() => ({
    pesan: document.querySelectorAll('.msg').length,
    riwayat: document.querySelectorAll('#hist .item').length,
    tema: document.documentElement.dataset.theme,
    berkas: document.querySelector('#artCount').textContent.trim(),
  }));
  tulis('setelah muat ulang → pesan ' + lanjut.pesan + ' · riwayat ' + lanjut.riwayat + ' · berkas ' + lanjut.berkas + ' · tema ' + lanjut.tema);
  if (lanjut.pesan < 2 || lanjut.riwayat < 1) throw new Error('riwayat tidak bertahan setelah muat ulang');

  /* halaman baru + saran cepat (jalur builder) */
  await klik(page, '#btnNew');
  await klik(page, '.saran button[data-saran*="landing page"]');
  await page.waitForFunction(() => !document.querySelector('#btnStop').hidden === false && document.querySelectorAll('.msg.ai .art').length > 0, { timeout: 25000 });
  await new Promise((r) => setTimeout(r, 400));
  const bangun = await page.evaluate(() => ({
    kartu: document.querySelectorAll('.msg.ai .art').length,
    srcdoc: (document.querySelector('#frame').getAttribute('srcdoc') || '').length,
    judul: document.querySelector('#chatTitle').textContent,
  }));
  tulis('jalur pembuat halaman → kartu ' + bangun.kartu + ' · pratinjau ' + bangun.srcdoc + ' karakter · judul "' + bangun.judul + '"');
  if (bangun.kartu < 1 || bangun.srcdoc < 200) throw new Error('jalur pembuat halaman tidak menghasilkan berkas');
  await page.screenshot({ path: path.join(SHOT, '06-hasil-builder.png') });

  tulis('galat JS → ' + (galat.length ? galat.join(' | ') : 'tidak ada'));
  if (galat.length) throw new Error('ada galat JS di halaman');
  await page.close();
}

/* ── B. jalur backend asli (tanpa tiruan) ────────────────────────────── */
async function ujiBackendAsli(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 860 });
  const galat = [];
  page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') galat.push('console: ' + m.text()); });

  await page.goto(URL_UJI, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  const status = await page.evaluate(() => document.querySelector('#statTx').textContent.trim());
  tulis('backend asli → status panel: "' + status + '"');
  if (!/siap|kunci|server/.test(status)) throw new Error('status backend tidak terbaca');

  await page.type('#ta', 'sebutkan satu warna', { delay: 3 });
  await klik(page, '#btnSend');
  await page.waitForFunction(() => !!document.querySelector('.msg.ai .bub .art, .msg.ai .bub p'), { timeout: 45000 });
  await new Promise((r) => setTimeout(r, 500));
  const jawab = await page.evaluate(() => {
    const b = document.querySelector('.msg.ai .bub');
    return { teks: b.textContent.slice(0, 220), kartu: !!b.querySelector('.art'), panjang: b.textContent.length };
  });
  tulis('backend asli → jawaban ' + jawab.panjang + ' karakter: ' + JSON.stringify(jawab.teks.slice(0, 150)));
  tulis('galat JS (backend asli) → ' + (galat.length ? galat.join(' | ') : 'tidak ada'));
  await page.screenshot({ path: path.join(SHOT, '07-jawaban-asli.png') });
  await page.close();
}

/* ── C. layar ponsel (390×844) ───────────────────────────────────────── */
async function ujiPonsel(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const galat = [];
  page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/429/.test(m.text())) galat.push('console: ' + m.text()); });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/chat')) return req.respond({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: SSE });
    if (u.includes('/api/health')) return req.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"keyConfigured":true}' });
    req.continue();
  });
  await page.goto(URL_UJI, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });

  const awal = await page.evaluate(() => {
    const rail = document.querySelector('.rail');
    const gsap = getComputedStyle(rail);
    return {
      railTersembunyi: gsap.position === 'fixed' && gsap.transform !== 'none',
      lebarChat: Math.round(document.querySelector('.chat').getBoundingClientRect().width),
      kerjaTersembunyi: document.body.classList.contains('tanpa-kerja'),
    };
  });
  tulis('ponsel → riwayat tersembunyi ' + awal.railTersembunyi + ' · lebar percakapan ' + awal.lebarChat + 'px · ruang kerja tertutup ' + awal.kerjaTersembunyi);
  if (awal.lebarChat < 340) throw new Error('percakapan tidak memakai lebar penuh di ponsel');

  await klik(page, '#btnRailShow');
  const relBuka = await page.evaluate(() => document.body.classList.contains('rel-terbuka'));
  tulis('ponsel → panel riwayat geser terbuka: ' + relBuka);
  if (!relBuka) throw new Error('panel riwayat tidak terbuka di ponsel');
  await page.screenshot({ path: path.join(SHOT, '08-ponsel-riwayat.png') });
  await page.mouse.click(360, 640);   /* sentuh di luar panel → menutup */
  await new Promise((r) => setTimeout(r, 350));
  const relTutup = await page.evaluate(() => !document.body.classList.contains('rel-terbuka'));
  if (!relTutup) throw new Error('panel riwayat tidak menutup saat disentuh di luar');

  await page.type('#ta', 'coba di ponsel', { delay: 3 });
  await klik(page, '#btnSend');
  await page.waitForFunction(() => !!document.querySelector('.msg.ai .bub .kb'), { timeout: 25000 });
  await new Promise((r) => setTimeout(r, 600));
  /* di ponsel ruang kerja tidak dibuka paksa — pengguna menekan tombolnya */
  await klik(page, '#btnWorkShow');
  await new Promise((r) => setTimeout(r, 400));
  const kerja = await page.evaluate(() => ({
    buka: document.body.classList.contains('kerja-terbuka'),
    lebar: Math.round(document.querySelector('.work').getBoundingClientRect().width),
    srcdoc: (document.querySelector('#frame').getAttribute('srcdoc') || '').length,
  }));
  tulis('ponsel → ruang kerja terbuka ' + kerja.buka + ' · lebar ' + kerja.lebar + 'px · pratinjau ' + kerja.srcdoc + ' karakter');
  if (!kerja.buka || kerja.srcdoc < 200) throw new Error('ruang kerja tidak tampil penuh di ponsel');
  await page.screenshot({ path: path.join(SHOT, '09-ponsel-ruang-kerja.png') });

  await klik(page, '#btnWorkHide');
  const kembali = await page.evaluate(() => !document.body.classList.contains('kerja-terbuka'));
  tulis('ponsel → kembali ke percakapan: ' + kembali);
  if (!kembali) throw new Error('tidak bisa kembali ke percakapan di ponsel');
  tulis('galat JS (ponsel) → ' + (galat.length ? galat.join(' | ') : 'tidak ada'));
  if (galat.length) throw new Error('ada galat JS di tampilan ponsel');
  await page.close();
}

/* ── D. laptop 1366×768 & layar besar (presisi PC) ───────────────────── */
async function ujiLaptop(browser) {
  for (const [lebar, tinggi, nama] of [[1366, 768, '10-laptop-1366x768'], [1280, 720, '11-laptop-1280x720'], [1920, 1080, '12-pc-1920x1080']]) {
    const page = await browser.newPage();
    await page.setViewport({ width: lebar, height: tinggi });
    const galat = [];
    page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') galat.push('console: ' + m.text().slice(0, 160)); });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/api/chat')) return req.respond({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: SSE });
      if (u.includes('/api/health')) return req.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"keyConfigured":true}' });
      req.continue();
    });
    await page.goto(URL_UJI, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(SHOT, nama + '-sambutan.png') });

    const ukur = await page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), bawah: Math.round(b.bottom) }; };
      const cmp = document.querySelector('.cmp');
      const feed = document.querySelector('.feed');
      const chips = document.querySelector('.chips');
      return {
        rail: r('.rail'), chat: r('.chat'), work: r('.work'), cmp: r('.cmp'), chips: r('#chips'),
        gulirSamping: document.documentElement.scrollWidth > window.innerWidth + 1,
        cmpDidalam: cmp.getBoundingClientRect().bottom <= window.innerHeight + 1,
        feedBawah: Math.round(feed.getBoundingClientRect().bottom),
        tinggiCmp: Math.round(cmp.getBoundingClientRect().height),
        chipsTampil: getComputedStyle(chips).display !== 'none',
        modeTombolTampil: document.querySelector('#btnModeC').getBoundingClientRect().width > 40,
      };
    });
    tulis(`${lebar}×${tinggi} → riwayat ${ukur.rail.w}px · percakapan ${ukur.chat.w}px · ruang kerja ${ukur.work.w}px · kotak tulis ${ukur.tinggiCmp}px (bawah ${ukur.cmp.bawah} / layar ${tinggi})`);
    tulis(`           saran cepat tampil ${ukur.chipsTampil} · tombol mode di kotak tulis ${ukur.modeTombolTampil} · gulir menyamping ${ukur.gulirSamping}`);
    /* tidak boleh ada chip yang terpotong tanpa bisa digeser */
    const chip = await page.evaluate(() => {
      const c = document.querySelector('#chips');
      const kiri = c.getBoundingClientRect().left;
      const pertama = c.firstElementChild.getBoundingClientRect();
      const bisaGeser = c.scrollWidth > c.clientWidth + 1;
      return { pertamaTampil: pertama.left >= kiri - 1, bisaGeser, meluber: c.scrollWidth > c.clientWidth + 1 };
    });
    tulis(`           chip: ujung kiri tampil ${chip.pertamaTampil} · baris bisa digeser ${chip.bisaGeser}`);
    if (!chip.pertamaTampil) throw new Error(`chip terpotong di ${lebar}×${tinggi}`);
    if (ukur.gulirSamping) throw new Error(`ada gulir menyamping di ${lebar}×${tinggi}`);
    if (!ukur.cmpDidalam) throw new Error(`kotak tulis keluar layar di ${lebar}×${tinggi}`);
    if (!ukur.modeTombolTampil) throw new Error(`tombol mode tidak tampil di ${lebar}×${tinggi}`);
    if (ukur.rail.w < 200 || ukur.chat.w < 320 || ukur.work.w < 300) throw new Error(`susunan kolom tidak pas di ${lebar}×${tinggi}`);

    /* kirim satu pesan untuk memastikan tata letak tetap rapi saat ada isi */
    await page.type('#ta', 'uji tata letak', { delay: 2 });
    await klik(page, '#btnSend');
    await page.waitForFunction(() => !!document.querySelector('.msg.ai .bub .kb'), { timeout: 25000 });
    await new Promise((r) => setTimeout(r, 600));
    const setelah = await page.evaluate(() => {
      const feed = document.querySelector('.feed');
      const terakhir = document.querySelector('.msg:last-child');
      const r = terakhir.getBoundingClientRect();
      return {
        gulirSamping: document.documentElement.scrollWidth > window.innerWidth + 1,
        pesanTerlihat: r.bottom <= feed.getBoundingClientRect().bottom + 260,
        pratinjau: (document.querySelector('#frame').getAttribute('srcdoc') || '').length,
        chipTidakMenutupPesan: r.bottom < document.querySelector('.cmp').getBoundingClientRect().top + 230,
      };
    });
    tulis(`           setelah mengirim → gulir menyamping ${setelah.gulirSamping} · pratinjau ${setelah.pratinjau} karakter · pesan tidak tertutup kotak tulis ${setelah.chipTidakMenutupPesan}`);
    if (setelah.gulirSamping) throw new Error(`gulir menyamping muncul setelah kirim di ${lebar}×${tinggi}`);
    if (!setelah.chipTidakMenutupPesan) throw new Error(`pesan tertutup kotak tulis di ${lebar}×${tinggi}`);
    await page.screenshot({ path: path.join(SHOT, nama + '-pesan.png') });
    tulis(`           galat JS: ${galat.length ? galat.join(' | ') : 'tidak ada'}`);
    if (galat.length) throw new Error(`ada galat JS di ${lebar}×${tinggi}`);
    await page.close();
  }
}

/* ── E. proyek · memori · tugas · riset · visi · pustaka berkas ─────── */
async function ujiFiturBaru(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 940 });
  const galat = [];
  const badanApi = [];
  const dialogTerakhir = { pesan: '' };
  page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') galat.push('console: ' + m.text().slice(0, 160)); });
  page.on('dialog', async (d) => {
    dialogTerakhir.pesan = d.message();
    const pesan = d.message();
    if (/Nama proyek baru/i.test(pesan)) await d.accept('Proyek Uji');
    else if (/Arahan tetap/i.test(pesan)) await d.accept('Selalu jawab singkat dan pakai bahasa Indonesia gaul.');
    else if (/Nama berkas baru|Nama baru berkas/i.test(pesan)) await d.accept('catatan-uji.html');
    else if (/Ubah catatan|catatan memori/i.test(pesan)) await d.accept('Catatan uji memori AI');
    else if (/Nama proyek/i.test(pesan)) await d.accept('Proyek Uji');
    else await d.accept('');
  });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('id.wikipedia.org')) {
      if (u.includes('list=search')) {
        return req.respond({ status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ query: { search: [{ title: 'Kopi' }, { title: 'Kedai kopi' }] } }) });
      }
      return req.respond({ status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ query: { pages: {
        1: { title: 'Kopi', extract: 'Kopi adalah minuman hasil seduhan biji kopi.' },
        2: { title: 'Kedai kopi', extract: 'Kedai kopi menyajikan kopi dan makanan ringan.' },
      } } }) });
    }
    if (u.includes('/api/chat')) {
      if (req.method() === 'GET') return req.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"ready":true}' });
      const badan = req.postData() || '';
      badanApi.push(badan);
      if (/Buat 4 pertanyaan riset/i.test(badan)) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: '1. Sejarah kopi\n2. Budidaya kopi\n3. Pengolahan\n4. Konsumsi', model: 'uji/rencana' }) });
      if (/BAHAN DARI WIKIPEDIA/i.test(badan)) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: '## Pendahuluan\n\nLaporan riset uji.\n\n## Simpulan\n\nSelesai.', model: 'uji/laporan' }) });
      if (/"gambar":\s*\[\s*"/.test(badan)) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: 'Saya melihat gambar: kotak putih di latar merah bertuliskan FOTO UJI.', model: 'uji/visi' }) });
      return req.respond({ status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }, body: SSE });
    }
    if (u.includes('/api/health')) return req.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"keyConfigured":true}' });
    req.continue();
  });

  await page.goto(URL_UJI, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });

  /* 1. MEMORI */
  await klik(page, '#btnSettings');
  await page.type('#memTeks', 'Nama saya Rian, suka jawaban singkat');
  await klik(page, '#memTambah');
  const memori = await page.evaluate(() => ({
    jumlah: document.querySelectorAll('#memList .mini-it').length,
    teks: (document.querySelector('#memList .mini-it span') || {}).textContent || '',
  }));
  tulis('memori → tersimpan ' + memori.jumlah + ' catatan: "' + memori.teks.trim() + '"');
  if (memori.jumlah < 1) throw new Error('memori tidak tersimpan');

  /* 2. TUGAS TERJADWAL — dibuat lalu dijalankan */
  await page.type('#tgJudul', 'Ringkasan uji');
  await page.type('#tgPrompt', 'Sebutkan satu fakta singkat tentang kopi');
  await page.evaluate(() => {
    const d = new Date(Date.now() + 3600 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    document.querySelector('#tgWaktu').value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  });
  await klik(page, '#tgTambah');
  const tugas = await page.evaluate(() => ({ jumlah: document.querySelectorAll('#tgList .mini-it').length, ket: (document.querySelector('#tgList .mini-it span') || {}).textContent || '' }));
  tulis('tugas → tersimpan ' + tugas.jumlah + ' tugas: "' + tugas.ket.replace(/\s+/g, ' ').trim().slice(0, 80) + '"');
  if (tugas.jumlah < 1) throw new Error('tugas tidak tersimpan');

  await klik(page, '#tgList [data-tg-jalan]');
  await page.waitForFunction(() => !!document.querySelector('.msg.ai .bub .kb'), { timeout: 25000 });
  await new Promise((r) => setTimeout(r, 500));
  const dariTugas = await page.evaluate(() => ({
    judul: document.querySelector('#chatTitle').textContent,
    pesan: document.querySelectorAll('.msg').length,
    diRiwayat: /Tugas:/.test(document.querySelector('#hist').textContent),
  }));
  tulis('tugas dijalankan → percakapan "' + dariTugas.judul + '" · ' + dariTugas.pesan + ' pesan · tercatat di riwayat ' + dariTugas.diRiwayat);
  if (dariTugas.pesan < 2 || !dariTugas.diRiwayat) throw new Error('tugas tidak menghasilkan percakapan');

  /* 3. PROYEK */
  await klik(page, '#btnProyekBaru');
  const proyek = await page.evaluate(() => ({
    jumlah: document.querySelectorAll('#proyekList .proyek-it').length,
    aktif: (document.querySelector('#proyekList .proyek-it.on span') || {}).textContent || '',
    judul: document.querySelector('#chatTitle').textContent,
  }));
  tulis('proyek → ' + proyek.jumlah + ' baris daftar · aktif "' + proyek.aktif + '" · judul percakapan "' + proyek.judul + '"');
  if (proyek.jumlah < 2 || !/Proyek Uji/.test(proyek.aktif)) throw new Error('proyek tidak dibuat dengan benar');

  /* arahan proyek ikut dikirim ke API */
  await page.type('#ta', 'halo dari dalam proyek', { delay: 2 });
  await klik(page, '#btnSend');
  await page.waitForFunction(() => document.querySelectorAll('.msg.ai').length > 0 && document.querySelector('#btnStop').hidden, { timeout: 25000 });
  /* isi kolom "proyek" = nama proyek + SELURUH arahan yang terlihat di halaman
     Proyek (bahasa, aturan coding, gaya desain, arahan tambahan) */
  const proyekDiApi = /"proyek":"[^"]*Proyek aktif: Proyek Uji\.[^"]*Aturan coding:[^"]*Arahan tambahan: Selalu jawab singkat/.test(badanApi.join(' '));
  tulis('proyek → arahan proyek terkirim ke API: ' + proyekDiApi);
  if (!proyekDiApi) throw new Error('arahan proyek tidak ikut terkirim');
  /* obrolan ini memang masuk proyek → catatan di kotak tulis menyatakan itu */
  const notaProyekKelas = await page.evaluate(() => {
    const n = document.querySelector('#prjNota');
    return n && !n.hidden ? n.className + ' | ' + n.innerText.replace(/\s+/g, ' ').trim().slice(0, 70) : '(tidak tampil)';
  });
  tulis('proyek → catatan di kotak tulis: ' + notaProyekKelas);
  if (!/prj-nota on/.test(notaProyekKelas) || !/masuk proyek/.test(notaProyekKelas)) throw new Error('catatan proyek tidak menyatakan obrolan sudah masuk proyek');

  /* 4. ALAT LOKAL */
  await page.type('#ta', 'hitung 18*7+5', { delay: 2 });
  await klik(page, '#btnSend');
  await page.waitForFunction(() => document.querySelector('#btnStop').hidden && document.querySelectorAll('.msg.ai').length > 0, { timeout: 25000 });
  await new Promise((r) => setTimeout(r, 400));
  const alatKeApi = badanApi.join(' ').includes('hitung(18*7+5) = 131');
  tulis('alat lokal → hasil hitung dikirim ke API: ' + alatKeApi);
  if (!alatKeApi) throw new Error('alat lokal tidak menyisipkan hasil hitung');

  /* 5. MEMORI ikut dikirim */
  const memoriDiApi = badanApi.join(' ').includes('Nama saya Rian');
  tulis('memori → catatan terkirim ke API: ' + memoriDiApi);
  if (!memoriDiApi) throw new Error('memori tidak ikut terkirim');

  /* 6. AI VISION — lampirkan foto (berkas dibuat sendiri supaya uji tidak
     bergantung pada berkas di /tmp yang bisa hilang) */
  const FOTO_UJI = path.join('/tmp', 'foto-uji.png');
  if (!fs.existsSync(FOTO_UJI)) fs.writeFileSync(FOTO_UJI, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAMUlEQVR4nO3NsQ0AIAgAQXT/iWl0BRMCNvf5/iLXbj0AAMB34DwEAAAA3UB9AAAwAFxushRMOlnuaAAAAABJRU5ErkJggg==', 'base64'));
  const inputFoto = await page.$('#fileIn');
  await inputFoto.uploadFile(FOTO_UJI);
  await page.waitForFunction(() => document.querySelectorAll('#attachList .lampiran').length > 0, { timeout: 15000 });
  const lampir = await page.evaluate(() => ({
    jumlah: document.querySelectorAll('#attachList .lampiran').length,
    ket: document.querySelector('#attachList .lampiran small').textContent,
    adaMini: !!document.querySelector('#attachList img'),
  }));
  tulis('lampiran foto → ' + lampir.jumlah + ' chip · "' + lampir.ket + '" · thumbnail ' + lampir.adaMini);
  if (!lampir.adaMini) throw new Error('thumbnail foto tidak muncul');

  await page.type('#ta', 'apa isi gambar ini?', { delay: 2 });
  await klik(page, '#btnSend');
  await page.waitForFunction(() => /Saya melihat gambar/.test(document.body.textContent), { timeout: 25000 });
  const visi = await page.evaluate(() => {
    const balon = [...document.querySelectorAll('.msg.me .bub')].pop();
    return { adaFoto: !!balon.querySelector('img'), teks: document.body.textContent.includes('kotak putih di latar merah') };
  });
  const gambarKeApi = /"gambar":\s*\[\s*"data:image\//.test(badanApi.join(' '));
  tulis('vision → foto terkirim sebagai gambar ke API: ' + gambarKeApi + ' · foto tampil di balon ' + visi.adaFoto + ' · jawaban menyebut isi gambar ' + visi.teks);
  if (!gambarKeApi || !visi.adaFoto) throw new Error('jalur visi tidak bekerja');
  await page.screenshot({ path: path.join(SHOT, '30-vision.png') });

  /* 7. PUSTAKA BERKAS: unggah, ganti nama, ubah isi, hapus */
  await klik(page, '.tab[data-tab="files"]');
  await klik(page, '#libBaru');            /* dialog: nama berkas baru */
  await page.waitForFunction(() => document.querySelectorAll('#filesView .fitem').length > 0, { timeout: 10000 });
  const pustaka = await page.evaluate(() => ({
    jumlah: document.querySelectorAll('#filesView .fitem').length,
    editor: !document.querySelector('#editor').hidden,
    nama: document.querySelector('#artName').textContent.trim(),
  }));
  tulis('pustaka berkas → "Berkas baru" membuat berkas "' + pustaka.nama + '" · editor terbuka ' + pustaka.editor);
  if (!pustaka.editor) throw new Error('editor berkas tidak terbuka');

  await page.evaluate(() => { document.querySelector('#editorTa').value = ''; });
  await klik(page, '#editorTa');
  await page.keyboard.type('<h1>Halo dari editor</h1>\n<p>Isi berkas diubah langsung di ruang kerja.</p>');
  await klik(page, '#btnUbahSimpan');
  await new Promise((r) => setTimeout(r, 400));
  const kodeSesudah = await page.evaluate(() => document.querySelector('#codeView').textContent || '');
  await klik(page, '.tab[data-tab="prev"]');
  await new Promise((r) => setTimeout(r, 300));
  const simpan = await page.evaluate(() => ({
    ukuran: document.querySelector('#artMeta').textContent,
    pratinjau: (document.querySelector('#frame').getAttribute('srcdoc') || ''),
  }));
  tulis('editor → setelah simpan: ' + simpan.ukuran + ' · isi kode berubah: ' + /Halo dari editor/.test(kodeSesudah) + ' · pratinjau memuat perubahan: ' + /Halo dari editor/.test(simpan.pratinjau));
  if (!/Halo dari editor/.test(simpan.pratinjau)) throw new Error('perubahan berkas tidak tersimpan');


  /* kirim isi berkas ke percakapan */
  await klik(page, '.tab[data-tab="files"]');
  await klik(page, '#filesView .fitem [data-artpakai]');
  const dipakai = await page.evaluate(() => document.querySelector('#ta').value);
  tulis('pustaka → isi berkas masuk ke kotak tulis: ' + /Halo dari editor/.test(dipakai));
  if (!/Halo dari editor/.test(dipakai)) throw new Error('tombol pakai berkas tidak bekerja');
  await page.evaluate(() => { document.querySelector('#ta').value = ''; document.querySelector('#ta').dispatchEvent(new Event('input')); });

  /* berkas HTML berisi perulangan tanpa henti → pratinjau DITAHAN (aplikasi
     tidak boleh membeku karena kode yang baru ditulis) */
  /* ruang kerja mungkin tertutup — pastikan terbuka, lalu buka tab "Berkas" */
  for (let i = 0; i < 4; i++) {
    const lebar = await page.evaluate(() => {
      const t = document.querySelector('.tab[data-tab="files"]');
      return t ? t.getBoundingClientRect().width : 0;
    });
    if (lebar > 0) break;
    await klik(page, '#btnWork');
    await new Promise((r) => setTimeout(r, 500));
  }
  try { await klik(page, '.tab[data-tab="files"]'); }
  catch (e) { await klik(page, '#btnWork'); await new Promise((r) => setTimeout(r, 500)); await klik(page, '.tab[data-tab="files"]'); }
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => { window.__promptAsli = window.prompt; window.prompt = () => 'macet.html'; });
  await klik(page, '#libBaru');
  await page.waitForFunction(() => !document.querySelector('#editor').hidden, { timeout: 8000 });
  await page.evaluate(() => {
    const isi = '<!doctype html><html><body><h1>Macet</h1><scr' + 'ipt>while (true) { }</scr' + 'ipt></body></html>';
    const ta = document.querySelector('#editorTa');
    ta.value = isi; ta.dispatchEvent(new Event('input'));
  });
  await klik(page, '#btnUbahSimpan');
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => { if (window.__promptAsli) window.prompt = window.__promptAsli; });
  await klik(page, '.tab[data-tab="prev"]');
  await new Promise((r) => setTimeout(r, 600));
  const tahan = await page.evaluate(() => {
    const k = document.querySelector('#prevTahan');
    return {
      kartuTampil: !!k && !k.hidden,
      teks: k ? k.innerText.replace(/\s+/g, ' ').trim().slice(0, 130) : '',
      tombol: k ? [...k.querySelectorAll('button')].map((b) => b.textContent.trim()) : [],
      frameDisembunyikan: document.querySelector('#frame').hidden,
      srcdocTersisa: (document.querySelector('#frame').getAttribute('srcdoc') || '').length,
    };
  });
  tulis('pratinjau berisiko → kartu ditahan: ' + tahan.kartuTampil + ' · iframe disembunyikan: ' + tahan.frameDisembunyikan + ' · sisa srcdoc: ' + tahan.srcdocTersisa + ' · tombol: ' + JSON.stringify(tahan.tombol));
  tulis('   pesan: ' + tahan.teks);
  if (!tahan.kartuTampil || !/perulangan tanpa henti/.test(tahan.teks)) throw new Error('pratinjau berisiko tidak ditahan');
  if (!tahan.frameDisembunyikan || tahan.srcdocTersisa !== 0) throw new Error('kode berisiko tetap dimuat ke iframe');
  /* aplikasi tetap hidup (tidak membeku) */
  await page.evaluate(() => 1 + 1);
  await klik(page, '#prevTanpaSkrip');
  await new Promise((r) => setTimeout(r, 400));
  const tanpaSkrip = await page.evaluate(() => ({
    frameTampil: !document.querySelector('#frame').hidden,
    adaSkrip: /<script/i.test(document.querySelector('#frame').getAttribute('srcdoc') || ''),
    kartuTersembunyi: document.querySelector('#prevTahan').hidden,
    hidup: document.querySelectorAll('#ta').length === 1,
  }));
  tulis('   pilih "Tampilkan tanpa skrip" → pratinjau tampil ' + tanpaSkrip.frameTampil + ' · masih ada <script>: ' + tanpaSkrip.adaSkrip + ' · kartu tersembunyi: ' + tanpaSkrip.kartuTersembunyi);
  if (!tanpaSkrip.frameTampil || tanpaSkrip.adaSkrip) throw new Error('pilihan tanpa skrip tidak bekerja');
  await page.screenshot({ path: path.join(SHOT, '56-pratinjau-ditahan.png') });


  /* 8. RISET DALAM */
  await page.type('#ta', 'kopi dan kedai kopi', { delay: 2 });
  await klik(page, '#chipRiset');
  const bilahRiset = await page.evaluate(() => {
    const el = document.querySelector('#risetKonfirmasi');
    return el && !el.hidden ? el.innerText.replace(/\s+/g, ' ').trim().slice(0, 90) : '';
  });
  tulis('riset dalam → bilah konfirmasi: ' + (bilahRiset || '(tidak muncul)'));
  if (!/riset mendalam/i.test(bilahRiset)) throw new Error('bilah konfirmasi riset tidak muncul');
  await klik(page, '#risetLanjut');
  await page.waitForFunction(() => /Riset dalam/.test(document.body.textContent), { timeout: 10000 });
  await page.waitForFunction(() => /laporan riset selesai|Laporan riset selesai/i.test(document.body.textContent), { timeout: 40000 });
  await new Promise((r) => setTimeout(r, 600));
  const riset = await page.evaluate(() => ({
    nama: document.querySelector('#artName').textContent.trim(),
    pratinjau: (document.querySelector('#frame').getAttribute('srcdoc') || '').length,
    sumber: document.querySelectorAll('#frame').length ? true : false,
    kartu: document.querySelectorAll('.msg.ai .art').length,
  }));
  tulis('riset dalam → berkas "' + riset.nama + '" · pratinjau ' + riset.pratinjau + ' karakter · kartu hasil ' + riset.kartu);
  if (!/^riset-/.test(riset.nama) || riset.pratinjau < 500) throw new Error('laporan riset tidak terbentuk');
  await page.screenshot({ path: path.join(SHOT, '31-riset-dalam.png') });

  /* 9. SEMATKAN PERCAKAPAN */
  await klik(page, '#hist .item [data-pin]');
  const semat = await page.evaluate(() => ({ grup: /Disematkan/.test(document.querySelector('#hist').textContent) }));
  tulis('percakapan → sematan muncul di grup "Disematkan": ' + semat.grup);
  if (!semat.grup) throw new Error('sematan percakapan tidak bekerja');

  tulis('galat JS (fitur baru) → ' + (galat.length ? galat.join(' | ') : 'tidak ada'));
  await page.screenshot({ path: path.join(SHOT, '32-pustaka-proyek.png') });
  if (galat.length) throw new Error('ada galat JS: ' + galat[0]);
  await page.close();
}

/* ── F. data lama & setelan (penjaga riwayat versi lama) ───────────── */
async function ujiDataLama(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 940 });
  const galat = [];
  page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') galat.push('console: ' + m.text().slice(0, 160)); });

  await page.goto(URL_UJI, { waitUntil: 'networkidle2' });

  /* Tiruan pemasangan versi lama:
     · lampiran berbentuk OBJEK (bukan larik) seperti pada versi awal
     · setelan berisi proyek aktif, sedangkan percakapan lama TIDAK punya proyekId
     · ada satu percakapan milik proyek lain yang harus tetap tersembunyi */
  await page.evaluate(() => {
    localStorage.setItem('vcs.setelan', JSON.stringify({
      proyek: [
        { id: 'pr-lain', nama: 'Proyek Lain', instruksi: '' },
        { id: 'pr-x', nama: 'Proyek X', instruksi: '' },
      ],
      proyekAktif: 'pr-x',
    }));
    localStorage.setItem('vcs.sesi', JSON.stringify([
      {
        id: 'lawas-1', judul: 'Percakapan lama', ts: Date.now() - 86400000,
        messages: [
          { id: 'm1', role: 'user', text: 'pertanyaan lama', ts: Date.now() - 86500000, lampiran: { nama: 'lama.txt', ukuran: 1234 } },
          { id: 'm2', role: 'ai', text: 'jawaban lama', ts: Date.now() - 86400000 },
        ],
        artifacts: [],
      },
      { id: 'lain-1', judul: 'Percakapan proyek lain', ts: Date.now() - 43200000, messages: [{ id: 'x', role: 'user', text: 'rahasia proyek lain', ts: Date.now() - 43200000 }], artifacts: [], proyekId: 'pr-lain' },
      { id: 'x-1', judul: 'Percakapan proyek X', ts: Date.now() - 21600000, messages: [{ id: 'y', role: 'user', text: 'isi proyek X', ts: Date.now() - 21600000 }], artifacts: [], proyekId: 'pr-x' },
    ]));
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 600));

  const galatSaatMuat = galat.slice();
  const daftar = await page.evaluate(() => ({
    judul: Array.from(document.querySelectorAll('#hist [data-sesi] .it-tx b')).map((b) => b.textContent),
    grup: Array.from(document.querySelectorAll('#hist .grp')).map((g) => g.textContent),
  }));
  const isiLama = await page.evaluate(() => document.querySelector('#feed').textContent);
  tulis('riwayat versi lama → percakapan tampil: ' + JSON.stringify(daftar.judul) + ' · grup: ' + JSON.stringify(daftar.grup));
  tulis('  · percakapan proyek lain disembunyikan: ' + !daftar.judul.includes('Percakapan proyek lain')
    + ' · isi usia lama tetap terbaca: ' + /pertanyaan lama/.test(isiLama)
    + ' · tanpa galat saat dimuat: ' + (galatSaatMuat.length === 0));
  if (!daftar.judul.includes('Percakapan lama')) throw new Error('percakapan tanpa proyek hilang saat proyek aktif');
  if (daftar.judul.includes('Percakapan proyek lain')) throw new Error('percakapan proyek lain ikut tampil');
  if (!daftar.judul.includes('Percakapan proyek X')) throw new Error('percakapan proyek aktif tidak tampil');
  if (!daftar.grup.some((g) => /Umum \(tanpa proyek\)/.test(g))) throw new Error('grup "Umum (tanpa proyek)" tidak ada');
  if (!/pertanyaan lama/.test(isiLama)) throw new Error('isi percakapan lama hilang');
  if (galatSaatMuat.length) throw new Error('riwayat versi lama memicu galat JS: ' + galatSaatMuat[0]);

  /* percakapan lama harus bisa dibuka seperti biasa */
  await klik(page, '#hist [data-sesi="lawas-1"]');
  await new Promise((r) => setTimeout(r, 400));
  const terbuka = await page.evaluate(() => /jawaban lama/.test(document.querySelector('#feed').textContent));
  tulis('  · percakapan lama bisa dibuka kembali: ' + terbuka);
  if (!terbuka) throw new Error('percakapan lama tidak bisa dibuka');

  /* sakelar "aliran jawaban" di setelan harus bisa dinyalakan/dimatikan */
  await klik(page, '#btnSettings');
  await new Promise((r) => setTimeout(r, 300));
  const awal = await page.evaluate(() => document.querySelector('#setStream').classList.contains('on'));
  await klik(page, '#setStream');
  await new Promise((r) => setTimeout(r, 200));
  const setelah1 = await page.evaluate(() => document.querySelector('#setStream').classList.contains('on'));
  await klik(page, '#setStream');
  await new Promise((r) => setTimeout(r, 200));
  const setelah2 = await page.evaluate(() => document.querySelector('#setStream').classList.contains('on'));
  const tersimpan = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('vcs.setelan')).stream; } catch (e) { return null; } });
  tulis('setelan aliran jawaban → awal ' + awal + ' · setelah klik ' + setelah1 + ' · dikembalikan ' + setelah2
    + ' · tersimpan di setelan: ' + tersimpan);
  if (setelah1 === awal) throw new Error('sakelar aliran jawaban tidak berubah saat diklik');
  if (setelah2 !== awal) throw new Error('sakelar aliran jawaban tidak kembali ke keadaan awal');
  if (tersimpan !== setelah2) throw new Error('setelan aliran jawaban tidak tersimpan');
  /* suara — tombol "Bacakan" harus benar-benar memanggil mesin suara browser */
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    window.__bicara = [];
    window.SpeechSynthesisUtterance = function (teks) { this.text = teks; };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false,
        cancel() { window.__bicara.push('batal'); },
        getVoices() { return [{ name: 'Suara Uji', lang: 'id-ID' }]; },
        speak(u) { window.__bicara.push(String(u.text).slice(0, 60)); },
      },
    });
  });
  await klik(page, '.msg.ai [data-act="tts"]');
  await new Promise((r) => setTimeout(r, 300));
  const bicara = await page.evaluate(() => window.__bicara);
  tulis('suara → tombol "Bacakan" memanggil mesin suara browser: ' + (bicara.length > 0)
    + ' · yang dibacakan: ' + JSON.stringify((bicara[0] || '').slice(0, 40)));
  if (!bicara.length) throw new Error('tombol Bacakan tidak memanggil mesin suara browser');

  await klik(page, '#btnMic');
  await new Promise((r) => setTimeout(r, 400));
  const micPesan = await page.evaluate(() => (document.querySelector('.toast') || {}).textContent || '');
  tulis('suara → mikrofon di browser tanpa dukungan: ' + (micPesan.trim() ? 'pesan jelas "' + micPesan.trim().slice(0, 70) + '"' : 'diam (tidak baik)'));
  if (!micPesan.trim()) throw new Error('mikrofon tidak memberi pesan saat browser tidak mendukung');

  if (galat.length) throw new Error('galat JS pada pengujian data lama: ' + galat[0]);
  await page.screenshot({ path: path.join(SHOT, '33-data-lama-setelan.png') });
  await page.close();
}

/* ── G. pesan lengkap: jenis pesan · aksi · kode · web · "+" · berkas ── */
/* kepala kolom percakapan bersifat tetap di atas; elemen yang tergulir ke
   bawahnya harus digeser dulu agar benar-benar bisa diklik manusia */
async function klikDiFeed(page, sel, { deskripsi, terakhir } = {}) {
  for (let i = 0; i < 6; i++) {
    await page.evaluate((s, last) => {
      const semua = [...document.querySelectorAll(s)];
      const el = last ? semua[semua.length - 1] : semua[0];
      if (!el) return;
      const feed = document.querySelector('#feed');
      const r = el.getBoundingClientRect(), f = feed.getBoundingClientRect();
      if (r.top < f.top + 70 || r.bottom > innerHeight - 40) feed.scrollTop += (r.top - f.top) - 160;
    }, sel, !!terakhir);
    await new Promise((r) => setTimeout(r, 260));
    const cek = await page.evaluate((s, last) => {
      const semua = [...document.querySelectorAll(s)];
      const el = last ? semua[semua.length - 1] : semua[0];
      if (!el) return { ok: false, alasan: 'elemen tidak ada' };
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return { ok: false, alasan: 'ukuran nol' };
      const atas = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const kena = !!atas && (el === atas || el.contains(atas));
      return { ok: kena, x: r.left + r.width / 2, y: r.top + r.height / 2, alasan: !atas ? 'di luar layar' : 'tertutup ' + (atas.className || atas.tagName) };
    }, sel, !!terakhir);
    if (cek.ok) { await page.mouse.click(cek.x, cek.y); await new Promise((r) => setTimeout(r, 160)); return; }
    if (i === 5) throw new Error('klik ' + sel + ' (' + (deskripsi || '') + ') gagal: ' + cek.alasan);
  }
}
/* tunggu sampai jawaban AI selesai mengalir sebelum mengklik tombol di dalamnya */
async function tungguJawaban(page) {
  await page.waitForFunction(() => !document.querySelector('.kursor') && !document.querySelector('.tulis') && !document.querySelector('#btnStop').offsetParent, { timeout: 25000 });
  await new Promise((r) => setTimeout(r, 400));
}

async function ujiPesanBerkas(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 940 });
  const galat = [];
  const badanApi = [];
  const badanCari = [];
  page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') galat.push('console: ' + m.text().slice(0, 160)); });
  page.on('dialog', async (d) => {
    const pesan = d.message();
    if (/Tag baru/i.test(pesan)) await d.accept('penting');
    else if (/Masukkan ke proyek/i.test(pesan)) await d.accept('Proyek Uji');
    else await d.accept('Proyek Uji');
  });

  const SUMBER = [
    { penyedia: 'Wikipedia Indonesia', jenis: 'ensiklopedia', judul: 'Kopi arabika', url: 'https://id.wikipedia.org/wiki/Kopi_arabika', cuplikan: 'Coffea arabica adalah spesies kopi pertama yang dibudidayakan.' },
    { penyedia: 'Stack Overflow', jenis: 'tanya-jawab kode', judul: 'No Access-Control-Allow-Origin header', url: 'https://stackoverflow.com/q/1', cuplikan: 'CORS terjadi karena alamat asal tidak diizinkan.' },
    { penyedia: 'GitHub', jenis: 'repositori', judul: 'kopi/kedai', url: 'https://github.com/kopi/kedai', cuplikan: 'Aplikasi kedai kopi · 12 bintang' },
  ];

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/search')) {
      badanCari.push(u);
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, q: 'kopi arabika', jumlah: SUMBER.length, sumber: SUMBER, catatan: 'uji' }) });
    }
    if (u.includes('/api/chat')) {
      if (req.method() === 'GET') return req.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"ready":true}' });
      const badan = req.postData() || '';
      badanApi.push(badan);
      /* hanya pesan terbaru yang diperiksa — badan permintaan memuat riwayat percakapan juga */
      let pesanBaru = '';
      try { pesanBaru = String(JSON.parse(badan).prompt || ''); } catch (e) { pesanBaru = badan; }
      if (/PICU_GALAT/.test(pesanBaru)) return req.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, pesan: 'uji galat backend' }) });
      if (/KODE_RUSAK/.test(pesanBaru)) {
        const rusak = 'Kode uji galat:\n\n```js\nconsole.log("sebelum galat");\ntidakAdaFungsi();\n```\n';
        return req.respond({ status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }, body: 'data: ' + JSON.stringify({ choices: [{ delta: { content: rusak } }] }) + '\n\ndata: [DONE]\n\n' });
      }
      return req.respond({ status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }, body: SSE });
    }
    if (u.includes('/api/health')) return req.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"keyConfigured":true}' });
    req.continue();
  });

  await page.goto(URL_UJI, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });

  /* 1. MENU "+" — 10 pilihan */
  await klik(page, '#btnPlus');
  const menu = await page.evaluate(() => ({
    tampil: !document.querySelector('#menuPlus').hidden,
    item: [...document.querySelectorAll('#menuPlus [data-plus]')].map((b) => b.dataset.plus),
  }));
  tulis('menu "+" → tampil ' + menu.tampil + ' · ' + menu.item.length + ' pilihan: ' + menu.item.join(', '));
  if (!menu.tampil || menu.item.length !== 10) throw new Error('menu "+" tidak lengkap');

  /* 2. PENCARIAN WEB: nyalakan, tanya, periksa sumber + sitasi + isi permintaan */
  await klik(page, '#menuPlus [data-plus="web"]');
  await page.evaluate(() => document.querySelector('#menuPlus').hidden = true);
  await new Promise((r) => setTimeout(r, 200));
  await page.type('#ta', 'Apa itu kopi arabika?');
  await klik(page, '#btnSend');
  await page.waitForFunction(() => !!document.querySelector('.web-src') && !!document.querySelector('.msg.ai .kb'), { timeout: 20000 });
  await tungguJawaban(page);
  const web = await page.evaluate(() => ({
    sumber: document.querySelectorAll('.web-src li').length,
    sitasi: [...document.querySelectorAll('.web-src .cit')].map((c) => c.textContent).join(' '),
    meta: (document.querySelector('.msg.me .msg-meta') || {}).textContent || '',
    sistem: document.querySelectorAll('.msg.catatan.sistem').length,
    hapusAda: !!document.querySelector('[data-hapusweb]'),
  }));
  tulis('pencarian web → ' + web.sumber + ' sumber · sitasi ' + web.sitasi + ' · meta "' + web.meta.replace(/\s+/g, ' ').trim() + '" · tombol hapus: ' + web.hapusAda);
  if (web.sumber < 3) throw new Error('blok sumber web tidak muncul');
  if (!/\b1\b/.test(web.sitasi)) throw new Error('penanda sitasi [1] tidak ada');
  if (!/sumber web/.test(web.meta)) throw new Error('meta sumber web tidak tampil');
  if (!/hasil pencarian web/.test(badanApi.join(' '))) throw new Error('hasil pencarian web tidak ikut ke AI');
  if (!badanCari.length) throw new Error('/api/search tidak dipanggil');
  await page.screenshot({ path: path.join(SHOT, '34-cari-web-sitasi.png') });

  /* 3. HAPUS HASIL WEB */
  await klikDiFeed(page, '[data-hapusweb]');
  await new Promise((r) => setTimeout(r, 300));
  const setelahHapus = await page.evaluate(() => ({
    blok: document.querySelectorAll('.web-src').length,
    adaDiApi: JSON.stringify(localStorage.getItem('vcs.sesi') || '').includes('hasil pencarian web'),
  }));
  tulis('hapus hasil web → blok sumber tersisa ' + setelahHapus.blok + ' · konteks masih tersimpan: ' + setelahHapus.adaDiApi);
  if (setelahHapus.blok) throw new Error('blok sumber web tidak terhapus');
  if (setelahHapus.adaDiApi) throw new Error('konteks web masih menempel di pesan');

  /* 4. PESAN ALAT + ULANGI ALAT */
  await page.type('#ta', 'hitung(18*7+5)');
  await klik(page, '#btnSend');
  await page.waitForFunction(() => !!document.querySelector('.msg.catatan.alat'), { timeout: 20000 });
  await tungguJawaban(page);
  const alat = await page.evaluate(() => ({
    teks: (document.querySelector('.msg.catatan.alat .cat-tx') || {}).textContent || '',
    tombolUlang: !!document.querySelector('[data-act="alatulang"]'),
  }));
  tulis('pesan alat → "' + alat.teks.trim() + '" · tombol ulangi alat: ' + alat.tombolUlang);
  if (!/131/.test(alat.teks)) throw new Error('pesan alat tidak memuat hasil 131');
  if (!alat.tombolUlang) throw new Error('tombol ulangi alat tidak ada');
  await klikDiFeed(page, '[data-act="alatulang"]');
  await new Promise((r) => setTimeout(r, 300));
  tulis('ulangi alat → hasil tetap "' + (await page.evaluate(() => document.querySelector('.msg.catatan.alat .cat-tx').textContent.trim())).slice(0, 40) + '"');

  /* 5. PESAN GALAT (backend menolak) */
  await page.type('#ta', 'PICU_GALAT tolong jawab');
  await klik(page, '#btnSend');
  await page.waitForFunction(() => !!document.querySelector('.msg.catatan.galat'), { timeout: 20000 });
  await tungguJawaban(page);
  const galatPesan = await page.evaluate(() => (document.querySelector('.msg.catatan.galat .cat-tx') || {}).textContent || '');
  tulis('pesan galat → "' + galatPesan.trim().slice(0, 70) + '"');
  if (!/uji galat backend/.test(galatPesan)) throw new Error('pesan galat tidak muncul');

  /* 6. BLOK KODE: perbesar + jalankan */
  const kb = await page.evaluate(() => ({
    perbesar: document.querySelectorAll('[data-perbesar]').length,
    jalan: document.querySelectorAll('[data-jalan]').length,
    nomor: document.querySelectorAll('.kb .ln .no').length,
  }));
  tulis('blok kode → tombol perbesar ' + kb.perbesar + ' · tombol jalankan ' + kb.jalan + ' · nomor baris ' + kb.nomor);
  if (!kb.perbesar || !kb.jalan) throw new Error('tombol perbesar/jalankan tidak ada');
  await klikDiFeed(page, '[data-perbesar]');
  await page.waitForFunction(() => !document.querySelector('#kodeModal').hidden, { timeout: 5000 });
  const besar = await page.evaluate(() => ({
    baris: document.querySelectorAll('#kodeIsi .ln').length,
    bahasa: document.querySelector('#kodeLang').textContent,
    tombolJalan: !document.querySelector('#kodeJalan').hidden,
  }));
  tulis('perbesar kode → ' + besar.baris + ' baris · bahasa ' + besar.bahasa + ' · tombol jalankan ' + besar.tombolJalan);
  if (!besar.baris) throw new Error('modal kode kosong');
  await klik(page, '#kodeJalan');
  await page.waitForFunction(() => !document.querySelector('#runModal').hidden, { timeout: 5000 });
  const jalan = await page.evaluate(() => {
    const f = document.querySelector('#runFrame');
    return { sandbox: f.getAttribute('sandbox') || '', isi: (f.srcdoc || '').length };
  });
  tulis('jalankan kode → sandbox "' + jalan.sandbox + '" · dokumen ' + jalan.isi + ' karakter');
  if (!/allow-scripts/.test(jalan.sandbox)) throw new Error('iframe kotak pasir tanpa allow-scripts');
  if (jalan.isi < 50) throw new Error('dokumen kotak pasir kosong');
  if (/allow-same-origin/.test(jalan.sandbox)) throw new Error('kotak pasir tidak boleh allow-same-origin');
  await page.waitForFunction(() => { const k = document.querySelector('#runOut'); return k && !k.hidden && k.textContent.trim().length > 0; }, { timeout: 8000 });
  const keluaran = await page.evaluate(() => document.querySelector('#runOut').textContent.trim());
  tulis('jalankan kode → keluaran "' + keluaran.replace(/\s+/g, ' ').slice(0, 60) + '"');
  if (!/Halo, Surabaya!/.test(keluaran)) throw new Error('kode tidak benar-benar dijalankan di kotak pasir');

  /* 6b. kode yang galat harus dilaporkan, bukan diam-diam gagal */
  await page.evaluate(() => {
    document.querySelector('#runModal').hidden = true;
    document.querySelector('#kodeModal').hidden = true;   /* lapisan modal harus benar-benar hilang */
  });
  await page.type('#ta', 'KODE_RUSAK tolong jalankan');
  await klik(page, '#btnSend');
  await page.waitForFunction(() => [...document.querySelectorAll('.msg.ai')].some((m) => /tidakAdaFungsi/.test(m.textContent)), { timeout: 20000 });
  await tungguJawaban(page);
  await klikDiFeed(page, '[data-jalan]', { terakhir: true });
  await page.waitForFunction(() => { const k = document.querySelector('#runOut'); return k && /Galat:/.test(k.textContent); }, { timeout: 8000 });
  const keluaranGalat = await page.evaluate(() => document.querySelector('#runOut').textContent.trim());
  tulis('kode galat → "' + keluaranGalat.replace(/\s+/g, ' ').slice(0, 70) + '"');
  if (!/sebelum galat/.test(keluaranGalat)) throw new Error('keluaran sebelum galat hilang');
  await page.evaluate(() => { document.querySelector('#runModal').hidden = true; });
  await page.screenshot({ path: path.join(SHOT, '35-kode-perbesar-jalankan.png') });
  await page.evaluate(() => { document.querySelector('#kodeModal').hidden = true; });

  /* 7. AKSI PESAN: cabangkan · bagikan · hapus */
  const aksiAda = await page.evaluate(() => ['bagikan', 'cabang', 'hapuspesan', 'copy', 'dl', 'tts', 'lagi', 'memori', 'suka', 'kurang']
    .map((a) => a + '=' + document.querySelectorAll('[data-act="' + a + '"]').length).join(' '));
  tulis('tombol aksi pesan → ' + aksiAda);
  await page.evaluate(() => { window.__share = []; navigator.share = (d) => { window.__share.push(d.text.slice(0, 40)); return Promise.resolve(); }; });
  await klikDiFeed(page, '.msg.ai [data-act="bagikan"]');
  await new Promise((r) => setTimeout(r, 300));
  const bagikan = await page.evaluate(() => window.__share.length + '|' + ((document.querySelector('.toast') || {}).textContent || ''));
  tulis('bagikan → dipanggil ' + bagikan);

  const sebelumCabang = await page.evaluate(() => JSON.parse(localStorage.getItem('vcs.sesi')).length);
  await klikDiFeed(page, '.msg.ai [data-act="cabang"]');
  await new Promise((r) => setTimeout(r, 500));
  const cabang = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('vcs.sesi'));
    return { jumlah: s.length, judul: s[0].judul, pesan: s[0].messages.length, aktif: document.querySelector('#chatTitle').textContent };
  });
  tulis('cabangkan → percakapan ' + sebelumCabang + ' → ' + cabang.jumlah + ' · "' + cabang.judul + '" · ' + cabang.pesan + ' pesan dibawa · judul kolom "' + cabang.aktif + '"');
  if (cabang.jumlah <= sebelumCabang) throw new Error('percabangan tidak membuat percakapan baru');
  if (!/^Cabang:/.test(cabang.judul) || cabang.pesan < 2) throw new Error('isi percabangan tidak benar');

  const sebelumHapus = await page.evaluate(() => JSON.parse(localStorage.getItem('vcs.sesi'))[0].messages.length);
  await klikDiFeed(page, '.msg.ai [data-act="hapuspesan"]');
  await new Promise((r) => setTimeout(r, 300));
  const sesudahHapus = await page.evaluate(() => JSON.parse(localStorage.getItem('vcs.sesi'))[0].messages.length);
  tulis('hapus pesan → ' + sebelumHapus + ' → ' + sesudahHapus + ' pesan');
  if (sesudahHapus >= sebelumHapus) throw new Error('pesan tidak terhapus');

  /* 8. LAMPIRAN BERKAS NYATA (docx + pdf dibaca di browser) */
  await page.evaluate(() => { document.querySelector('#ta').value = ''; });
  await page.type('#ta', 'Ringkas isi dua berkas ini.');
  const fileIn = await page.$('#fileIn');
  await fileIn.uploadFile(path.join(AKAR_PROYEK, 'tools/contoh/contoh.docx'), path.join(AKAR_PROYEK, 'tools/contoh/contoh.pdf'));
  await page.waitForFunction(() => document.querySelectorAll('#attachList .lampiran').length >= 2, { timeout: 15000 });
  const lampiran = await page.evaluate(() => [...document.querySelectorAll('#attachList .lampiran')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()));
  tulis('lampiran berkas → ' + JSON.stringify(lampiran));
  if (!lampiran.some((t) => /DOCX/i.test(t) || /contoh\.docx/i.test(t))) throw new Error('berkas DOCX tidak terlampir');
  await klik(page, '#btnSend');
  await page.waitForFunction(() => [...document.querySelectorAll('.msg.ai')].length >= 1 && !!document.querySelector('.msg.ai .kb'), { timeout: 20000 });
  await tungguJawaban(page);
  const badanBerkas = badanApi.join(' ');
  tulis('isi berkas ke AI → DOCX terbaca: ' + /Laporan Uji Van Chat/.test(badanBerkas) + ' · PDF terbaca: ' + /Halo PDF Van Chat/.test(badanBerkas));
  if (!/Laporan Uji Van Chat/.test(badanBerkas)) throw new Error('isi DOCX tidak ikut ke AI');
  if (!/Halo PDF Van Chat/.test(badanBerkas)) throw new Error('teks PDF tidak ikut ke AI');

  /* 9. KAMERA: buka · jepret (disuntik) · ambil ulang · kirim */
  await klik(page, '#btnPlus');
  await klik(page, '#menuPlus [data-plus="kamera"]');
  await page.waitForFunction(() => !document.querySelector('#camModal').hidden, { timeout: 5000 });
  const kamera = await page.evaluate(() => ({
    video: !!document.querySelector('#camVideo'),
    catatan: (document.querySelector('#camNote') || {}).textContent || '',
  }));
  tulis('kamera → modal terbuka · catatan: "' + kamera.catatan.trim().slice(0, 70) + '"');
  await page.evaluate(() => {
    const c = document.querySelector('#camCanvas');
    c.width = 320; c.height = 200;
    const x = c.getContext('2d');
    x.fillStyle = '#20513b'; x.fillRect(0, 0, 320, 200);
    x.fillStyle = '#fff'; x.font = '20px sans-serif'; x.fillText('LAYAR UJI', 90, 105);
    const img = document.querySelector('#camHasil');
    img.src = c.toDataURL('image/jpeg', 0.9); img.hidden = false;
    document.querySelector('#camVideo').hidden = true;
    document.querySelector('#camAmbil').hidden = true;
    document.querySelector('#camUlang').hidden = false; document.querySelector('#camKirim').hidden = false;
  });
  await klik(page, '#camUlang');
  const ulang = await page.evaluate(() => ({ ambil: !document.querySelector('#camAmbil').hidden, kirim: !document.querySelector('#camKirim').hidden }));
  tulis('kamera → ambil ulang bekerja: ' + (ulang.ambil && !ulang.kirim));
  await page.evaluate(() => {
    const c = document.querySelector('#camCanvas');
    const img = document.querySelector('#camHasil');
    img.src = c.toDataURL('image/jpeg', 0.9); img.hidden = false;
    document.querySelector('#camVideo').hidden = true;
    document.querySelector('#camAmbil').hidden = true;
    document.querySelector('#camUlang').hidden = false; document.querySelector('#camKirim').hidden = false;
  });
  await page.waitForFunction(() => document.querySelector('#camKirim').offsetParent !== null, { timeout: 5000 });
  await klik(page, '#camKirim');
  await page.waitForFunction(() => document.querySelectorAll('#attachList .lampiran img').length >= 1, { timeout: 10000 });
  const foto = await page.evaluate(() => [...document.querySelectorAll('#attachList .lampiran')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()));
  tulis('kamera → foto terkirim ke kotak tulis: ' + JSON.stringify(foto));
  if (!foto.length) throw new Error('foto kamera tidak masuk lampiran');
  await page.screenshot({ path: path.join(SHOT, '36-kamera-lampiran.png') });

  /* 10. TEMPEL & SERET-LEPAS */
  await page.evaluate(() => {
    const acara = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    const isi = 'function uji() {\\n' + Array.from({ length: 140 }, (_, i) => '  console.log("baris ke-' + i + '");').join('\\n') + '\\n}';
    Object.defineProperty(acara, 'clipboardData', { value: { getData: () => isi, items: [] } });
    document.querySelector('#ta').dispatchEvent(acara);
  });
  await new Promise((r) => setTimeout(r, 300));
  const tempel = await page.evaluate(() => [...document.querySelectorAll('#attachList .lampiran b')].map((b) => b.textContent));
  tulis('tempel kode panjang → lampiran ' + JSON.stringify(tempel));
  if (!tempel.some((t) => /tempelan/i.test(t))) throw new Error('tempelan panjang tidak jadi lampiran');

  /* 11. HALAMAN /library */
  await page.goto(URL_UJI.replace(/\/$/, '') + '/library', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 600));
  const perpus = await page.evaluate(() => ({
    tampil: !document.querySelector('#libPage').hidden,
    tab: [...document.querySelectorAll('#libTabs button')].map((b) => b.textContent.trim()),
    kartu: document.querySelectorAll('#libGrid .kartu').length,
  }));
  tulis('pustaka → halaman tampil ' + perpus.tampil + ' · tab ' + JSON.stringify(perpus.tab) + ' · kartu ' + perpus.kartu);
  if (!perpus.tampil) throw new Error('halaman /library tidak tampil');
  if (perpus.tab.length !== 5) throw new Error('tab pustaka tidak lengkap');
  if (!perpus.kartu) throw new Error('pustaka kosong — tidak ada kartu berkas');
  await page.screenshot({ path: path.join(SHOT, '37-pustaka-halaman.png') });

  await klik(page, '#libTabs [data-lt="kode"]');
  const tabKode = await page.evaluate(() => document.querySelectorAll('#libGrid .kartu').length);
  await klik(page, '#libUrut');
  const urut = await page.evaluate(() => document.querySelector('#libUrutTx').textContent);
  await page.type('#libCari', 'catatan');
  await new Promise((r) => setTimeout(r, 300));
  const cari = await page.evaluate(() => ({ hitung: document.querySelector('#libHitung').textContent, kartu: document.querySelectorAll('#libGrid .kartu').length }));
  tulis('pustaka → tab kode ' + tabKode + ' kartu · urutan "' + urut + '" · cari "catatan": ' + cari.hitung);
  await page.evaluate(() => { document.querySelector('#libCari').value = ''; document.querySelector('#libCari').dispatchEvent(new Event('input', { bubbles: true })); });
  await klik(page, '#libTabs [data-lt="semua"]');
  await klik(page, '#libGrid [data-libtag]');
  await new Promise((r) => setTimeout(r, 300));
  const tag = await page.evaluate(() => [...document.querySelectorAll('#libGrid .tag-chip')].map((t) => t.textContent));
  tulis('pustaka → tag ditambahkan: ' + JSON.stringify(tag));
  if (!tag.includes('penting')) throw new Error('tag berkas gagal ditambahkan');
  /* ganti nama berkas dari pustaka */
  await page.evaluate(() => { window.prompt = () => 'catatan-baru.html'; });
  await klik(page, '#libGrid [data-libubah]');
  await new Promise((r) => setTimeout(r, 400));
  const namaBaru = await page.evaluate(() => ({ kartu: document.querySelector('#libGrid .kartu b').textContent, ada: [...document.querySelectorAll('#libGrid .kartu b')].some((b) => b.textContent === 'catatan-baru.html') }));
  tulis('pustaka → ganti nama: ' + namaBaru.kartu + ' · ada: ' + namaBaru.ada);
  if (!namaBaru.ada) throw new Error('ganti nama berkas tidak bekerja');

  await klik(page, '#libGrid [data-libprev]');
  await page.waitForFunction(() => !document.querySelector('#libPrev').hidden, { timeout: 5000 });
  const pratinjau = await page.evaluate(() => ({
    meta: document.querySelectorAll('#libPrevIsi .prev-meta span').length,
    isi: (document.querySelector('#libPrevIsi') || {}).textContent.slice(0, 60),
  }));
  tulis('pustaka → pratinjau: ' + pratinjau.meta + ' info (' + pratinjau.isi.replace(/\s+/g, ' ').trim().slice(0, 60) + '…)');
  if (pratinjau.meta < 5) throw new Error('metadata berkas tidak lengkap di pratinjau');
  const aksiPrev = await page.evaluate(() => [...document.querySelectorAll('#libPrevIsi .prev-aksi .kb-btn')].map((b) => b.textContent.trim()));
  tulis('pustaka → aksi pratinjau: ' + JSON.stringify(aksiPrev));
  if (aksiPrev.length < 4) throw new Error('aksi pratinjau berkas belum lengkap');
  await page.evaluate(() => { document.querySelector('#libPrev').hidden = true; });
  await page.screenshot({ path: path.join(SHOT, '38-pustaka-detail.png') });
  await klik(page, '#libKembali');
  await new Promise((r) => setTimeout(r, 600));
  const kembali = await page.evaluate(() => ({ perpus: document.querySelector('#libPage').hidden, chat: !document.querySelector('.chat').hidden }));
  tulis('pustaka → kembali ke percakapan: ' + (kembali.perpus && kembali.chat));

  /* "Failed to load resource: 500" berasal dari uji galat yang MEMANG disengaja (PICU_GALAT);
     pesan galat yang terlihat pengguna sudah diperiksa di langkah 5. Galat JS nyata tetap digagalkan. */
  const galatNyata = galat.filter((g) => !/Failed to load resource/.test(g));
  tulis('galat JS (pesan & berkas) → ' + (galatNyata.length ? galatNyata.join(' | ') : 'tidak ada'));
  if (galatNyata.length) throw new Error('ada galat JS: ' + galatNyata[0]);
  await page.close();
}

/* ── jalan ───────────────────────────────────────────────────────────── */
const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--lang=id-ID'],
});
let gagal = null;
try {
  tulis('══ A. tampilan (jawaban AI tiruan) ══');
  await ujiTampilan(browser);
  tulis('');
  tulis('══ B. backend asli ══');
  await ujiBackendAsli(browser);
  tulis('');
  tulis('══ C. layar ponsel ══');
  await ujiPonsel(browser);
  tulis('');
  tulis('══ D. laptop & PC ══');
  await ujiLaptop(browser);
  tulis('');
  tulis('══ E. proyek · memori · tugas · riset · visi · pustaka berkas ══');
  await ujiFiturBaru(browser);
  tulis('');
  tulis('══ F. data lama & setelan ══');
  await ujiDataLama(browser);
  tulis('');
  tulis('══ G. pesan lengkap · kode · web · "+" · berkas ══');
  await ujiPesanBerkas(browser);
} catch (e) {
  gagal = e;
  tulis('GAGAL: ' + e.message);
}
await browser.close();
fs.writeFileSync(path.join(SHOT, 'HASIL-UJI-TAMPILAN.txt'),
  'perintah : node tools/uji-tampilan.mjs\nwaktu    : ' + new Date().toISOString() + '\n\n' + catatan.join('\n') + '\n\n' +
  (gagal ? 'HASIL: GAGAL — ' + gagal.message : 'HASIL: SEMUA LULUS') + '\n');
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal.message : '\nHASIL: SEMUA LULUS');
process.exit(gagal ? 1 : 0);
