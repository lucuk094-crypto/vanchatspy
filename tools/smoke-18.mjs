/* smoke-18.mjs — asap cepat (± 10 detik): pastikan semua halaman utama benar-benar
 * terbuka, tombol kunci ada, dan TIDAK ada galat JS. Lebih ringan dari
 * uji-bagian-h.mjs; dipakai untuk memeriksa setelah setiap perubahan kecil.
 *
 *   node tools/smoke-18.mjs            (server uji jalan di :8131)
 */
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
const CHROME = process.env.CHROME || puppeteer.executablePath();
const URL_UJI = process.env.UJI_URL || 'http://127.0.0.1:8131/';
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

let gagal = 0;
const cek = (nama, benar, ket) => {
  console.log((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!benar) gagal++;
};

const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 940 });
const galat = [];
page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') galat.push('console: ' + m.text().slice(0, 160)); });

await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  if (u.includes('/api/providers')) {
    return req.respond({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        teks: { penyedia: '9router', alamat: 'https://rqacwx8.abc-tunnel.us/v1', adaKunci: true, kunci: 'sk-nr…cdef', modelTetap: null },
        gambar: { penyedia: '(belum diatur)', model: 'gpt-image-1', siap: false, kunci: '' },
        suara: { stt: { penyedia: '(bawaan browser)', siap: false }, tts: { penyedia: '(bawaan browser)', siap: false, suara: 'alloy' } },
        deploy: { penyedia: '(belum diatur)', siap: false },
        penjadwal: { penyedia: '(belum diatur)', siap: false },
        rateLimit: { terpakai: { total: 12, ditolak: 0 } },
      }),
    });
  }
  if (u.includes('/api/cron')) {
    return req.respond({ status: 501, contentType: 'application/json', body: JSON.stringify({ ok: false, butuhKunci: true, pesan: 'Penjadwal sisi-server belum aktif: butuh penyimpanan KV.' }) });
  }
  req.continue();
});

try {
  console.log('══ smoke-18: semua halaman & tombol kunci ══');
  await page.goto(URL_UJI, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await tunggu(400);

  const halaman = [
    ['#/builder', 'Proyek Builder', '#bgnMulai'],
    ['#/projects', 'Proyek', '#prj18Baru'],
    ['#/scheduled', 'Tugas Terjadwal', '#tgsTambah18'],
    ['#/settings', 'Pengaturan', '#set18Nama'],
    ['#/plugins', 'Plugin / Aplikasi', '.plug'],
    ['#/admin', 'Dashboard Admin', '#adm18Health'],
  ];
  for (const [hash, judul, penanda] of halaman) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await tunggu(420);
    const st = await page.evaluate((sel) => ({
      tampil: !document.querySelector('#halPage').hidden,
      judul: document.querySelector('#halJudul').textContent.trim(),
      penanda: !!document.querySelector(sel),
      isi: document.querySelector('#halBody').innerHTML.length,
    }), penanda);
    console.log('   · ' + hash + ' → "' + st.judul + '" (' + st.isi + ' bita HTML)');
    cek(hash + ' menampilkan ' + judul, st.tampil && st.judul.length > 2 && st.penanda, st.tampil ? '' : 'halaman tidak tampil');
  }

  /* pustaka punya halamannya sendiri */
  await page.evaluate(() => { location.hash = '#/library'; });
  await tunggu(450);
  cek('#/library membuka Pustaka', await page.evaluate(() => !document.querySelector('#libPage').hidden));

  /* kembali ke percakapan + palet pencarian */
  await page.evaluate(() => { location.hash = '#/'; });
  await tunggu(400);
  await page.keyboard.down('Control'); await page.keyboard.down('Shift');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await page.waitForFunction(() => !document.querySelector('#cariPal').hidden, { timeout: 5000 });
  await page.type('#palQ', 'kopi');
  await tunggu(350);
  cek('palet pencarian (Ctrl+Shift+K) bekerja', await page.evaluate(() => document.querySelectorAll('#palHasil .palet-it, #palHasil .note').length > 0));
  await page.keyboard.press('Escape');
  await tunggu(250);

  /* studio gambar */
  await page.click('[data-plus="gambar"]').catch(async () => {
    await page.click('#btnPlus');
    await tunggu(300);
    await page.click('[data-plus="gambar"]');
  });
  await page.waitForFunction(() => !document.querySelector('#imgStudio').hidden, { timeout: 6000 });
  const studio = await page.evaluate(() => ({
    status: document.querySelector('#imgStatus').textContent.trim(),
    rasio: document.querySelectorAll('#imgRasio button').length,
    kualitas: document.querySelectorAll('#imgKualitas button').length,
  }));
  console.log('   · studio gambar → "' + studio.status.slice(0, 60) + '" · ' + studio.rasio + ' rasio · ' + studio.kualitas + ' kualitas');
  cek('studio gambar terbuka dengan pilihan lengkap', studio.rasio >= 3 && studio.kualitas >= 2);
  cek('status studio jujur soal kunci', /kunci|SVG/i.test(studio.status), studio.status.slice(0, 50));
  await page.evaluate(() => { document.querySelector('#imgStudio').hidden = true; });

  /* suara */
  await page.click('#btnVoice');
  const suara = await page.evaluate(() => ({
    tombol: [...document.querySelectorAll('.voice-btn .btn')].map((b) => b.textContent.trim()),
    alur: document.querySelectorAll('#voiceAlur span').length,
  }));
  console.log('   · suara → ' + JSON.stringify(suara.tombol) + ' · alur ' + suara.alur + ' langkah');
  for (const t of ['Mikrofon', 'Mulai Voice', 'Berhenti', 'Mute', 'Speaker']) cek('tombol suara "' + t + '" ada', suara.tombol.includes(t));
  await page.evaluate(() => { document.querySelector('#voiceBar').hidden = true; });

  /* bagikan */
  await page.click('#btnBagi');
  const bagi = await page.evaluate(() => ({
    pilihan: [...document.querySelectorAll('#bagiSiapa button')].map((b) => b.textContent.trim()),
    masa: [...document.querySelectorAll('#bagiMasa button')].map((b) => b.textContent.trim()),
  }));
  console.log('   · bagikan → ' + JSON.stringify(bagi.pilihan) + ' · masa ' + JSON.stringify(bagi.masa));
  cek('pilihan bagikan lengkap', bagi.pilihan.length >= 2 && bagi.masa.length >= 3);

  const nyata = galat.filter((g) => !/Failed to load resource/.test(g));
  console.log('   · galat JS: ' + (nyata.length ? nyata.join(' | ') : 'tidak ada'));
  cek('tidak ada galat JS', nyata.length === 0, nyata[0] || '');
} catch (e) {
  gagal++;
  console.log('GAGAL: ' + e.message);
}
await browser.close();
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' pemeriksaan' : '\nHASIL: SEMUA LULUS');
process.exit(gagal ? 1 : 0);
