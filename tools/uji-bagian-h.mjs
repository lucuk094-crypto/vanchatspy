/* uji-bagian-h.mjs — uji bagian H (butir 15–53):
 *   riset mendalam · mode berpikir · studio gambar · suara · proyek · memori ·
 *   tugas terjadwal · plugin · AI Builder (diff · pratinjau · konsol · uji ·
 *   build · deploy) · pencarian global · bagikan · setelan · admin · ekspor.
 *
 * Semua klik memakai tetikus sungguhan (elementFromPoint diperiksa lebih dulu).
 * Penyedia AI & pencarian ditiru lewat permintaan HTTP yang dicegat, supaya
 * pengujian tidak memakai kuota dan bisa diulang.
 *
 *   node tools/uji-bagian-h.mjs        (server uji harus jalan di :8131)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/* Puppeteer dipakai untuk uji di browser sungguhan.
   Di komputer sendiri cukup:  npm i puppeteer   (di folder proyek).
   Di sandbox uji, puppeteer bisa ada di /tmp/u — lewat PUPPETEER_DIR. */
const PUPPETEER_DIR = process.env.PUPPETEER_DIR || '/tmp/u';
const puppeteer = (() => {
  const kandidat = [createRequire(import.meta.url), createRequire(PUPPETEER_DIR + '/package.json')];
  for (const r of kandidat) { try { return r('puppeteer'); } catch (e) {} }
  console.error('Puppeteer tidak ditemukan. Pasang dulu:  npm i puppeteer   (di folder proyek ini)');
  process.exit(2);
})();

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT = path.join(AKAR, 'bukti-uji');
const CHROME = process.env.CHROME || puppeteer.executablePath();
const URL_UJI = process.env.UJI_URL || 'http://127.0.0.1:8131/';

const catatan = [];
const tulis = (s) => { console.log(s); catatan.push(s); };
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

async function ukur(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { ok: false, alasan: 'tidak ada' };
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return { ok: false, alasan: 'ukuran nol' };
    const atas = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { ok: !!atas && (el === atas || el.contains(atas)), x: r.left + r.width / 2, y: r.top + r.height / 2, alasan: atas ? 'tertutup ' + (atas.className || atas.tagName) : 'di luar layar' };
  }, sel);
}
async function klik(page, sel, { deskripsi } = {}) {
  let cek = await ukur(page, sel);
  /* seperti manusia: gulir dulu kalau tombolnya di bawah lipatan layar */
  if (!cek.ok && /di luar layar|tidak ada|ukuran nol/.test(cek.alasan)) {
    await page.evaluate((s) => { const el = document.querySelector(s); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' }); }, sel);
    await tunggu(260);
    cek = await ukur(page, sel);
  }
  if (!cek.ok) throw new Error('klik ' + sel + ' (' + (deskripsi || '') + ') gagal: ' + cek.alasan);
  await page.mouse.click(cek.x, cek.y);
  await tunggu(180);
}

/* ── berkas contoh untuk builder ─────────────────────────────────────── */
const PROYEK_MIRU = {
  nama: 'MIRU Streaming',
  deskripsi: 'Website streaming anime sederhana',
  berkas: [
    { path: 'index.html', isi: '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MIRU</title><link rel="stylesheet" href="styles.css"></head><body><header><h1>MIRU</h1></header><main id="daftar"></main><script src="app.js"></script></body></html>' },
    { path: 'styles.css', isi: 'body{margin:0;background:#0d0d12;color:#eef;font:16px system-ui}\nheader{padding:18px;border-bottom:1px solid #23232e}\n.kartu{border:1px solid #23232e;border-radius:12px;padding:12px;margin:10px}\n' },
    { path: 'app.js', isi: 'console.log("MIRU siap");\nvar daftar=document.getElementById("daftar");\nif(daftar){var d=document.createElement("div");d.className="kartu";d.textContent="Episode 1";daftar.appendChild(d);}\nfetch("/api/daftar-episode").catch(function(){console.log("contoh jaringan")});\n' },
  ],
};
/* proyek yang isinya memicu pemeriksaan pengaman kotak pasir */
const PROYEK_MACET = {
  nama: 'Uji Macet',
  deskripsi: 'Proyek dengan perulangan tanpa henti (untuk menguji pengaman)',
  berkas: [
    { path: 'index.html', isi: '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Macet</title></head><body><h1>Uji macet</h1><script src="app.js"></script></body></html>' },
    { path: 'app.js', isi: 'var i = 0;\nwhile (true) { i = i + 1; }\n' },
  ],
};

const LAPORAN = '## Pendahuluan\n\nKopi arabika tumbuh di dataran tinggi [1].\n\n## Simpulan\n\nSelesai.\n';
const PNG_KECIL = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII=';

async function ujiHalamanBaru(browser) {
  tulis('══ H. riset mendalam · builder · gambar · suara · halaman baru ══');
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 940 });
  const galat = [];
  const badanApi = [];
  page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) galat.push('console: ' + m.text().slice(0, 160)); });
  page.on('dialog', async (d) => { await d.accept(d.message().includes('Ulangi') ? 'kunci-admin-uji' : ''); });

  const SUMBER = [
    { penyedia: 'Wikipedia Indonesia', jenis: 'ensiklopedia', judul: 'Kopi arabika', url: 'https://id.wikipedia.org/wiki/Kopi_arabika', cuplikan: 'Coffea arabica adalah spesies kopi pertama yang dibudidayakan di dataran tinggi.' },
    { penyedia: 'Stack Overflow', jenis: 'tanya-jawab kode', judul: 'Menanam kopi arabika', url: 'https://stackoverflow.com/q/2', cuplikan: 'Diskusi teknis tentang pembibitan kopi dan kelembapan tanah.' },
    { penyedia: 'GitHub', jenis: 'repositori', judul: 'kopi/arabika', url: 'https://github.com/kopi/arabika', cuplikan: 'Alat pencatat panen kopi arabika.' },
    { penyedia: 'Hacker News', jenis: 'diskusi', judul: 'Harga kopi arabika', url: 'https://news.ycombinator.com/item?id=1', cuplikan: 'Perbincangan pasar kopi arabika dunia.' },
  ];
  let gambarKe = 0;
  let modeKuotaHabis = false;   /* dinyalakan di bagian 13 untuk menguji jalur kuota habis */

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/search')) {
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, q: 'kopi', jumlah: SUMBER.length, sumber: SUMBER, catatan: 'uji' }) });
    }
    if (u.includes('/api/providers')) {
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, teks: { penyedia: '9router', alamat: 'https://rqacwx8.abc-tunnel.us/v1', adaKunci: true, kunci: 'sk-nr…cdef', modelTetap: null }, gambar: { penyedia: '9router', model: 'gpt-image-1', siap: true, kunci: 'sk-nr…cdef' }, suara: { stt: { penyedia: '(bawaan browser)', siap: false }, tts: { penyedia: '(bawaan browser)', siap: false, suara: 'alloy' } }, deploy: { penyedia: '(belum diatur)', siap: false }, penjadwal: { penyedia: '(belum diatur)', siap: false }, rateLimit: { terpakai: { total: 42, ditolak: 1 } } }) });
    }
    if (u.includes('/api/cron')) return req.respond({ status: 501, contentType: 'application/json', body: JSON.stringify({ ok: false, butuhKunci: true, pesan: 'Penjadwal sisi-server belum aktif: butuh penyimpanan KV (KV_REST_API_URL + KV_REST_API_TOKEN).' }) });
    if (u.includes('/api/deploy')) return req.respond({ status: 501, contentType: 'application/json', body: JSON.stringify({ ok: false, butuhKunci: true, pesan: 'Deployment otomatis belum aktif (butuh DEPLOY_PROVIDER + DEPLOY_TOKEN milikmu).' }) });
    if (u.includes('/api/image/generate')) {
      gambarKe++;
      if (gambarKe === 1) {
        return req.respond({ status: 501, contentType: 'application/json', body: JSON.stringify({ ok: false, butuhKunci: true, pesan: 'Pembuat gambar belum aktif: gambar dihitung per kredit oleh penyedia, jadi kuncinya harus dipasang dulu.' }) });
      }
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, gambar: 'data:image/png;base64,' + PNG_KECIL, penyedia: '9router', model: 'gpt-image-1', rasio: '1:1', kualitas: 'standar', ms: 12 }) });
    }
    if (u.includes('/api/health')) return req.respond({ status: 200, contentType: 'application/json', body: '{"ok":true,"keyConfigured":true}' });
    if (u.includes('/api/chat')) {
      if (modeKuotaHabis) {
        return req.respond({ status: 429, contentType: 'application/json', body: JSON.stringify({ ok: false, kuota: true, pesan: 'batas permintaan penyedia AI tercapai (paket akunmu di 9Router). Coba lagi menit berikutnya.' }) });
      }
      const badan = req.postData() || '';
      badanApi.push(badan);
      let pesan = '';
      try { pesan = String(JSON.parse(badan).prompt || ''); } catch (e) { pesan = badan; }
      const kirim = (teks) => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: teks, model: 'uji/h' }) });
      if (/Bangun proyek web dari permintaan/i.test(pesan)) {
        if (/risiko-macet/i.test(pesan)) return kirim(JSON.stringify(PROYEK_MACET));
        return kirim(JSON.stringify(PROYEK_MIRU));
      }
      if (/Buat 4 pertanyaan riset/i.test(pesan)) return kirim('1. Sejarah kopi arabika\n2. Budidaya kopi\n3. Pengolahan pascapanen\n4. Konsumsi kopi');
      if (/BAHAN DARI WIKIPEDIA/i.test(pesan)) return kirim(LAPORAN);
      if (/Perbaiki berkas berikut/i.test(pesan)) return kirim('console.log("MIRU siap diperbaiki");\n');
      return kirim('jawaban uji');
    }
    req.continue();
  });

  await page.goto(URL_UJI, { waitUntil: 'networkidle2' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle2' });
  await tunggu(400);

  /* 1. RISET MENDALAM — alur 7 langkah dengan status */
  await page.type('#ta', 'kopi arabika');
  await klik(page, '#chipRiset', { deskripsi: 'riset dalam' });
  if (await page.$('#risetLanjut')) await klik(page, '#risetLanjut', { deskripsi: 'lanjutkan riset' });
  await page.waitForFunction(() => /Laporan riset selesai/.test(document.body.textContent), { timeout: 40000 });
  await tunggu(500);
  const riset = await page.evaluate(() => ({
    judul: document.body.textContent.includes('Riset Mendalam'),
    langkah: [...document.querySelectorAll('.riset-jejak li')].map((l) => l.textContent.trim()),
    sumber: document.querySelectorAll('.riset-sumber li').length,
    cit: document.querySelectorAll('.riset-sumber .cit').length,
    berkas: [...document.querySelectorAll('.kartu-berkas b, .kartu b')].map((b) => b.textContent).join(','),
  }));
  tulis('riset mendalam → ' + riset.langkah.length + ' langkah (' + riset.langkah.slice(0, 3).join(' | ') + '…) · sumber ' + riset.sumber + ' · label penyedia ' + riset.cit);
  if (riset.langkah.length < 5) throw new Error('jejak langkah riset tidak lengkap');
  if (riset.sumber < 2) throw new Error('blok sumber riset kosong');
  const namaRiset = await page.evaluate(() => (JSON.parse(localStorage.getItem('vcs.sesi'))[0].artifacts || []).map((a) => a.nama).join(','));
  tulis('riset mendalam → berkas laporan: ' + namaRiset);
  if (!/^riset-/.test(namaRiset)) throw new Error('berkas laporan riset tidak dibuat');
  await page.screenshot({ path: path.join(SHOT, '40-riset-mendalam.png') });

  /* 2. MODE BERPIKIR — label & larangan menampilkan proses berpikir */
  await klik(page, '#btnMode');
  const mode = await page.evaluate(() => ({
    pilihan: [...document.querySelectorAll('#modeList [data-mode]')].map((b) => (b.querySelector('b') || b).textContent.trim().split('\n')[0]),
    catatan: (document.querySelector('#modeList') || {}).textContent || '',
  }));
  tulis('mode berpikir → ' + JSON.stringify(mode.pilihan));
  if (!mode.pilihan.some((p) => /Berpikir Mendalam/.test(p))) throw new Error('mode "Berpikir Mendalam" tidak ada');
  if (!/tidak ditampilkan/i.test(mode.catatan)) throw new Error('catatan larangan menampilkan proses berpikir tidak ada');
  await page.evaluate(() => { document.querySelector('#modeModal').hidden = true; });

  /* 3. AI BUILDER — 10 langkah → berkas → pratinjau → konsol → uji */
  await page.evaluate(() => { location.hash = '#/builder'; });
  await tunggu(600);
  await page.type('#bgnPrompt', 'Buat website streaming anime bernama MIRU.');
  await klik(page, '#bgnMulai', { deskripsi: 'bangun proyek' });
  await page.waitForFunction(() => document.querySelectorAll('#bgnPohon .ph-it').length >= 3, { timeout: 40000 });
  await tunggu(1800);
  const bangun = await page.evaluate(() => ({
    nama: document.querySelector('#bgnNama').textContent,
    berkas: [...document.querySelectorAll('#bgnPohon .ph-it span')].map((s) => s.textContent),
    jejak: [...document.querySelectorAll('.bgn-jejak li')].map((l) => l.className),
    konsol: document.querySelector('#bgnKonsolHitung').textContent,
    status: document.querySelector('#bgnStatus').textContent,
    srcdoc: (document.querySelector('#bgnPratinjau').srcdoc || '').length,
    uji: document.querySelector('#bgnUji').textContent.slice(0, 60),
  }));
  tulis('builder → " ' + bangun.nama + ' " · berkas ' + JSON.stringify(bangun.berkas) + ' · pratinjau ' + bangun.srcdoc + ' karakter');
  tulis('builder → jejak ' + bangun.jejak.filter((c) => /beres|siap/.test(c)).length + '/10 selesai · konsol: ' + bangun.konsol.trim());
  tulis('builder → uji: ' + bangun.uji.replace(/\s+/g, ' ').trim());
  if (bangun.berkas.length < 3) throw new Error('proyek builder tidak berisi 3 berkas');
  if (bangun.srcdoc < 200) throw new Error('dokumen pratinjau kosong');
  if (!/console|runtime|jaringan/.test(bangun.konsol)) throw new Error('panel konsol tidak melaporkan apa pun');
  if (bangun.jejak.filter((c) => /beres|siap/.test(c)).length < 8) throw new Error('jejak 10 langkah builder belum selesai');
  await page.screenshot({ path: path.join(SHOT, '41-builder.png') });

  /* 3b. konsol benar-benar merekam console.log + jaringan dari dalam iframe */
  await page.waitForFunction(() => /MIRU siap|fetch|contoh jaringan/.test((document.querySelector('#bgnKonsol') || {}).textContent || ''), { timeout: 10000 });
  const konsolIsi = await page.evaluate(() => (document.querySelector('#bgnKonsol').textContent || '').slice(0, 160));
  tulis('builder → isi konsol: ' + konsolIsi.replace(/\s+/g, ' ').trim().slice(0, 90));

  /* 4. EDIT + DIFF → Terima / Tolak / Batalkan */
  await klik(page, '[data-bgn-aksi="edit"]');
  await page.waitForFunction(() => !document.querySelector('#editModal').hidden, { timeout: 5000 });
  const sebelum = await page.evaluate(() => document.querySelector('#bgnKode').textContent.length);
  await page.evaluate(() => {
    const t = document.querySelector('#editorIsi');
    t.value = t.value + '\nconsole.log("baris tambahan dari uji");\n';
  });
  await klik(page, '#editSimpan');
  await page.waitForFunction(() => !document.querySelector('#diffModal').hidden, { timeout: 5000 });
  const diff = await page.evaluate(() => ({
    hitung: document.querySelector('#diffHitung').textContent,
    tambah: document.querySelectorAll('#diffIsi .diff-baris.tambah').length,
    kurang: document.querySelectorAll('#diffIsi .diff-baris.kurang').length,
    tombol: [...document.querySelectorAll('.modal-ft .btn')].slice(0, 3).map((b) => b.textContent.trim()),
  }));
  tulis('diff → ' + diff.hitung + ' · tombol ' + JSON.stringify(diff.tombol));
  if (!diff.tambah) throw new Error('diff tidak menampilkan baris tambahan');
  if (!diff.tombol.some((t) => /Terima/.test(t)) || !diff.tombol.some((t) => /Tolak/.test(t)) || !diff.tombol.some((t) => /Batalkan/.test(t))) throw new Error('tombol Terima/Tolak/Batalkan tidak lengkap');
  await page.screenshot({ path: path.join(SHOT, '42-builder-diff.png') });
  await klik(page, '#diffTerima');
  await tunggu(400);
  const sesudah = await page.evaluate(() => document.querySelector('#bgnKode').textContent.length);
  tulis('diff → diterapkan: isi berkas ' + sebelum + ' → ' + sesudah + ' karakter');
  if (sesudah <= sebelum) throw new Error('perubahan tidak diterapkan setelah Terima');

  /* 4b. EDITOR KODE (butir 28) — nomor baris, sorot sintaks, cari, ganti, rapikan */
  await klik(page, '[data-bgn-buka="styles.css"]', { deskripsi: 'berkas styles.css' });
  await klik(page, '[data-bgn-aksi="edit"]');
  await page.waitForFunction(() => !document.querySelector('#editModal').hidden, { timeout: 5000 });
  await tunggu(300);
  const ed = await page.evaluate(() => ({
    bhs: document.querySelector('#editorBhs').textContent.trim(),
    baris: document.querySelector('#editorNo').textContent.trim().split('\n').length,
    barisIsi: document.querySelector('#editorIsi').value.split('\n').length,
    token: document.querySelectorAll('#editorSorot span').length,
    tombol: [...document.querySelectorAll('.editor-alat .btn')].map((b) => b.textContent.trim()),
  }));
  tulis('editor kode → bahasa ' + ed.bhs + ' · nomor baris ' + ed.baris + '/' + ed.barisIsi + ' · token tersorot ' + ed.token);
  tulis('editor kode → tombol: ' + JSON.stringify(ed.tombol));
  if (ed.bhs !== 'CSS') throw new Error('bahasa berkas tidak dikenali editor');
  if (ed.baris !== ed.barisIsi) throw new Error('nomor baris tidak sinkron dengan isi');
  if (!ed.token) throw new Error('sorot sintaks tidak jalan');
  for (const t2 of ['Cari berikutnya', 'Ganti', 'Ganti semua', 'Rapikan', 'Salin', 'Unduh']) {
    if (!ed.tombol.includes(t2)) throw new Error('tombol editor "' + t2 + '" tidak ada');
  }
  await page.type('#editorCari', 'border');
  await klik(page, '#editorCariLagi');
  const edPilih = await page.evaluate(() => {
    const ta = document.querySelector('#editorIsi');
    return ta.value.slice(ta.selectionStart, ta.selectionEnd);
  });
  if (!/border/i.test(edPilih)) throw new Error('cari di editor tidak menemukan kata');
  await page.evaluate(() => { document.querySelector('#editorGanti').value = 'outline'; });
  await klik(page, '#editorGantiSemua');
  const edGanti = await page.evaluate(() => document.querySelector('#editorIsi').value);
  tulis('editor kode → cari memilih "' + edPilih + '" · ganti semua: border→outline (' + (/outline/.test(edGanti) ? 'berhasil' : 'gagal') + ')');
  if (!/outline/.test(edGanti)) throw new Error('ganti semua tidak bekerja');
  await klik(page, '#editorRapi');
  await tunggu(200);
  const edRapi = await page.evaluate(() => document.querySelector('#editorIsi').value);
  tulis('editor kode → rapikan: ' + edRapi.split('\n').length + ' baris, deklarasi bertingkat: ' + /\n  [a-z-]+:/.test(edRapi));
  if (!/\n  [a-z-]+:/.test(edRapi)) throw new Error('rapikan tidak menata indentasi CSS');
  await klik(page, '#editBatal', { deskripsi: 'batal' });
  await page.waitForFunction(() => document.querySelector('#editModal').hidden, { timeout: 5000 });

  /* 5. UJI + BUILD + ZIP + DEPLOY */
  await klik(page, '[data-bgn-aksi="test"]');
  await tunggu(1400);
  const hasilUji = await page.evaluate(() => (document.querySelector('#bgnUji').textContent || '').replace(/\s+/g, ' ').trim());
  tulis('uji aplikasi → ' + hasilUji.slice(0, 90));
  if (!/pemeriksaan/.test(hasilUji)) throw new Error('hasil uji tidak tampil');
  await klik(page, '[data-bgn-aksi="build"]');
  await page.waitForFunction(() => /Siap deploy/.test(document.querySelector('#bgnStatus').textContent || ''), { timeout: 8000 });
  tulis('build → status "' + (await page.evaluate(() => document.querySelector('#bgnStatus').textContent)) + '"');
  const unduhan = path.join('/tmp', 'unduhan-uji');
  fs.rmSync(unduhan, { recursive: true, force: true });
  fs.mkdirSync(unduhan, { recursive: true });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: unduhan });
  await klik(page, '[data-bgn-aksi="zip"]');
  await page.waitForFunction(() => true);
  for (let i = 0; i < 30; i++) { if (fs.readdirSync(unduhan).length) break; await tunggu(300); }
  const berkasZip = fs.readdirSync(unduhan);
  const zip = berkasZip.length ? fs.readFileSync(path.join(unduhan, berkasZip[0])) : Buffer.alloc(0);
  tulis('ZIP → ' + berkasZip.join(',') + ' · ' + zip.length + ' bita · mulai dengan PK: ' + (zip.slice(0, 2).toString() === 'PK'));
  if (zip.slice(0, 2).toString() !== 'PK') throw new Error('ZIP tidak terbentuk (format salah)');
  await klik(page, '[data-bgn-aksi="deploy"]');
  await tunggu(900);
  const deploy = await page.evaluate(() => ({ status: document.querySelector('#bgnStatus').textContent, toast: (document.querySelector('.toast') || {}).textContent || '' }));
  tulis('deploy → status "' + deploy.status + '" · ' + deploy.toast.slice(0, 60));
  if (!/ZIP|belum aktif/i.test(deploy.status + deploy.toast)) throw new Error('pesan deploy tidak jujur apa adanya');

  /* 5b. kembali ke percakapan lewat tombol "Kembali" (seperti manusia) */
  await klik(page, '#halKembali');
  await page.waitForFunction(() => document.querySelector('#halPage').hidden, { timeout: 6000 });
  await tunggu(300);

  /* 5c. PENGAMAN KOTAK PASIR — kode dengan perulangan tanpa henti TIDAK dijalankan otomatis
     (dulu ini membuat seluruh browser membeku dan klik berikutnya gagal) */
  await page.evaluate(() => { location.hash = '#/builder'; });
  await tunggu(600);
  await page.type('#bgnPrompt', 'Uji risiko-macet: buat halaman dengan animasi terus-menerus.');
  await klik(page, '#bgnMulai');
  await page.waitForFunction(() => /ditahan|Siap deploy|masalah/i.test((document.querySelector('#bgnStatus') || {}).textContent || ''), { timeout: 60000 });
  await tunggu(900);
  const macet = await page.evaluate(() => ({
    status: document.querySelector('#bgnStatus').textContent,
    srcdoc: (document.querySelector('#bgnPratinjau').srcdoc || ''),
    konsol: (document.querySelector('#bgnKonsol').textContent || '').replace(/\s+/g, ' ').slice(0, 200),
    uji: (document.querySelector('#bgnUji').textContent || '').replace(/\s+/g, ' '),
    hidup: typeof document.querySelector('#bgnNama') !== 'undefined',
  }));
  tulis('pengaman sandbox → status: "' + macet.status + '"');
  tulis('pengaman sandbox → konsol: ' + macet.konsol.slice(0, 120));
  tulis('pengaman sandbox → hasil uji: ' + macet.uji.slice(0, 150));
  if (!/ditahan/i.test(macet.srcdoc)) throw new Error('kode berisiko macet tetap dijalankan otomatis');
  if ('data-bgn-paksa' in macet) throw new Error('penanda tak dikenal');
  if (!/perulangan tanpa henti/i.test(macet.konsol + macet.uji)) throw new Error('peringatan perulangan tanpa henti tidak muncul');
  if (!/perulangan tanpa henti/i.test(macet.uji)) throw new Error('hasil uji tidak menandai kode berisiko');
  await page.screenshot({ path: path.join(SHOT, '41b-sandbox-ditahan.png') });

  /* halaman tetap hidup: bisa diklik dan dievaluasi setelahnya */
  const tetapHidup = await page.evaluate(() => !!document.querySelector('#bgnMulai'));
  if (!tetapHidup) throw new Error('aplikasi membeku setelah proyek berisiko');
  tulis('pengaman sandbox → aplikasi tetap responsif (tidak membeku)');

  /* tombol "Tampilkan tanpa skrip" di dalam iframe benar-benar bekerja */
  const bingkai = page.frames().filter((f) => /srcdoc/.test(f.url()) || f !== page.mainFrame()).pop();
  const tombolAman = await bingkai.$('#bgnAman1');
  if (!tombolAman) throw new Error('tombol "Tampilkan tanpa skrip" tidak ada di pratinjau yang ditahan');
  /* geser dulu supaya tombolnya benar-benar terlihat (seperti manusia),
     baru klik sungguhan di titik tengah tombol */
  await tombolAman.scrollIntoView();
  await tunggu(250);
  await tombolAman.click();
  await tunggu(900);
  const setelahAman = await page.evaluate(() => ({
    srcdoc: (document.querySelector('#bgnPratinjau').srcdoc || ''),
    status: document.querySelector('#bgnStatus').textContent,
    konsol: (document.querySelector('#bgnKonsol').textContent || '').replace(/\s+/g, ' ').slice(0, 200),
  }));
  tulis('pengaman sandbox → setelah "tanpa skrip": ' + setelahAman.status);
  if (!/tanpa skrip/i.test(setelahAman.status)) throw new Error('tombol "tanpa skrip" tidak bekerja');
  if (/<script[\s\S]*while \(true\)/i.test(setelahAman.srcdoc)) throw new Error('skrip berisiko masih ikut dijalankan');

  /* kembali ke proyek normal supaya uji berikutnya tidak terganggu */
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('vcs.setelan') || '{}');
    if (s.bangunan && s.bangunan[0] && /Uji Macet/.test(s.bangunan[0].nama)) s.bangunan.shift();
    localStorage.setItem('vcs.setelan', JSON.stringify(s));
  });
  /* kembali ke percakapan (lewat tombol, seperti manusia) */
  await klik(page, '#halKembali');
  await page.waitForFunction(() => document.querySelector('#halPage').hidden, { timeout: 6000 });
  await tunggu(300);

  /* 6. STUDIO GAMBAR — penyedia belum aktif, lalu aktif */
  await klik(page, '#btnPlus');
  await klik(page, '[data-plus="gambar"]');
  await page.waitForFunction(() => !document.querySelector('#imgStudio').hidden, { timeout: 6000 });
  await page.type('#imgPrompt', 'kedai kopi kecil di Surabaya');
  await klik(page, '#imgBuat');
  await page.waitForFunction(() => /belum aktif|belum bisa dipakai/i.test(document.querySelector('#imgStatus').textContent + document.querySelector('#imgHasil').textContent), { timeout: 15000 });
  const gambarGagal = await page.evaluate(() => ({ status: document.querySelector('#imgStatus').textContent, isi: document.querySelector('#imgHasil').textContent.replace(/\s+/g, ' ').slice(0, 70) }));
  tulis('gambar (tanpa kunci) → ' + gambarGagal.status + ' · "' + gambarGagal.isi + '"');
  /* percobaan kedua: penyedia aktif */
  await page.evaluate(() => { window.confirm = () => false; });
  await klik(page, '#imgBuat');
  await page.waitForFunction(() => !!document.querySelector('#imgHasil img'), { timeout: 15000 });
  const gambarOk = await page.evaluate(() => ({ status: document.querySelector('#imgStatus').textContent, ada: !!document.querySelector('#imgHasil img'), simpanAktif: !document.querySelector('#imgSimpan').disabled }));
  tulis('gambar (penyedia aktif) → ' + gambarOk.status + ' · gambar tampil ' + gambarOk.ada + ' · tombol simpan aktif ' + gambarOk.simpanAktif);
  if (!gambarOk.ada) throw new Error('gambar tidak tampil saat penyedia aktif');
  await klik(page, '#imgSimpan');
  await tunggu(400);
  const kePustaka = await page.evaluate(() => (JSON.parse(localStorage.getItem('vcs.setelan')).berkas || []).filter((b) => /gambar-/.test(b.nama)).length);
  tulis('gambar → tersimpan ke pustaka: ' + kePustaka + ' berkas');
  if (!kePustaka) throw new Error('gambar tidak masuk pustaka');
  await page.screenshot({ path: path.join(SHOT, '43-studio-gambar.png') });
  await page.evaluate(() => { document.querySelector('#imgStudio').hidden = true; });

  /* 7. SUARA — bar + tombol + alur */
  await klik(page, '#btnVoice');
  const suara = await page.evaluate(() => ({
    tampil: !document.querySelector('#voiceBar').hidden,
    tombol: [...document.querySelectorAll('.voice-btn .btn')].map((b) => b.textContent.trim()),
    alur: [...document.querySelectorAll('#voiceAlur span')].map((s) => s.textContent.trim()),
  }));
  tulis('suara → tombol ' + JSON.stringify(suara.tombol) + ' · alur ' + suara.alur.length + ' langkah');
  for (const t of ['Mikrofon', 'Mulai Voice', 'Berhenti', 'Mute', 'Speaker']) {
    if (!suara.tombol.includes(t)) throw new Error('tombol suara "' + t + '" tidak ada');
  }
  await klik(page, '#vMute');
  await klik(page, '#vSpeaker');
  await klik(page, '#vBerhenti');
  tulis('suara → Mute & Speaker bisa ditekan, Berhenti menutup alur');
  await clickScreenshot(page, '44-voice.png');
  await page.evaluate(() => { document.querySelector('#voiceBar').hidden = true; });

  /* 8. PENCARIAN GLOBAL */
  await page.keyboard.down('Control'); await page.keyboard.down('Shift');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await page.waitForFunction(() => !document.querySelector('#cariPal').hidden, { timeout: 5000 });
  await page.type('#palQ', 'kopi');
  await tunggu(400);
  const palet = await page.evaluate(() => ({
    grup: [...document.querySelectorAll('#palHasil .palet-grup > b')].map((b) => b.textContent),
    hasil: document.querySelectorAll('#palHasil .palet-it').length,
  }));
  tulis('cari global → grup ' + JSON.stringify(palet.grup) + ' · ' + palet.hasil + ' hasil untuk "kopi"');
  if (!palet.grup.length) throw new Error('pencarian global tidak menemukan apa pun');
  await page.keyboard.press('Escape');
  await tunggu(300);

  /* 9. BAGIKAN + halaman hanya-baca */
  await klik(page, '#btnBagi');
  await klik(page, '#bagiSiapa button[data-v="tautan"]');
  await klik(page, '#bagiBuat');
  await tunggu(300);
  const tautan = await page.evaluate(() => document.querySelector('#bagiTautan').value);
  tulis('bagikan → tautan ' + (tautan ? tautan.length + ' karakter, berisi #/bagi= ' + /#\/bagi=/.test(tautan) : 'TIDAK ADA'));
  if (!/#\/bagi=/.test(tautan)) throw new Error('tautan bagikan tidak terbentuk');
  await page.evaluate(() => { document.querySelector('#bagiModal').hidden = true; });
  await page.goto(tautan, { waitUntil: 'networkidle2' });
  await tunggu(700);
  const halamanBagi = await page.evaluate(() => ({
    tampil: !document.querySelector('#halPage').hidden,
    judul: document.querySelector('#halJudul').textContent,
    pesan: document.querySelectorAll('.bagi-isi .m').length,
    hanyaBaca: /hanya-baca/i.test(document.querySelector('#halSub').textContent + document.querySelector('#halBody').textContent),
  }));
  tulis('halaman bagikan → "' + halamanBagi.judul + '" · ' + halamanBagi.pesan + ' pesan · keterangan hanya-baca ' + halamanBagi.hanyaBaca);
  if (!halamanBagi.pesan) throw new Error('halaman bagikan tidak menampilkan pesan');
  await page.screenshot({ path: path.join(SHOT, '45-bagikan.png') });

  /* 10. PROYEK + MEMORI + TUGAS + PLUGIN */
  await page.goto(URL_UJI + '#/projects', { waitUntil: 'networkidle2' });
  await tunggu(500);
  await page.evaluate(() => { window.prompt = (a, b) => (String(a).includes('Nama proyek') ? 'MIRU' : String(a).includes('Deskripsi') ? 'Website streaming anime' : String(a).includes('Arahan') ? 'Selalu pakai TypeScript' : ''); });
  await klik(page, '#prj18Baru');
  await tunggu(500);
  const prj = await page.evaluate(() => ({
    kartu: document.querySelectorAll('#halBody [data-prj]').length,
    nama: (document.querySelector('#halBody .hal-sec h3') || {}).textContent,
    meta: [...document.querySelectorAll('.proyek-meta span')].map((s) => s.textContent.trim()),
    arahan: (document.querySelector('.preview-ins') || {}).textContent || '',
  }));
  tulis('proyek → ' + prj.kartu + ' kartu (' + (prj.nama || '').trim() + ') · ' + prj.meta.length + ' penghitung: ' + prj.meta.join(' · '));
  tulis('proyek → instruksi otomatis: ' + prj.arahan.replace(/\s+/g, ' ').slice(0, 80));
  if (!/Bahasa jawaban/.test(prj.arahan)) throw new Error('instruksi proyek tidak terbentuk');
  if (prj.meta.length < 7) throw new Error('penghitung proyek belum lengkap (obrolan/file/gambar/memori/tugas/plugin/builder)');
  await page.screenshot({ path: path.join(SHOT, '46-proyek.png') });

  /* setelah ada proyek + berkas + bangunan, indeks pencarian harus punya 5 kelompok */
  await page.keyboard.down('Control'); await page.keyboard.down('Shift');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await page.waitForFunction(() => !document.querySelector('#cariPal').hidden, { timeout: 5000 });
  await page.type('#palQ', ' ');
  await tunggu(450);
  const semuaGrup = await page.evaluate(() => [...document.querySelectorAll('#palHasil .palet-grup > b')].map((b) => b.textContent));
  tulis('cari global → kelompok tersedia: ' + JSON.stringify(semuaGrup));
  const WAJIB_GRUP = ['Obrolan', 'Pesan', 'Proyek', 'File', 'Builder'];
  const kurangGrup = WAJIB_GRUP.filter((g) => !semuaGrup.some((x) => x.indexOf(g) >= 0));
  if (kurangGrup.length) throw new Error('kelompok pencarian kurang: ' + kurangGrup.join(', '));
  await page.keyboard.press('Escape');
  await tunggu(250);

  await page.goto(URL_UJI + '#/scheduled', { waitUntil: 'networkidle2' });
  await tunggu(400);
  await page.type('#tgsNama', 'Periksa website');
  await page.type('#tgsPrompt', 'Setiap Senin pukul 08.00 periksa website utama dan laporkan halaman yang gagal.');
  await page.select('#tgsJadwal', 'mingguan');
  await klik(page, '#tgsTambah18');
  await tunggu(500);
  const tgs = await page.evaluate(() => ({
    jumlah: document.querySelectorAll('#halBody .mini-it').length,
    rincian: [...document.querySelectorAll('#halBody .mini-it small')].map((s) => s.textContent).join(' | '),
    server: (document.querySelector('#halBody .hal-sec:last-child p') || {}).textContent || '',
  }));
  tulis('tugas → ' + tgs.jumlah + ' baris · ' + tgs.rincian.replace(/\s+/g, ' ').slice(0, 120));
  if (!/jadwal:/.test(tgs.rincian) || !/berikutnya:/.test(tgs.rincian)) throw new Error('rincian tugas tidak lengkap (jadwal/berikutnya)');
  if (!/Belum aktif/.test(tgs.server)) throw new Error('status penjadwal server tidak jujur ditampilkan');
  await page.screenshot({ path: path.join(SHOT, '47-tugas.png') });

  await page.goto(URL_UJI + '#/plugins', { waitUntil: 'networkidle2' });
  await tunggu(400);
  const plug = await page.evaluate(() => ({
    jumlah: document.querySelectorAll('.plug').length,
    aktif: document.querySelectorAll('.plug:not(.mati)').length,
    izin: (document.querySelector('.plug dl') || {}).textContent || '',
  }));
  tulis('plugin → ' + plug.jumlah + ' plugin (' + plug.aktif + ' aktif) · izin tertera: ' + /Izin/.test(plug.izin));
  if (/Izin/.test(plug.izin) === false) throw new Error('daftar izin plugin tidak tampil');

  /* 11. SETELAN: ekspor + kunci admin */
  await page.goto(URL_UJI + '#/settings', { waitUntil: 'networkidle2' });
  await tunggu(400);
  const set = await page.evaluate(() => ({
    bagian: [...document.querySelectorAll('.hal-sec h3')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
    penyedia: (document.querySelector('#set18Provider') || {}).textContent.replace(/\s+/g, ' ').slice(0, 120),
  }));
  tulis('setelan → ' + set.bagian.length + ' bagian: ' + set.bagian.join(' · ').slice(0, 200));
  tulis('setelan → status penyedia: ' + set.penyedia);
  /* 14 menu setelan seperti diminta spesifikasi */
  const wajib = ['Profil', 'Umum', 'Tampilan', 'Bahasa', 'Notifikasi', 'Suara', 'Model AI', 'Keamanan', 'Privasi', 'Penyimpanan', 'Memori', 'Plugin', 'Penggunaan', 'Tentang'];
  if (set.bagian.length < 14) throw new Error('menu setelan kurang dari 14: ' + set.bagian.length);
  const kurang = wajib.filter((w) => !set.bagian.some((b) => b.indexOf(w) >= 0));
  if (kurang.length) throw new Error('bagian setelan belum lengkap: ' + kurang.join(', '));

  const unduhan2 = path.join('/tmp', 'unduhan-uji2');
  fs.rmSync(unduhan2, { recursive: true, force: true });
  fs.mkdirSync(unduhan2, { recursive: true });
  const cdp2 = await page.createCDPSession();
  await cdp2.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: unduhan2 });
  await klik(page, '[data-ekspor="sesi-csv"]');
  await klik(page, '[data-ekspor="berkas-csv"]');
  await klik(page, '[data-ekspor="set-json"]');
  for (let i = 0; i < 30; i++) { if (fs.readdirSync(unduhan2).length >= 3) break; await tunggu(300); }
  const berkasEkspor = fs.readdirSync(unduhan2);
  tulis('ekspor → ' + berkasEkspor.join(', '));
  if (berkasEkspor.length < 3) throw new Error('ekspor JSON/TXT/CSV tidak lengkap');
  await page.screenshot({ path: path.join(SHOT, '48-setelan.png') });

  /* 11b. MODEL AI — pilihan model per mode benar-benar dikirim ke server */
  await page.goto(URL_UJI + '#/settings', { waitUntil: 'networkidle2' });
  await tunggu(450);
  await page.select('#set18M_think', 'kr/claude-sonnet-4.5');
  await tunggu(250);
  await page.goto(URL_UJI + '#/', { waitUntil: 'networkidle2' });
  await tunggu(350);
  await klik(page, '#btnMode', { deskripsi: 'chip mode' });
  await klik(page, '#modeList [data-mode="think"]');
  await page.type('#ta', 'halo uji model');
  await klik(page, '#btnSend');
  await page.waitForFunction(() => /jawaban uji/.test(document.body.textContent), { timeout: 20000 });
  const badanModel = badanApi.slice(-1)[0] || '';
  const modelKirim = (badanModel.match(/"model":"([^"]*)"/) || [])[1] || '(kosong)';
  tulis('model AI → mode Berpikir mengirim model "' + modelKirim + '"');
  if (modelKirim !== 'kr/claude-sonnet-4.5') throw new Error('pilihan model di Setelan tidak ikut dikirim');
  /* nama panggilan & bahasa ikut ke instruksi */
  await page.goto(URL_UJI + '#/settings', { waitUntil: 'networkidle2' });
  await tunggu(450);
  await page.type('#set18Nama', 'Rian');
  await page.evaluate(() => { document.querySelector('#set18Nama').dispatchEvent(new Event('change')); });
  await tunggu(200);
  await page.goto(URL_UJI + '#/', { waitUntil: 'networkidle2' });
  await tunggu(300);
  await page.type('#ta', 'panggil aku');
  await klik(page, '#btnSend');
  await page.waitForFunction(() => document.querySelectorAll('.msg.ai').length >= 2, { timeout: 20000 });
  const badanPrj = badanApi.slice(-1)[0] || '';
  tulis('profil → instruksi ikut terkirim: ' + (/Rian/.test(badanPrj) && /bahasa Indonesia/i.test(badanPrj)));
  if (!/Rian/.test(badanPrj)) throw new Error('nama panggilan tidak ikut dikirim ke AI');

  /* 12. ADMIN — gerbang kunci + isi dashboard */
  await page.evaluate(() => { window.prompt = () => 'kunci-admin-uji'; });
  await page.goto(URL_UJI + '#/settings', { waitUntil: 'networkidle2' });
  await tunggu(300);
  await klik(page, '#adm18Set');
  await tunggu(400);
  await page.goto(URL_UJI + '#/admin', { waitUntil: 'networkidle2' });
  await tunggu(500);
  const kunciTampil = await page.evaluate(() => document.querySelector('#halBody').textContent.slice(0, 60));
  tulis('admin (belum masuk) → "' + kunciTampil.replace(/\s+/g, ' ').trim() + '"');
  if (!/terkunci/i.test(kunciTampil)) throw new Error('halaman admin tidak terkunci');
  await klik(page, '#adm18Masuk');
  await tunggu(600);
  const adm = await page.evaluate(() => ({
    peran: document.querySelector('#halSub').textContent.trim(),
    bagian: [...document.querySelectorAll('.hal-sec h3')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
    rate: (document.querySelector('#halBody').textContent.match(/chat 60[^·]*/) || [''])[0],
  }));
  tulis('admin (masuk) → peran "' + adm.peran + '" · bagian: ' + adm.bagian.join(' · ').slice(0, 160));
  tulis('admin → rate limit tampil: "' + adm.rate + '"');
  if (!/admin/.test(adm.peran)) throw new Error('kunci admin benar tapi peran tidak berubah');
  if (!adm.bagian.some((b) => /System Health/.test(b)) || !adm.bagian.some((b) => /Rate Limit/.test(b))) throw new Error('bagian admin belum lengkap');
  await page.waitForFunction(() => !/kerangka|memeriksa/i.test(document.querySelector('#adm18Health').textContent || ''), { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: path.join(SHOT, '49-admin.png') });

  /* 13. KUOTA GRATIS HABIS — pesan jujur, aplikasi tetap bisa dipakai */
  modeKuotaHabis = true;
  await page.evaluate(() => { location.hash = '#/'; });
  await tunggu(600);
  await page.type('#ta', 'halo, uji jalur kuota habis');
  await klik(page, '#btnSend');
  await page.waitForFunction(() => /batas permintaan penyedia/i.test(document.body.textContent), { timeout: 15000 });
  await tunggu(400);
  const kuotaUji = await page.evaluate(() => ({
    galat: [...document.querySelectorAll('.msg')].map((m) => m.innerText).join(' ').replace(/\s+/g, ' '),
    bisaKetik: !document.querySelector('#ta').disabled,
  }));
  await klik(page, '#btnMode');
  const modeKuota = await page.evaluate(() => ((document.querySelector('.mode-kepala') || {}).innerText || '').replace(/\s+/g, ' '));
  await page.keyboard.press('Escape');
  await tunggu(300);
  tulis('kuota habis → pesan: "' + kuotaUji.galat.slice(0, 120) + '"');
  tulis('kuota habis → lembar Mode AI: "' + modeKuota.slice(0, 110) + '"');
  if (!/batas permintaan penyedia/i.test(kuotaUji.galat)) throw new Error('pesan kuota habis tidak tampil');
  if (!kuotaUji.bisaKetik) throw new Error('kotak tulis terkunci saat kuota habis');
  if (!/batas penyedia tercapai \(dari 9Router\)/i.test(modeKuota)) throw new Error('lembar Mode AI masih menjanjikan sisa kuota');
  await page.screenshot({ path: path.join(SHOT, '54-kuota-habis.png') });
  modeKuotaHabis = false;

  /* Dimaafkan & memang diharapkan:
     - "Failed to load resource" untuk berkas contoh di pratinjau;
     - "blocked by CORS policy" dari panggilan fetch di dalam iframe pratinjau:
       iframe kotak pasir punya asal opaque, jadi memanggil API situs ini selalu
       lintas-asal dan diblokir browser — perilaku yang benar untuk sandbox, dan
       panggilan itu tetap tercatat di panel Konsol & Jaringan builder. */
  const DIMAAFKAN = [/Failed to load resource/, /has been blocked by CORS policy/];
  const galatNyata = galat.filter((g) => !DIMAAFKAN.some((r) => r.test(g)));
  tulis('galat JS (bagian H) → ' + (galatNyata.length ? galatNyata.join(' | ') : 'tidak ada'));
  if (galatNyata.length) throw new Error('ada galat JS: ' + galatNyata[0]);
  tulis('permintaan AI yang dipakai uji: ' + badanApi.length);
  await page.close();
}

async function clickScreenshot(page, nama) {
  try { await page.screenshot({ path: path.join(SHOT, nama) }); } catch (e) { }
}

/* ── jalan ─────────────────────────────────────────────────────────── */
let gagal = null;
const browser = await puppeteer.launch({
  headless: true, executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--lang=id-ID'],
});
try {
  await ujiHalamanBaru(browser);
} catch (e) {
  gagal = e;
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(SHOT, 'HASIL-UJI-BAGIAN-H.txt'),
  'perintah : node tools/uji-bagian-h.mjs\nwaktu    : ' + new Date().toISOString() + '\n\n' + catatan.join('\n') + '\n\n' +
  (gagal ? 'HASIL: GAGAL — ' + gagal.message : 'HASIL: SEMUA LULUS') + '\n');
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal.message : '\nHASIL: SEMUA LULUS');
process.exit(gagal ? 1 : 0);
